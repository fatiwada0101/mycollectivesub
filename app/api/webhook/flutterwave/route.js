import { NextResponse } from 'next/server.js';
import { supabaseAdmin, broadcastWalletUpdate } from '@/lib/supabase-server.js';
import { rateLimitWebhook } from '@/lib/rate-limit.js';
import { fulfillVerifiedFlutterwaveVoucher } from '@/lib/flutterwave-fulfill.js';

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

function getFlutterwaveFeeAllowance(targetAmount) {
  const target = Number(targetAmount || 0);
  if (!Number.isFinite(target) || target <= 0) return 0;
  return Math.min(100, Math.max(5, Math.ceil(target * 0.035)));
}

function resolveFlutterwaveWalletCredit(flwTx) {
  const grossPaid = resolveFlutterwavePaidAmount(flwTx);
  const amount = Number(flwTx?.amount || 0);
  const chargedAmount = Number(flwTx?.charged_amount || 0);
  const metaIntended = Number(
    flwTx?.meta?.intended_amount ??
    flwTx?.meta?.intendedAmount ??
    flwTx?.['meta.intended_amount'] ??
    0
  );

  if (
    Number.isFinite(metaIntended) &&
    metaIntended > 0 &&
    grossPaid + getFlutterwaveFeeAllowance(metaIntended) >= metaIntended
  ) {
    return Math.round(metaIntended * 100) / 100;
  }

  if (
    amount > 0 &&
    chargedAmount > amount &&
    Number.isInteger(amount) &&
    !Number.isInteger(chargedAmount)
  ) {
    return amount;
  }

  const standardTiers = [100, 200, 250, 300, 500, 1000, 1500, 2000, 2500, 3000, 5000, 10000];
  for (const tier of standardTiers) {
    const allowance = getFlutterwaveFeeAllowance(tier);
    if (grossPaid < tier && grossPaid + allowance >= tier) {
      return tier;
    }
  }

  return grossPaid;
}

/**
 * Flutterwave Webhook Handler
 * POST /api/webhook/flutterwave
 *
 * Handles: charge.completed events
 * Verifies: verif-hash header against stored webhook secret
 * Actions: Credits wallet atomically and broadcasts real-time balance updates
 */
