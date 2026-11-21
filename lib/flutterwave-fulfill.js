import { supabaseAdmin } from '@/lib/supabase-server';
import { createOrQueueHotspotUser, isMikroTikConfigured } from '@/lib/mikrotik';
import { generateUniqueCode } from '@/lib/voucher-utils.js';
import { sendVoucherSms } from '@/lib/sms';
import { resolveFlutterwavePaidAmount, getFlutterwaveFeeAllowance } from '@/lib/flutterwave-fees.js';

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

export async function getFlutterwaveSecretKey() {
  let secretKey = (process.env.FLUTTERWAVE_SECRET_KEY || '').trim();
  try {
    const { data: flwSetting } = await supabaseAdmin
      .from('app_settings')
      .select('value')
      .eq('key', 'flutterwave')
      .maybeSingle();
    if (flwSetting?.value?.secret_key) {
      secretKey = flwSetting.value.secret_key.trim();
    }
  } catch {}
  return secretKey;
}

/**
 * Idempotently fulfill a verified Flutterwave `voucher_purchase` transaction.
 * Used by:
 * - POST /api/webhook/flutterwave (server-side background fulfillment when user switches to OPay/PalmPay/Moniepoint)
 * - GET/POST /api/purchase/check-tx (localStorage pending order & email recovery)
 */
