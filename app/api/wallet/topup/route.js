import { fulfillMonnifyPayment } from '@/lib/monnify.js';
import { NextResponse } from 'next/server.js';
import { supabaseAdmin, broadcastWalletUpdate } from '@/lib/supabase-server.js';
import { validateUserAuth, userUnauthorizedResponse } from '@/lib/user-auth.js';
import { validateBody, walletTopupSchema } from '@/lib/schemas.js';
import { logger } from '@/lib/logger.js';

function resolveFlutterwavePaidAmount(flwTx) {
  const amount = Number(flwTx?.amount || 0);
  const chargedAmount = Number(flwTx?.charged_amount || 0);
  const appFee = Math.max(0, Number(flwTx?.app_fee || 0));
  const merchantFee = Math.max(0, Number(flwTx?.merchant_fee || 0));
  const amountSettled = Number(flwTx?.amount_settled);

  let grossPaid = Math.max(
    Number.isFinite(amount) ? amount : 0,
    Number.isFinite(chargedAmount) ? chargedAmount : 0
  );

  if (appFee > 0 || merchantFee > 0) {
    const feeNoVat = Math.round((appFee + merchantFee) * 100) / 100;
    const feeWithVat = Math.ceil((appFee * 1.075 + merchantFee) * 100) / 100;
    const maxReasonableFee = Math.max(10, grossPaid * 0.06);

    const settledMatchesAmount =
      Number.isFinite(amountSettled) &&
      amountSettled > 0 &&
      Math.abs(amountSettled - amount) <= 0.05;

    const noSettledField = !Number.isFinite(amountSettled) || amountSettled <= 0;
    const candidateNoVat = Math.round((amount + feeNoVat) * 100) / 100;
    const candidateWithVat = Math.round((amount + feeWithVat) * 100) / 100;

    if (settledMatchesAmount) {
      if (Math.abs(candidateWithVat - Math.round(candidateWithVat)) <= 0.05) {
        grossPaid = Math.max(grossPaid, Math.round(candidateWithVat));
      } else if (Math.abs(candidateNoVat - Math.round(candidateNoVat)) <= 0.05) {
        grossPaid = Math.max(grossPaid, Math.round(candidateNoVat));
      } else {
        grossPaid = Math.max(grossPaid, candidateNoVat, candidateWithVat);
      }
    } else if (noSettledField && feeNoVat <= maxReasonableFee) {
      if (Math.abs(candidateWithVat - Math.round(candidateWithVat)) <= 0.05) {
        grossPaid = Math.max(grossPaid, Math.round(candidateWithVat));
      } else if (Math.abs(candidateNoVat - Math.round(candidateNoVat)) <= 0.05) {
        grossPaid = Math.max(grossPaid, Math.round(candidateNoVat));
      }
    }
  }

  return grossPaid;
}

