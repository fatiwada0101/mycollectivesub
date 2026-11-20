import { fulfillMonnifyPayment } from '@/lib/monnify.js';
import { validateUserAuth } from '@/lib/user-auth.js';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { createOrQueueHotspotUser, isMikroTikConfigured, calculateExpiresAt } from '@/lib/mikrotik';
import { generateUniqueCode } from '@/lib/voucher-utils.js';
import { validateBody, verifyPaymentSchema } from '@/lib/schemas';
import { logger } from '@/lib/logger';
import { sendVoucherSms } from '@/lib/sms';

async function verifyFlutterwaveTransaction(transactionId, txRef) {
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
  } catch (e) {
    console.warn('Could not read flutterwave setting from DB:', e.message);
  }

  if (!secretKey) {
    return {
      errorResponse: NextResponse.json({
        error: 'Payment verification is not available because Flutterwave Secret Key is not configured on the server. Please contact administrator.',
      }, { status: 503 }),
    };
  }

  try {
    const flwRes = await fetch(`https://api.flutterwave.com/v3/transactions/${encodeURIComponent(String(transactionId))}/verify`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!flwRes.ok) {
      return {
        errorResponse: NextResponse.json({ error: 'Failed to verify payment with payment gateway' }, { status: 400 }),
      };
    }

    const flwData = await flwRes.json();
    if (flwData.status !== 'success' || flwData.data?.status !== 'successful') {
      return {
        errorResponse: NextResponse.json({ error: 'Payment was not successful or was declined' }, { status: 400 }),
      };
    }

    if (flwData.data?.tx_ref && txRef && flwData.data.tx_ref !== txRef) {
      return {
        errorResponse: NextResponse.json({ error: 'Payment transaction reference mismatch' }, { status: 400 }),
      };
    }

    if (flwData.data?.currency && flwData.data.currency !== 'NGN') {
      return {
        errorResponse: NextResponse.json({ error: 'Invalid currency for transaction' }, { status: 400 }),
      };
    }

    return { data: flwData.data };
  } catch (flwErr) {
    console.error('Flutterwave verify error:', flwErr);
    return {
      errorResponse: NextResponse.json({ error: 'Unable to verify payment with gateway: ' + flwErr.message }, { status: 502 }),
    };
  }
}