export async function POST(request) {
  // Rate limit: 60 webhook deliveries per minute per IP
  const rateLimited = rateLimitWebhook(request);
  if (rateLimited) return rateLimited;

  try {
    const body = await request.json();
    const hash = request.headers.get('verif-hash');

    // 1. Fetch webhook secret & secret key from app_settings
    let webhookSecret = (process.env.FLUTTERWAVE_WEBHOOK_SECRET || '').trim();
    let secretKey = (process.env.FLUTTERWAVE_SECRET_KEY || '').trim();
    try {
      const { data: flwSetting } = await supabaseAdmin
        .from('app_settings')
        .select('value')
        .eq('key', 'flutterwave')
        .maybeSingle();

      if (flwSetting?.value?.webhook_secret) {
        webhookSecret = flwSetting.value.webhook_secret.trim();
      }
      if (flwSetting?.value?.secret_key) {
        secretKey = flwSetting.value.secret_key.trim();
      }
    } catch (e) {
      console.warn('Could not read webhook secret from settings:', e.message);
    }

    // 2. Verify hash if secret is configured
    if (webhookSecret && hash !== webhookSecret) {
      console.warn('Webhook hash mismatch — rejecting unauthorized delivery');
      return NextResponse.json({ status: 'error', message: 'Invalid hash' }, { status: 401 });
    }

    // 3. Extract transaction data (and verify against Flutterwave API when transaction ID & secretKey exist)
    const rawEventData = body.data || body;
    let eventData = rawEventData;
    if (secretKey && rawEventData?.id && typeof fetch === 'function') {
      try {
        const verifyRes = await fetch(`https://api.flutterwave.com/v3/transactions/${encodeURIComponent(String(rawEventData.id))}/verify`, {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${secretKey}` },
        });
        if (verifyRes.ok) {
          const verifyJson = await verifyRes.json();
          if (verifyJson?.status === 'success' && verifyJson?.data) {
            eventData = {
              ...rawEventData,
              ...verifyJson.data,
              meta: { ...(rawEventData.meta || {}), ...(verifyJson.data.meta || {}) },
            };
          }
        }
      } catch (verifyErr) {
        console.warn('Webhook Flutterwave API verify fallback:', verifyErr.message);
      }
    }

    const txRef = (eventData.tx_ref || '').trim();
    const status = (eventData.status || '').toLowerCase();
    const amount = resolveFlutterwaveWalletCredit(eventData);
    const currency = (eventData.currency || 'NGN').toUpperCase();
    const customerEmail = (eventData.customer?.email || eventData.customer_email || '').trim().toLowerCase();

    const metaUserId = eventData.meta?.user_id || eventData.meta?.userId || eventData['meta.user_id'];
    const metaType = eventData.meta?.type || eventData['meta.type'];

    // Only process successful charges
    if (status !== 'successful' && status !== 'completed') {
      return NextResponse.json({ status: 'ignored', reason: 'not successful' });
    }

    if (currency && currency !== 'NGN') {
      return NextResponse.json({ status: 'ignored', reason: 'unsupported currency' });
    }

    if (!amount || amount <= 0) {
      return NextResponse.json({ status: 'ignored', reason: 'invalid amount' });
    }

    // 4. Strictly identify guest wallet top-up, registered wallet top-up, or direct voucher purchase
    const metaGuestToken = (eventData.meta?.guest_token || eventData['meta.guest_token'] || '').trim();
    const isGuestWalletTopup =
      (txRef.startsWith('FLW_GTOPUP_') || metaType === 'guest_wallet_topup') &&
      /^gw_[a-f0-9]{24,64}$/i.test(metaGuestToken);

    if (isGuestWalletTopup) {
      const { data: insertedGuestTx, error: guestTxErr } = await supabaseAdmin
        .from('transactions')
        .upsert({
          user_id: null,
          type: 'wallet_topup',
          amount,
          status: 'successful',
          flw_ref: txRef,
          payment_method: 'card',
          metadata: {
            gateway: 'flutterwave',
            guest_token: metaGuestToken,
            customer_email: customerEmail || null,
            transaction_id: eventData.id || null,
            charged_amount: Number(eventData.charged_amount || amount),
            app_fee: Number(eventData.app_fee || 0),
            amount_settled: Number(eventData.amount_settled || amount),
          },
        }, { onConflict: 'flw_ref', ignoreDuplicates: true })
        .select('id, amount, flw_ref')
        .maybeSingle();

      if (guestTxErr) {
        console.error('Webhook guest wallet tx upsert error:', guestTxErr);
        return NextResponse.json({ status: 'error', message: 'Failed to record guest deposit' }, { status: 500 });
      }

      let guestBalance = null;
      if (insertedGuestTx?.id) {
        const { data: newGuestBal, error: guestRpcErr } = await supabaseAdmin.rpc('adjust_guest_wallet_balance', {
          p_guest_token: metaGuestToken,
          p_amount: amount,
          p_operation: 'add',
          p_email: customerEmail || null,
        });
        if (guestRpcErr) {
          console.error('Webhook adjust_guest_wallet_balance error:', guestRpcErr);
          return NextResponse.json({ status: 'error', message: 'Failed to credit guest wallet' }, { status: 500 });
        }
        guestBalance = Number(newGuestBal);
      } else {
        const { data: existingGuestW } = await supabaseAdmin
          .from('guest_wallets')
          .select('balance')
          .eq('guest_token', metaGuestToken)
          .maybeSingle();
        guestBalance = Number(existingGuestW?.balance || 0);
      }

      return NextResponse.json({
        status: 'success',
        action: insertedGuestTx?.id ? 'guest_wallet_credit' : 'already_processed',
        amount,
        balance: guestBalance,
        guest_token: metaGuestToken,
        tx_ref: txRef,
      });
    }

    const isWalletTopup = txRef.startsWith('FLW_TOPUP_') || metaType === 'wallet_topup';

    if (!isWalletTopup) {
      // Fulfill direct guest / logged-in voucher purchases automatically on the server!
      // Critical for mobile bank transfers (OPay, PalmPay, Moniepoint) where switching apps
      // closes or reloads the captive portal before the browser JS callback can fire.
      const isVoucherPurchase =
        metaType === 'voucher_purchase' ||
        !!eventData.meta?.plan_id ||
        !!eventData.meta?.plan_name ||
        txRef.startsWith('FLW_');

      if (isVoucherPurchase && typeof fulfillVerifiedFlutterwaveVoucher === 'function') {
        const fulfilled = await fulfillVerifiedFlutterwaveVoucher(eventData, { tx_ref: txRef });
        if (fulfilled.ok) {
          return NextResponse.json({
            status: 'success',
            action: fulfilled.idempotent ? 'already_issued' : 'voucher_issued',
            voucher_code: fulfilled.voucher_code,
            plan: fulfilled.plan,
            tx_ref: txRef,
          });
        }
        console.warn(`Webhook voucher fulfillment warning for ${txRef}:`, fulfilled.error);
        return NextResponse.json({
          status: 'acknowledged',
          message: fulfilled.error || 'Voucher fulfillment deferred',
          tx_ref: txRef,
        });
      }

      return NextResponse.json({
        status: 'acknowledged',
        message: 'Non-wallet topup event received',
        tx_ref: txRef,
      });
    }

    // 5. Resolve user ID:
    // Strategy A: Direct meta user_id (attached during FlutterwaveCheckout)
    let userId = null;
    if (metaUserId) {
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('id', metaUserId)
        .maybeSingle();

      if (profile?.id) {
        userId = profile.id;
      }
    }

    // Strategy B: Match customer email against auth.users
    if (!userId && customerEmail) {
      try {
        const { data: authData } = await supabaseAdmin.auth.admin.listUsers();
        const matched = authData?.users?.find(
          (u) => (u.email || '').trim().toLowerCase() === customerEmail
        );
        if (matched?.id) {
          userId = matched.id;
        }
      } catch (authErr) {
        console.warn('Webhook user lookup by email error:', authErr.message);
      }
    }

    if (!userId) {
      console.warn(`Webhook: Unable to map customer "${customerEmail}" or meta "${metaUserId}" to an existing user.`);
      return NextResponse.json({
        status: 'ignored',
        reason: 'user not found',
        tx_ref: txRef,
      });
    }

    // 6. ATOMIC IDEMPOTENCY:
    // Insert into transactions with unique constraint on flw_ref.
    // If flw_ref already exists, upsert with ignoreDuplicates returns no row,
    // guaranteeing no duplicate wallet credit occurs.
    const { data: insertedTx, error: txInsertErr } = await supabaseAdmin
      .from('transactions')
      .upsert({
        user_id: userId,
        type: 'wallet_topup',
        amount,
        status: 'successful',
        flw_ref: txRef,
        payment_method: 'card',
        metadata: {
          gateway: 'flutterwave',
          transaction_id: eventData.id || null,
          charged_amount: Number(eventData.charged_amount || amount),
          app_fee: Number(eventData.app_fee || 0),
          amount_settled: Number(eventData.amount_settled || amount),
        },
      }, { onConflict: 'flw_ref', ignoreDuplicates: true })
      .select('id, user_id, amount, flw_ref, status, created_at')
      .maybeSingle();

    if (txInsertErr) {
      console.error('Webhook transaction upsert error:', txInsertErr);
      return NextResponse.json({ status: 'error', message: 'Failed to record transaction' }, { status: 500 });
    }

    let finalBalance = null;

    if (insertedTx?.id) {
      // First-time processing: adjust wallet balance
      const { data: newBalance, error: rpcErr } = await supabaseAdmin
        .rpc('adjust_wallet_balance', {
          p_user_id: userId,
          p_amount: amount,
          p_operation: 'add',
        });

      if (rpcErr) {
        console.error('Webhook RPC adjust_wallet_balance error:', rpcErr);
        return NextResponse.json({ status: 'error', message: 'Failed to credit wallet' }, { status: 500 });
      }

      finalBalance = Number(newBalance);

      // In-app notification
      try {
        await supabaseAdmin
          .from('notifications')
          .insert({
            user_id: userId,
            title: 'Wallet Credited',
            message: `₦${amount.toLocaleString()} has been added to your wallet via Flutterwave.`,
            type: 'wallet_credit',
          });
      } catch (notifErr) {
        console.warn('Webhook notification insert error:', notifErr?.message || notifErr);
      }

      // Instant Real-time Broadcast to all user's active client tabs
      await broadcastWalletUpdate(userId, finalBalance, {
        amount,
        flw_ref: txRef,
        transaction: insertedTx,
      });

      console.log(`Webhook: Successfully credited ₦${amount} to user ${userId}. New balance: ₦${finalBalance}`);
    } else {
      console.log(`Webhook: flw_ref ${txRef} already processed (idempotency hit)`);
      const { data: currentWallet } = await supabaseAdmin
        .from('wallets')
        .select('balance')
        .eq('user_id', userId)
        .maybeSingle();
      finalBalance = Number(currentWallet?.balance || 0);
    }

    return NextResponse.json({
      status: 'success',
      action: insertedTx?.id ? 'wallet_credit' : 'already_processed',
      amount,
      balance: finalBalance,
      user_id: userId,
      tx_ref: txRef,
    });
  } catch (error) {
    console.error('Webhook unhandled error:', error);
    return NextResponse.json({ status: 'error', message: error.message }, { status: 500 });
  }
}

// GET endpoint to verify webhook health and reachability
export async function GET() {
  return NextResponse.json({
    status: 'active',
    service: 'Flutterwave Webhook',
    endpoint: '/api/webhook/flutterwave',
    methods: ['POST', 'GET'],
  });
}
