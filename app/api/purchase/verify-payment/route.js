import { fulfillMonnifyPayment } from '@/lib/monnify.js';
import { validateUserAuth } from '@/lib/user-auth.js';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { createOrQueueHotspotUser, isMikroTikConfigured, calculateExpiresAt } from '@/lib/mikrotik';
import { generateUniqueCode } from '@/lib/voucher-utils.js';
import { validateBody, verifyPaymentSchema } from '@/lib/schemas';
import { logger } from '@/lib/logger';
import { sendVoucherSms } from '@/lib/sms';

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

function resolveScheduledPlanPrice(basePrice, rules) {
  const numericBase = Number(basePrice || 0);
  if (!Array.isArray(rules) || rules.length === 0 || numericBase <= 0) return numericBase;
  const now = new Date();
  const wat = new Date(now.getTime() + now.getTimezoneOffset() * 60000 + 3600000);
  const day = wat.getDay();
  const hour = wat.getHours();
  const active = rules.filter((r) => {
    if (!r || !r.enabled) return false;
    if (Array.isArray(r.days) && !r.days.includes(day)) return false;
    return r.start_hour <= r.end_hour
      ? hour >= r.start_hour && hour < r.end_hour
      : hour >= r.start_hour || hour < r.end_hour;
  });
  if (active.length === 0) return numericBase;
  const top = [...active].sort((a, b) => (b.discount_percent || 0) - (a.discount_percent || 0))[0];
  const discount = Math.min(Math.max(0, Number(top.discount_percent || 0)), 90);
  return discount > 0 ? Math.max(0, Math.round(numericBase * (1 - discount / 100))) : numericBase;
}

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
    const flwStatus = String(flwData.data?.status || '').toLowerCase();
    if (flwData.status !== 'success' || (flwStatus !== 'successful' && flwStatus !== 'completed')) {
      return {
        errorResponse: NextResponse.json({ error: 'Payment was not successful or was declined' }, { status: 400 }),
      };
    }

    if (flwData.data?.tx_ref && txRef && flwData.data.tx_ref !== txRef) {
      return {
        errorResponse: NextResponse.json({ error: 'Payment transaction reference mismatch' }, { status: 400 }),
      };
    }

    if (flwData.data?.currency && String(flwData.data.currency).toUpperCase() !== 'NGN') {
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
    const flwMetaType = String(flwMeta.type || '').toLowerCase();
    if (
      effectiveTxRef?.startsWith('FLW_TOPUP_') ||
      effectiveTxRef?.startsWith('FLW_GTOPUP_') ||
      flwMetaType === 'wallet_topup' ||
      flwMetaType === 'guest_wallet_topup'
    ) {
      return NextResponse.json({
        error: 'Wallet top-up payments cannot be redeemed as direct voucher purchases.',
      }, { status: 400 });
    }
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

    let authoritativePrice = Number(planData.price);
    try {
      const { data: schedRow } = await supabaseAdmin
        .from('app_settings')
        .select('value')
        .eq('key', 'scheduler_rules')
        .maybeSingle();
      if (schedRow?.value) {
        const parsedRules = typeof schedRow.value === 'string' ? JSON.parse(schedRow.value) : schedRow.value;
        authoritativePrice = resolveScheduledPlanPrice(authoritativePrice, parsedRules);
      }
    } catch {}

    const paidAmount = resolveFlutterwavePaidAmount(flwTx);
    const feeAllowance = Math.min(100, Math.max(5, Math.ceil(authoritativePrice * 0.035)));
    if (paidAmount + feeAllowance < authoritativePrice) {
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

    // Build rate limit string and uptime
    const rateLimit = `${planUploadSpeed}/${planDownloadSpeed}`;
    const voucherLimitUptime = uptimeMap[effectiveDuration] || effectiveDuration || '1d';

    // 4b. Atomic cross-route race guard: reserve flw_ref in transactions BEFORE provisioning MikroTik
    // so concurrent webhook/flutterwave + verify-payment callbacks cannot double-provision a voucher.
    let reservedTxId = null;
    const releaseReservedTx = async () => {
      if (reservedTxId) {
        try { await supabaseAdmin.from('transactions').delete().eq('id', reservedTxId); } catch {}
        reservedTxId = null;
      }
    };

    if (effectiveTxRef) {
      const txTable = supabaseAdmin.from('transactions');
      if (typeof txTable?.upsert === 'function') {
        const { data: reservedTx, error: txUpsertErr } = await txTable
          .upsert({
            user_id: effectiveUserId,
            type: 'voucher_purchase',
            amount: authoritativePrice,
            status: 'successful',
            payment_method: 'card',
            flw_ref: effectiveTxRef,
            metadata: {
              plan_id: planData.id || resolvedPlanId || null,
              plan_name: effectivePlanName,
              duration: effectiveDuration || null,
              gateway: 'flutterwave',
              customer_email: (effectiveEmail || '').trim().toLowerCase() || null,
              customer_phone: effectivePhone || null,
              transaction_id: flwTx.id || transaction_id || null,
              charged_amount: Number(flwTx.charged_amount || paidAmount || authoritativePrice),
              app_fee: Number(flwTx.app_fee || 0),
              amount_settled: Number(flwTx.amount_settled || authoritativePrice),
            },
          }, { onConflict: 'flw_ref', ignoreDuplicates: true })
          .select('id')
          .maybeSingle();

        if (txUpsertErr) {
          console.error('verify-payment transaction reserve error:', txUpsertErr);
          return NextResponse.json({ error: 'Failed to reserve transaction record' }, { status: 500 });
        }

        if (!reservedTx?.id) {
          for (let i = 0; i < 6; i++) {
            const { data: raceVoucher } = await supabaseAdmin
              .from('vouchers')
              .select('voucher_code, profile_name, price')
              .eq('tx_ref', effectiveTxRef)
              .maybeSingle();
            if (raceVoucher?.voucher_code) {
              return NextResponse.json({
                success: true,
                voucher_code: raceVoucher.voucher_code,
                plan: raceVoucher.profile_name,
                price: raceVoucher.price,
                is_fallback: false,
                idempotent: true,
              });
            }
            await new Promise((r) => setTimeout(r, 350));
          }
          return NextResponse.json({
            error: 'Payment fulfillment is already in progress. Please retry in a few seconds.',
          }, { status: 409 });
        }

        reservedTxId = reservedTx.id;
      }
    }

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
          limitUptime: voucherLimitUptime,
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
          // Release reserved transaction so a retry can succeed once router is back online
          await releaseReservedTx();
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
        // Router not configured + no fallback vouchers — release lock & return error without inserting
        await releaseReservedTx();
        return NextResponse.json({
          success: false,
          error: `Payment was verified (Ref: ${effectiveTxRef}), but the Wi-Fi router is not yet configured in settings and no fallback vouchers are in reserve for "${effectivePlanName}". Please contact support with Ref: ${effectiveTxRef}.`,
          pending_router: true,
        }, { status: 502 });
      }
    }

    // 6. Record or update transaction for card payment (so it shows in wallet history/analytics)
    let txId = reservedTxId;
    const txMetadata = {
      plan_id: planData.id || resolvedPlanId || null,
      plan_name: effectivePlanName,
      voucher_code: code,
      duration: effectiveDuration || null,
      gateway: 'flutterwave',
      customer_email: (effectiveEmail || '').trim().toLowerCase() || null,
      customer_phone: effectivePhone || null,
      transaction_id: flwTx.id || transaction_id || null,
      charged_amount: Number(flwTx.charged_amount || paidAmount || authoritativePrice),
      app_fee: Number(flwTx.app_fee || 0),
      amount_settled: Number(flwTx.amount_settled || authoritativePrice),
    };
    if (reservedTxId) {
      try {
        await supabaseAdmin
          .from('transactions')
          .update({ metadata: txMetadata })
          .eq('id', reservedTxId);
      } catch (e) {
        console.warn('Transaction metadata update failed (non-fatal):', e.message);
      }
    } else {
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
            metadata: txMetadata,
          })
          .select('id')
          .single();
        txId = tx?.id || null;
      } catch (e) {
        console.warn('Transaction record insert failed (non-fatal):', e.message);
      }
    }

    // 7. Record successful voucher in Supabase (include tx_ref for idempotency)
    const { error: voucherInsertErr } = await supabaseAdmin
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
        expiry_policy: 'first_login',
        activated_at: null,
        expires_at: null,
      });

    if (voucherInsertErr) {
      await releaseReservedTx();
      return NextResponse.json({
        error: 'Payment verified, but saving voucher record failed. Please retry or contact support.',
      }, { status: 500 });
    }

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