export async function POST(request) {
  try {
    const { data: body, error: validationError } = await validateBody(walletTopupSchema, request);
    if (validationError) return validationError;

    const { amount, user_id, flw_ref, transaction_id, gateway } = body;

    // 1. User Authentication Guard
    const authUser = await validateUserAuth(request);
    if (!authUser) {
      return userUnauthorizedResponse('Authentication required to top up wallet');
    }

    if (user_id && authUser.id !== user_id) {
      return NextResponse.json({ error: 'Unauthorized: Cannot top up another user wallet' }, { status: 403 });
    }
    const effectiveUserId = authUser.id;

    const numericAmount = Number(amount);
    const ref = flw_ref || `FLW_TOPUP_${Date.now()}_${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

    // Monnify owns the amount/reference/purpose on the server-created checkout order.
    if (gateway === 'monnify' || ref.startsWith('MNF_')) {
      try {
        return NextResponse.json(await fulfillMonnifyPayment(flw_ref, {
          purpose: 'wallet_topup', userId: effectiveUserId, transactionId: transaction_id,
        }));
      } catch (error) {
        return NextResponse.json({ error: error.message }, { status: error.status || 503 });
      }
    }

    // 2. IDEMPOTENCY: Check if this ref was already processed
    const { data: existingTx } = await supabaseAdmin
      .from('transactions')
      .select('id, amount')
      .eq('flw_ref', ref)
      .maybeSingle();

    if (existingTx) {
      const { data: walletData } = await supabaseAdmin
        .from('wallets')
        .select('balance')
        .eq('user_id', effectiveUserId)
        .maybeSingle();

      return NextResponse.json({
        success: true,
        amount: Number(existingTx.amount || numericAmount),
        balance: Number(walletData?.balance || 0),
        reference: ref,
        message: 'Already processed',
        duplicate: true,
      });
    }

    // 3. Determine active gateway
    let activeGateway = gateway || 'flutterwave';
    try {
      const { data: gwSetting } = await supabaseAdmin
        .from('app_settings')
        .select('value')
        .eq('key', 'payment_gateway')
        .maybeSingle();
      if (!gateway && gwSetting?.value?.active) {
        activeGateway = gwSetting.value.active;
      }
    } catch (e) {}

    if (!transaction_id) {
      return NextResponse.json({
        error: 'Missing transaction_id for payment verification.',
      }, { status: 400 });
    }

    // 4. Verify with appropriate gateway
    if (activeGateway === 'monnify') {
      return NextResponse.json({ error: 'Initialize a Monnify order before verification' }, { status: 400 });
    }
    let flwVerifiedTx = null;
    {
      // ── FLUTTERWAVE VERIFICATION ──
      let secretKey = process.env.FLUTTERWAVE_SECRET_KEY;
      try {
        const { data: flwSetting } = await supabaseAdmin
          .from('app_settings')
          .select('value')
          .eq('key', 'flutterwave')
          .maybeSingle();
        if (flwSetting?.value?.secret_key) {
          secretKey = flwSetting.value.secret_key.trim();
        }
      } catch (e) {}

      if (!secretKey) {
        return NextResponse.json({
          error: 'Payment verification service is not configured. Please contact support.',
        }, { status: 503 });
      }

      try {
        const flwRes = await fetch(`https://api.flutterwave.com/v3/transactions/${encodeURIComponent(String(transaction_id))}/verify`, {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${secretKey}` },
        });

        if (!flwRes.ok) {
          return NextResponse.json({ error: 'Failed to verify transaction with Flutterwave' }, { status: 400 });
        }

        const flwData = await flwRes.json();
        const flwStatus = String(flwData.data?.status || '').toLowerCase();
        if (flwData.status !== 'success' || (flwStatus !== 'successful' && flwStatus !== 'completed')) {
          return NextResponse.json({ error: 'Payment was not successful or was declined' }, { status: 400 });
        }

        flwVerifiedTx = flwData.data || {};
        const verifiedAmount = resolveFlutterwavePaidAmount(flwVerifiedTx);
        const feeAllowance = Math.min(100, Math.max(5, Math.ceil(numericAmount * 0.035)));
        if (verifiedAmount + feeAllowance < numericAmount) {
          return NextResponse.json({ error: `Verified deposit (₦${verifiedAmount}) does not match (₦${numericAmount})` }, { status: 400 });
        }

        if (flwVerifiedTx.tx_ref && flw_ref && flwVerifiedTx.tx_ref !== flw_ref) {
          return NextResponse.json({ error: 'Transaction reference mismatch' }, { status: 400 });
        }

        if (flwVerifiedTx.currency && String(flwVerifiedTx.currency).toUpperCase() !== 'NGN') {
          return NextResponse.json({ error: 'Invalid transaction currency' }, { status: 400 });
        }
      } catch (flwErr) {
        console.error('Flutterwave topup verify error:', flwErr);
        return NextResponse.json({ error: 'Unable to verify with Flutterwave: ' + flwErr.message }, { status: 502 });
      }
    }

    // Use authoritative reference from gateway if present
    const authoritativeRef = flwVerifiedTx?.tx_ref || ref;

    // 4. ATOMIC idempotency: Insert transaction first
    const { data: insertedTx, error: txInsertErr } = await supabaseAdmin
      .from('transactions')
      .upsert({
        user_id: effectiveUserId,
        type: 'wallet_topup',
        amount: numericAmount,
        status: 'successful',
        flw_ref: authoritativeRef,
        payment_method: 'card',
        metadata: {
          gateway: 'flutterwave',
          transaction_id,
          charged_amount: Number(flwVerifiedTx?.charged_amount || numericAmount),
          app_fee: Number(flwVerifiedTx?.app_fee || 0),
          amount_settled: Number(flwVerifiedTx?.amount_settled || numericAmount),
        },
      }, { onConflict: 'flw_ref', ignoreDuplicates: true })
      .select('id, user_id, amount, flw_ref, status, created_at')
      .maybeSingle();

    if (txInsertErr) {
      console.error('Error inserting transaction:', txInsertErr);
      return NextResponse.json({ error: 'Failed to record transaction' }, { status: 500 });
    }

    let finalBalance = 0;

    // Only credit wallet if newly inserted (not already credited by concurrent webhook)
    if (insertedTx?.id) {
      const { data: newBalance, error: rpcErr } = await supabaseAdmin
        .rpc('adjust_wallet_balance', {
          p_user_id: effectiveUserId,
          p_amount: numericAmount,
          p_operation: 'add',
        });

      if (rpcErr) {
        console.error('RPC wallet credit error:', rpcErr);
        return NextResponse.json({ error: 'Failed to update wallet balance' }, { status: 500 });
      }

      finalBalance = Number(newBalance);

      logger.financial({
        action: 'wallet_topup',
        amount: numericAmount,
        userId: effectiveUserId,
        ref,
        status: 'successful',
        balanceAfter: finalBalance,
        details: { transaction_id, provider: 'flutterwave' },
      }, logger.getCorrelationId(request));

      // Create notification
      try {
        await supabaseAdmin.from('notifications').insert({
          user_id: effectiveUserId,
          title: 'Wallet Topped Up',
          message: `₦${numericAmount.toLocaleString()} has been added to your wallet.`,
          type: 'wallet_credit',
        });
      } catch (e) {}

      // Realtime Broadcast
      await broadcastWalletUpdate(effectiveUserId, finalBalance, {
        amount: numericAmount,
        flw_ref: ref,
        transaction: insertedTx,
      });
    } else {
      const { data: wData } = await supabaseAdmin
        .from('wallets')
        .select('balance')
        .eq('user_id', effectiveUserId)
        .maybeSingle();
      finalBalance = Number(wData?.balance || 0);
    }

    return NextResponse.json({
      success: true,
      amount: numericAmount,
      balance: finalBalance,
      reference: ref,
      message: `₦${numericAmount.toLocaleString()} added to wallet`,
    });
  } catch (error) {
    console.error('Topup error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
