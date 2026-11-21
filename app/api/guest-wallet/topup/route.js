import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { logger } from '@/lib/logger';
import {
  resolveFlutterwavePaidAmount,
  getFlutterwaveWalletFeeTolerance,
  resolveFlutterwaveWalletCredit,
} from '@/lib/flutterwave-fees.js';
import { getFlutterwaveSecretKey } from '@/lib/flutterwave-fulfill.js';

const GUEST_TOKEN_REGEX = /^gw_[a-f0-9]{24,64}$/i;

/**
 * POST /api/guest-wallet/topup
 * Verifies a Flutterwave payment (by transaction_id OR flw_ref via verify_by_reference)
 * and atomically credits the tamper-proof `guest_wallets` balance.
 */
export async function POST(request) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const guestToken = String(body.guest_token || '').trim();
    const flwRef = String(body.flw_ref || '').trim();
    const transactionId = body.transaction_id ? String(body.transaction_id).trim() : '';
    const requestedAmount = Number(body.amount || 0);
    const email = String(body.email || '').trim().toLowerCase();
    const checkOnly = body.check_only === true;

    if (!GUEST_TOKEN_REGEX.test(guestToken)) {
      return NextResponse.json({ error: 'Valid guest_token is required' }, { status: 400 });
    }
    if (!flwRef && !transactionId) {
      return NextResponse.json({ error: 'flw_ref or transaction_id is required' }, { status: 400 });
    }

    // 1. Idempotency check — return immediately if already processed (e.g. by webhook!)
    if (flwRef) {
      const { data: existingTx } = await supabaseAdmin
        .from('transactions')
        .select('id, type, amount, metadata')
        .eq('flw_ref', flwRef)
        .maybeSingle();

      if (existingTx?.id) {
        if (existingTx.type && existingTx.type !== 'wallet_topup') {
          return NextResponse.json({ error: 'This payment reference is not a guest wallet deposit' }, { status: 400 });
        }
        const txToken = existingTx.metadata?.guest_token;
        if (!txToken || txToken !== guestToken) {
          return NextResponse.json({ error: 'This deposit reference belongs to another wallet' }, { status: 403 });
        }
        const { data: walletRow } = await supabaseAdmin
          .from('guest_wallets')
          .select('balance')
          .eq('guest_token', guestToken)
          .maybeSingle();

        return NextResponse.json({
          success: true,
          status: 'fulfilled',
          amount: Number(existingTx.amount || requestedAmount),
          balance: Number(walletRow?.balance || 0),
          reference: flwRef,
          duplicate: true,
        });
      }
    }

    // 2. Verify with Flutterwave API (supports BOTH transaction_id AND verify_by_reference!)
    const secretKey = await getFlutterwaveSecretKey();
    if (!secretKey) {
      return NextResponse.json({ error: 'Payment verification is not configured on the server' }, { status: 503 });
    }

    let flwTx = null;
    try {
      const verifyUrl = transactionId
        ? `https://api.flutterwave.com/v3/transactions/${encodeURIComponent(transactionId)}/verify`
        : `https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=${encodeURIComponent(flwRef)}`;

      const flwRes = await fetch(verifyUrl, {
        method: 'GET',
        headers: { Authorization: `Bearer ${secretKey}`, 'Content-Type': 'application/json' },
        cache: 'no-store',
        signal: AbortSignal.timeout(10000),
      });

      if (!flwRes.ok) {
        if (checkOnly) return NextResponse.json({ success: false, status: 'pending' });
        return NextResponse.json({ error: 'Payment not confirmed by Flutterwave yet' }, { status: 400 });
      }

      const flwData = await flwRes.json();
      const flwStatus = String(flwData?.data?.status || '').toLowerCase();
      if (flwData?.status !== 'success' || (flwStatus !== 'successful' && flwStatus !== 'completed')) {
        if (checkOnly) return NextResponse.json({ success: false, status: 'pending' });
        return NextResponse.json({ error: 'Payment was not successful or is still pending' }, { status: 400 });
      }
      flwTx = flwData.data;
    } catch (flwErr) {
      if (checkOnly) return NextResponse.json({ success: false, status: 'pending' });
      return NextResponse.json({ error: 'Unable to verify with Flutterwave: ' + flwErr.message }, { status: 502 });
    }

    if (flwTx.currency && String(flwTx.currency).toUpperCase() !== 'NGN') {
      return NextResponse.json({ error: 'Invalid transaction currency' }, { status: 400 });
    }

    if (flwTx.tx_ref && flwRef && flwTx.tx_ref !== flwRef) {
      return NextResponse.json({ error: 'Transaction reference mismatch' }, { status: 400 });
    }

    const authoritativeRef = String(flwTx.tx_ref || flwRef || '').trim();
    const flwMetaType = String(flwTx.meta?.type || '').toLowerCase();
    const isGuestTopupTx =
      authoritativeRef.startsWith('FLW_GTOPUP_') || flwMetaType === 'guest_wallet_topup';

    if (
      !isGuestTopupTx ||
      flwMetaType === 'voucher_purchase' ||
      flwMetaType === 'wallet_topup' ||
      authoritativeRef.startsWith('FLW_TOPUP_')
    ) {
      return NextResponse.json({
        error: 'Only Guest Wallet top-up payments can credit a guest wallet.',
      }, { status: 400 });
    }

    const metaToken = String(flwTx.meta?.guest_token || '').trim();
    if (!metaToken || metaToken !== guestToken) {
      return NextResponse.json({ error: 'Deposit token mismatch or missing guest wallet token' }, { status: 403 });
    }

    const creditAmount = resolveFlutterwaveWalletCredit(flwTx, requestedAmount);
    const verifiedPaid = resolveFlutterwavePaidAmount(flwTx);

    if (!Number.isFinite(creditAmount) || creditAmount <= 0) {
      return NextResponse.json({ error: 'Invalid verified deposit amount' }, { status: 400 });
    }

    if (requestedAmount > 0 && verifiedPaid + getFlutterwaveWalletFeeTolerance(requestedAmount) < requestedAmount) {
      return NextResponse.json({
        error: `Verified deposit (₦${verifiedPaid}) does not match (₦${requestedAmount})`,
      }, { status: 400 });
    }

    // 3. Atomic idempotency: insert transaction row first (UNIQUE on flw_ref)
    const { data: insertedTx, error: txErr } = await supabaseAdmin
      .from('transactions')
      .upsert({
        user_id: null,
        type: 'wallet_topup',
        amount: creditAmount,
        status: 'successful',
        flw_ref: authoritativeRef,
        payment_method: 'card',
        metadata: {
          gateway: 'flutterwave',
          guest_token: guestToken,
          customer_email: email || flwTx.customer?.email || null,
          transaction_id: flwTx.id || transactionId || null,
          charged_amount: Number(flwTx.charged_amount || verifiedPaid || creditAmount),
          app_fee: Number(flwTx.app_fee || 0),
          amount_settled: Number(flwTx.amount_settled || creditAmount),
        },
      }, { onConflict: 'flw_ref', ignoreDuplicates: true })
      .select('id, amount, flw_ref, status, created_at')
      .maybeSingle();

    if (txErr) {
      console.error('Guest topup transaction insert error:', txErr);
      return NextResponse.json({ error: 'Failed to record guest deposit' }, { status: 500 });
    }

    let finalBalance = 0;
    if (insertedTx?.id) {
      const { data: newBal, error: rpcErr } = await supabaseAdmin.rpc('adjust_guest_wallet_balance', {
        p_guest_token: guestToken,
        p_amount: creditAmount,
        p_operation: 'add',
        p_email: email || flwTx.customer?.email || null,
      });

      if (rpcErr) {
        console.error('adjust_guest_wallet_balance RPC error:', rpcErr);
        // Clean up orphaned transaction row so subsequent retries are not blocked by flw_ref idempotency
        try { await supabaseAdmin.from('transactions').delete().eq('id', insertedTx.id); } catch {}
        return NextResponse.json({ error: 'Failed to credit guest wallet' }, { status: 500 });
      }
      finalBalance = Number(newBal);

      logger.financial({
        action: 'guest_wallet_topup',
        amount: creditAmount,
        userId: guestToken,
        ref: authoritativeRef,
        status: 'successful',
        balanceAfter: finalBalance,
        details: { transaction_id: flwTx.id || transactionId, provider: 'flutterwave' },
      }, logger.getCorrelationId(request));
    } else {
      const { data: walletRow } = await supabaseAdmin
        .from('guest_wallets')
        .select('balance')
        .eq('guest_token', guestToken)
        .maybeSingle();
      finalBalance = Number(walletRow?.balance || 0);
    }

    return NextResponse.json({
      success: true,
      status: 'fulfilled',
      amount: creditAmount,
      balance: finalBalance,
      reference: authoritativeRef,
      message: `₦${creditAmount.toLocaleString()} added to your Guest Wallet`,
    });
  } catch (error) {
    console.error('POST /api/guest-wallet/topup error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