export async function fulfillVerifiedFlutterwaveVoucher(flwTx, overrides = {}) {
  const txRef = String(overrides.tx_ref || flwTx?.tx_ref || '').trim();
  if (!txRef) {
    return { ok: false, status: 400, error: 'Missing transaction reference' };
  }

  // Strictly block wallet top-up / guest wallet top-up transactions from being redeemed as direct vouchers
  const txMetaType = String(flwTx?.meta?.type || '').toLowerCase();
  if (
    txRef.startsWith('FLW_TOPUP_') ||
    txRef.startsWith('FLW_GTOPUP_') ||
    txMetaType === 'wallet_topup' ||
    txMetaType === 'guest_wallet_topup'
  ) {
    return {
      ok: false,
      status: 400,
      error: 'Wallet deposit transactions cannot be redeemed as direct voucher purchases.',
    };
  }

  // 1. Idempotency check — return existing voucher immediately if already created
  try {
    const { data: existing } = await supabaseAdmin
      .from('vouchers')
      .select('voucher_code, profile_name, price, duration, created_at')
      .eq('tx_ref', txRef)
      .maybeSingle();

    if (existing?.voucher_code) {
      return {
        ok: true,
        idempotent: true,
        voucher_code: existing.voucher_code,
        plan: existing.profile_name,
        price: Number(existing.price || 0),
        duration: existing.duration || '24h',
        created_at: existing.created_at,
        tx_ref: txRef,
        is_fallback: false,
      };
    }
  } catch {}

  const flwStatus = String(flwTx?.status || '').toLowerCase();
  if (flwStatus !== 'successful' && flwStatus !== 'completed') {
    return { ok: false, status: 400, error: 'Payment not successful' };
  }

  const currency = String(flwTx?.currency || 'NGN').toUpperCase();
  if (currency && currency !== 'NGN') {
    return { ok: false, status: 400, error: 'Unsupported currency' };
  }

  const flwMeta = flwTx?.meta || {};
  const resolvedPlanId = overrides.plan_id || flwMeta.plan_id || flwMeta.planId || null;
  const resolvedPlanName = overrides.plan_name || flwMeta.plan_name || flwMeta.planName || null;

  let planData = null;
  if (resolvedPlanId) {
    const { data } = await supabaseAdmin.from('plans').select('*').eq('id', resolvedPlanId).maybeSingle();
    planData = data;
  }
  if (!planData && resolvedPlanName) {
    const { data } = await supabaseAdmin.from('plans').select('*').eq('name', resolvedPlanName).maybeSingle();
    planData = data;
  }
  // Fallback: match by exact paid price if old checkout lacked meta.plan_id
  if (!planData) {
    const approxPaid = Math.round(resolveFlutterwavePaidAmount(flwTx));
    const { data: allPlans } = await supabaseAdmin.from('plans').select('*').order('price', { ascending: true });
    if (Array.isArray(allPlans) && allPlans.length > 0) {
      planData = allPlans.find((p) => Number(p.price) === approxPaid) || null;
    }
  }

  if (!planData) {
    return { ok: false, status: 400, error: 'Plan not found for transaction' };
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
  const feeAllowance = getFlutterwaveFeeAllowance(authoritativePrice);
  if (paidAmount + feeAllowance < authoritativePrice) {
    return {
      ok: false,
      status: 400,
      error: `Payment amount (₦${paidAmount}) does not match plan price (₦${authoritativePrice})`,
    };
  }

  const effectivePlanName = planData.name || resolvedPlanName;
  const effectiveDuration = planData.duration || overrides.duration || '24h';
  const effectiveUserId = overrides.user_id || flwMeta.user_id || flwMeta.userId || null;
  const effectiveEmail = (overrides.email || flwTx?.customer?.email || '').trim().toLowerCase();
  const effectivePhone = overrides.phone || flwTx?.customer?.phone_number || '';
  const effectiveAutoRenew = overrides.auto_renew !== undefined
    ? !!overrides.auto_renew
    : (flwMeta.auto_renew === true || flwMeta.auto_renew === 'true');

  let planDevices = Number(planData.devices) || 1;
  const planUploadSpeed = planData.upload_speed || '12M';
  const planDownloadSpeed = planData.download_speed || '12M';
  let expiryMode = 'elapsed';

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
  } catch {}

  const uptimeMap = {
    '1h': '1h', '3h': '3h', '24h': '1d',
    '3d': '3d', '7d': '7d', '30d': '30d',
  };
  const voucherLimitUptime = uptimeMap[effectiveDuration] || effectiveDuration || '1d';
  const rateLimit = `${planUploadSpeed}/${planDownloadSpeed}`;

  // 2. Atomic race guard: reserve flw_ref in transactions BEFORE creating router user
  //    so concurrent webhook + browser check-tx/verify-payment cannot double-provision!
  const { data: reservedTx, error: txUpsertErr } = await supabaseAdmin
    .from('transactions')
    .upsert({
      user_id: effectiveUserId,
      type: 'voucher_purchase',
      amount: authoritativePrice,
      status: 'successful',
      payment_method: 'card',
      flw_ref: txRef,
      metadata: {
        plan_id: planData.id,
        plan_name: effectivePlanName,
        duration: effectiveDuration,
        gateway: 'flutterwave',
        customer_email: effectiveEmail || null,
        customer_phone: effectivePhone || null,
        transaction_id: flwTx?.id || null,
        charged_amount: Number(flwTx?.charged_amount || paidAmount || authoritativePrice),
        app_fee: Number(flwTx?.app_fee || 0),
        amount_settled: Number(flwTx?.amount_settled || authoritativePrice),
      },
    }, { onConflict: 'flw_ref', ignoreDuplicates: true })
    .select('id')
    .maybeSingle();

  if (txUpsertErr) {
    return { ok: false, status: 500, error: 'Failed to reserve transaction record' };
  }

  if (!reservedTx?.id) {
    // Another worker is already fulfilling or already fulfilled this tx_ref — wait briefly & return existing voucher
    for (let i = 0; i < 6; i++) {
      const { data: existingAfterRace } = await supabaseAdmin
        .from('vouchers')
        .select('voucher_code, profile_name, price, duration, created_at')
        .eq('tx_ref', txRef)
        .maybeSingle();
      if (existingAfterRace?.voucher_code) {
        return {
          ok: true,
          idempotent: true,
          voucher_code: existingAfterRace.voucher_code,
          plan: existingAfterRace.profile_name,
          price: Number(existingAfterRace.price || authoritativePrice),
          duration: existingAfterRace.duration || voucherLimitUptime,
          created_at: existingAfterRace.created_at,
          tx_ref: txRef,
          is_fallback: false,
        };
      }
      await new Promise((r) => setTimeout(r, 350));
    }
    // Never fall through to provision a duplicate MikroTik voucher without owning reservedTx.id
    return {
      ok: false,
      status: 409,
      error: 'Payment fulfillment is already in progress. Please retry in a few seconds.',
    };
  }

  let code = await generateUniqueCode();
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
        comment: `Online Pay: ${effectiveEmail || effectivePhone || 'Guest'} - ${effectivePlanName} - ₦${authoritativePrice} [Ref: ${txRef}]`,
        shared_users: planDevices,
        rate_limit: rateLimit,
        expiry_mode: expiryMode,
      });
    } catch (routerErr) {
      const { data: claimedRows, error: claimErr } = await supabaseAdmin.rpc('claim_fallback_voucher', {
        p_profile_name: effectivePlanName,
        p_plan_id: planData.id || resolvedPlanId || null,
        p_user_id: effectiveUserId,
      });
      if (!claimErr && claimedRows && claimedRows.length > 0) {
        code = claimedRows[0].voucher_code;
        isFallback = true;
      } else {
        // Release reserved transaction so a retry can succeed once router is back online
        if (reservedTx?.id) {
          try { await supabaseAdmin.from('transactions').delete().eq('id', reservedTx.id); } catch {}
        }
        return {
          ok: false,
          status: 502,
          error: `Payment verified (Ref: ${txRef}), but router failed ("${routerErr.message}") and no backup vouchers are in stock.`,
        };
      }
    }
  } else {
    const { data: claimedRows, error: claimErr } = await supabaseAdmin.rpc('claim_fallback_voucher', {
      p_profile_name: effectivePlanName,
      p_plan_id: planData.id || resolvedPlanId || null,
      p_user_id: effectiveUserId,
    });
    if (!claimErr && claimedRows && claimedRows.length > 0) {
      code = claimedRows[0].voucher_code;
      isFallback = true;
    } else {
      if (reservedTx?.id) {
        try { await supabaseAdmin.from('transactions').delete().eq('id', reservedTx.id); } catch {}
      }
      return {
        ok: false,
        status: 502,
        error: `Payment verified (Ref: ${txRef}), but router is unconfigured and no backup vouchers are available.`,
      };
    }
  }

  // Update transaction metadata with the generated voucher code
  if (reservedTx?.id) {
    try {
      await supabaseAdmin
        .from('transactions')
        .update({
          metadata: {
            plan_id: planData.id,
            plan_name: effectivePlanName,
            voucher_code: code,
            duration: effectiveDuration,
            gateway: 'flutterwave',
            customer_email: effectiveEmail || null,
            customer_phone: effectivePhone || null,
            transaction_id: flwTx?.id || null,
            charged_amount: Number(flwTx?.charged_amount || paidAmount || authoritativePrice),
            app_fee: Number(flwTx?.app_fee || 0),
            amount_settled: Number(flwTx?.amount_settled || authoritativePrice),
          },
        })
        .eq('id', reservedTx.id);
    } catch {}
  }

  const { error: voucherInsertErr } = await supabaseAdmin.from('vouchers').insert({
    user_id: effectiveUserId,
    voucher_code: code,
    profile_name: effectivePlanName,
    price: authoritativePrice,
    tx_ref: txRef,
    transaction_id: reservedTx?.id || null,
    is_used: false,
    auto_renew: effectiveAutoRenew,
    duration: voucherLimitUptime,
    expiry_policy: 'first_login',
    activated_at: null,
    expires_at: null,
  });

  if (voucherInsertErr) {
    if (reservedTx?.id) {
      try { await supabaseAdmin.from('transactions').delete().eq('id', reservedTx.id); } catch {}
    }
    return {
      ok: false,
      status: 500,
      error: `Voucher insert failed after payment verification: ${voucherInsertErr.message || 'Database error'}`,
    };
  }

  if (effectiveUserId) {
    try {
      await supabaseAdmin.from('notifications').insert({
        user_id: effectiveUserId,
        title: isFallback ? 'Wi-Fi Pass Purchased (Backup Pool)' : 'Wi-Fi Pass Purchased',
        message: `${effectivePlanName} pass activated. Your code: ${code}`,
        type: 'voucher_purchase',
      });
    } catch {}
  }

  if (effectivePhone) {
    sendVoucherSms({
      phone: effectivePhone,
      voucherCode: code,
      planName: effectivePlanName,
      duration: effectiveDuration,
    }).catch(() => {});
  }

  return {
    ok: true,
    idempotent: false,
    voucher_code: code,
    plan: effectivePlanName,
    price: authoritativePrice,
    duration: voucherLimitUptime,
    router_id: routerResult?.routerId || null,
    is_fallback: isFallback,
    tx_ref: txRef,
  };
}