export async function POST(request) {
  try {
    const { data: body, error: validationError } = await validateBody(verifyPaymentSchema, request);
    if (validationError) return validationError;

    const { transaction_id, tx_ref, plan_name, price, duration, email, phone, user_id, plan_id, auto_renew, gateway } = body;

    if (gateway === 'monnify' || tx_ref?.startsWith('MNF_')) {
      try {
        const user = await validateUserAuth(request);
        return NextResponse.json(await fulfillMonnifyPayment(tx_ref, {
          purpose: 'voucher_purchase', userId: user?.id, transactionId: transaction_id,
        }));
      } catch (error) {
        return NextResponse.json({ error: error.message }, { status: error.status || 503 });
      }
    }

    // ── IDEMPOTENCY GUARD: prevent double-issue if same tx_ref is submitted twice ──
    // (can happen via webhook retry, network error, or rapid double-submit)
    // We use tx_ref (our own unique reference) rather than transaction_id (Flutterwave's numeric ID)
    if (tx_ref) {
      try {
        const { data: existing } = await supabaseAdmin
          .from('vouchers')
          .select('voucher_code, profile_name, price')
          .eq('tx_ref', tx_ref)
          .maybeSingle();

        if (existing) {
          console.log(`Idempotency hit: tx_ref ${tx_ref} already issued voucher ${existing.voucher_code}`);
          return NextResponse.json({
            success: true,
            voucher_code: existing.voucher_code,
            plan: existing.profile_name,
            price: existing.price,
            is_fallback: false,
            idempotent: true,
          });
        }
      } catch (e) {
        // Non-fatal — proceed with normal flow if check fails
        console.warn('Idempotency check failed (non-fatal):', e.message);
      }
    }

    // 1. Determine active gateway and verify with Flutterwave upfront if plan metadata is needed
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

    if (activeGateway === 'monnify') {
      return NextResponse.json({ error: 'Initialize a Monnify order before verification' }, { status: 400 });
    }

    const verifiedFlw = await verifyFlutterwaveTransaction(transaction_id, tx_ref);
    if (verifiedFlw.errorResponse) {
      return verifiedFlw.errorResponse;
    }

    const flwTx = verifiedFlw.data || {};
    const flwMeta = flwTx.meta || {};
    const effectiveTxRef = tx_ref || flwTx.tx_ref || null;
    if (!tx_ref && effectiveTxRef) {
      try {
        const { data: existingByFlwRef } = await supabaseAdmin
          .from('vouchers')
          .select('voucher_code, profile_name, price')
          .eq('tx_ref', effectiveTxRef)
          .maybeSingle();

        if (existingByFlwRef) {
          return NextResponse.json({
            success: true,
            voucher_code: existingByFlwRef.voucher_code,
            plan: existingByFlwRef.profile_name,
            price: existingByFlwRef.price,
            is_fallback: false,
            idempotent: true,
          });
        }
      } catch {}
    }
    const resolvedPlanId = plan_id || flwMeta.plan_id || flwMeta.planId;
    const resolvedPlanName = plan_name || flwMeta.plan_name || flwMeta.planName;

    // 2. Fetch authoritative plan details directly from DB (prevents price/speed tampering)
    const planQuery = resolvedPlanId
      ? supabaseAdmin.from('plans').select('*').eq('id', resolvedPlanId).maybeSingle()
      : resolvedPlanName
        ? supabaseAdmin.from('plans').select('*').eq('name', resolvedPlanName).maybeSingle()
        : null;

    const { data: planData } = planQuery ? await planQuery : { data: null };
    if (!planData) {
      return NextResponse.json({ error: 'Selected internet plan was not found in catalog' }, { status: 400 });
    }

    const authoritativePrice = Number(planData.price);
    const paidAmount = Number(flwTx.amount || 0);
    if (paidAmount < authoritativePrice) {
      return NextResponse.json({ error: `Payment amount (₦${paidAmount}) does not match plan price (₦${authoritativePrice})` }, { status: 400 });
    }

    const effectivePlanName = planData.name || resolvedPlanName;
    const effectiveDuration = planData.duration || duration || '24h';
    let effectiveUserId = user_id || flwMeta.user_id || flwMeta.userId || null;
    if (!effectiveUserId) {
      const authUser = await validateUserAuth(request).catch(() => null);
      effectiveUserId = authUser?.id || null;
    }
    const effectiveEmail = email || flwTx.customer?.email || '';
    const effectivePhone = phone || flwTx.customer?.phone_number || '';
    const effectiveAutoRenew = auto_renew !== undefined ? !!auto_renew : (flwMeta.auto_renew === true || flwMeta.auto_renew === 'true');
    let planDevices = Number(planData.devices) || 1;
    const planUploadSpeed = planData.upload_speed || '12M';
    const planDownloadSpeed = planData.download_speed || '12M';

    // Check global hotspot sharing toggle and expiry mode
    let expiryMode = 'elapsed'; // default
    try {
      const { data: hsData } = await supabaseAdmin
        .from('app_settings')
        .select('value')
        .eq('key', 'hotspot_settings')
        .maybeSingle();
      if (hsData?.value) {
        if (!hsData.value.sharing_enabled && !(Number(planData.devices) > 1)) {
          planDevices = 1;
        }
        expiryMode = hsData.value.expiry_mode || 'elapsed';
      }
    } catch (e) {}

    // 4. Generate collision-safe voucher code
    let code = await generateUniqueCode();

    const uptimeMap = {
      '1h': '1h', '3h': '3h', '24h': '1d',
      '3d': '3d', '7d': '7d', '30d': '30d',
    };

    // Build rate limit string
    const rateLimit = `${planUploadSpeed}/${planDownloadSpeed}`;

    // 5. Provision voucher — MikroTik router API first, fallback voucher pool when API fails or router is unconfigured
    let routerResult = null;
    let isFallback = false;
    const mikrotikConfigured = await isMikroTikConfigured();

    if (mikrotikConfigured) {
      try {
        routerResult = await createOrQueueHotspotUser({
          code,
          password: code,
          profile: effectivePlanName,
          limitUptime: uptimeMap[effectiveDuration] || effectiveDuration || '1d',
          comment: `Online Pay: ${effectiveEmail || effectivePhone || 'Guest'} - ${effectivePlanName} - ₦${authoritativePrice} [Ref: ${effectiveTxRef}]`,
          shared_users: planDevices,
          rate_limit: rateLimit,
          expiry_mode: expiryMode,
        });
      } catch (routerErr) {
        console.warn('MikroTik router API failed after payment, triggering fallback pool:', routerErr.message);

        // Atomic, race-condition safe claim from fallback pool (strict plan isolation)
        const { data: claimedRows, error: claimErr } = await supabaseAdmin
          .rpc('claim_fallback_voucher', {
            p_profile_name: effectivePlanName,
            p_plan_id: planData.id || resolvedPlanId || null,
            p_user_id: effectiveUserId,
          });

        if (!claimErr && claimedRows && claimedRows.length > 0) {
          const claimed = claimedRows[0];
          console.log(`Atomically claimed fallback voucher ${claimed.voucher_code} for ${effectivePlanName} after router API failure`);
          code = claimed.voucher_code;
          isFallback = true;
        } else {
          // Payment was taken, but router provisioning had an error and no backup vouchers
          // We do NOT insert a voucher row here — the user must contact support with the tx_ref
          return NextResponse.json({
            success: false,
            error: `Payment was verified (Ref: ${effectiveTxRef}), but the router API failed ("${routerErr.message}") and no fallback vouchers are available in stock for "${effectivePlanName}". Please contact support with Ref: ${effectiveTxRef}.`,
            pending_router: true,
          }, { status: 502 });
        }
      }
    } else {
      // Router is NOT configured in settings: trigger fallback pool directly
      console.log(`MikroTik router is not configured in settings. Triggering fallback pool directly for "${effectivePlanName}"`);

      const { data: claimedRows, error: claimErr } = await supabaseAdmin
        .rpc('claim_fallback_voucher', {
          p_profile_name: effectivePlanName,
          p_plan_id: planData.id || resolvedPlanId || null,
          p_user_id: effectiveUserId,
        });

      if (!claimErr && claimedRows && claimedRows.length > 0) {
        const claimed = claimedRows[0];
        console.log(`Atomically claimed fallback voucher ${claimed.voucher_code} for ${effectivePlanName} (Router not configured)`);
        code = claimed.voucher_code;
        isFallback = true;
      } else {
        // Router not configured + no fallback vouchers — return error without inserting
        return NextResponse.json({
          success: false,
          error: `Payment was verified (Ref: ${effectiveTxRef}), but the Wi-Fi router is not yet configured in settings and no fallback vouchers are in reserve for "${effectivePlanName}". Please contact support with Ref: ${effectiveTxRef}.`,
          pending_router: true,
        }, { status: 502 });
      }
    }

    // 6. Record transaction for card payment (so it shows in wallet history/analytics)
    let txId = null;
    try {
      const { data: tx } = await supabaseAdmin
        .from('transactions')
        .insert({
          user_id: effectiveUserId,
          type: 'voucher_purchase',
          amount: authoritativePrice,
          status: 'successful',
          payment_method: 'card',
          flw_ref: effectiveTxRef,
          metadata: {
            plan_name: effectivePlanName,
            voucher_code: code,
            duration: effectiveDuration || null,
          },
        })
        .select('id')
        .single();
      txId = tx?.id || null;
    } catch (e) {
      console.warn('Transaction record insert failed (non-fatal):', e.message);
    }

    // Calculate when this voucher expires (wall-clock time)
    const voucherExpiresAt = calculateExpiresAt(effectiveDuration);
    const voucherLimitUptime = uptimeMap[effectiveDuration] || effectiveDuration || '1d';

    // 7. Record successful voucher in Supabase (include tx_ref for idempotency)
    await supabaseAdmin
      .from('vouchers')
      .insert({
        user_id: effectiveUserId,
        voucher_code: code,
        profile_name: effectivePlanName,
        price: authoritativePrice,
        tx_ref: effectiveTxRef,
        transaction_id: txId,
        is_used: false,
        auto_renew: effectiveAutoRenew,
        duration: voucherLimitUptime,
        expires_at: voucherExpiresAt,
      });

    logger.financial({
      action: 'card_voucher_purchase',
      amount: authoritativePrice,
      userId: effectiveUserId || 'guest',
      ref: effectiveTxRef,
      status: 'successful',
      details: {
        transaction_id,
        voucher_code: code,
        plan: effectivePlanName,
        is_fallback: isFallback,
      },
    }, logger.getCorrelationId(request));

    // 8. Create notification if user is logged in
    if (effectiveUserId) {
      try {
        await supabaseAdmin.from('notifications').insert({
          user_id: effectiveUserId,
          title: isFallback ? 'Wi-Fi Pass Purchased (Backup Pool)' : 'Wi-Fi Pass Purchased',
          message: `${effectivePlanName} pass activated via card payment. Your code: ${code}`,
          type: 'voucher_purchase',
        });
      } catch (e) {}
    }

    // 9. Asynchronously dispatch SMS voucher delivery (Feature 2.6)
    if (effectivePhone) {
      sendVoucherSms({
        phone: effectivePhone,
        voucherCode: code,
        planName: effectivePlanName,
        duration: effectiveDuration,
      }).catch(() => {});
    }

    return NextResponse.json({
      success: true,
      voucher_code: code,
      plan: effectivePlanName,
      price: authoritativePrice,
      router_id: routerResult?.routerId || null,
      profile: routerResult?.profile || effectivePlanName,
      is_fallback: isFallback,
    });
  } catch (error) {
    console.error('Verify payment exception:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
