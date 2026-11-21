import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { createOrQueueHotspotUser, isMikroTikConfigured } from '@/lib/mikrotik';
import { generateUniqueCode } from '@/lib/voucher-utils.js';
import { logger } from '@/lib/logger';

const GUEST_TOKEN_REGEX = /^gw_[a-f0-9]{24,64}$/i;

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

/**
 * POST /api/guest-wallet/purchase
 * Atomically deducts from a guest's server-verified `guest_wallets` balance and
 * provisions a MikroTik hotspot voucher (or claims from fallback pool, refunding on failure).
 */
export async function POST(request) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const guestToken = String(body.guest_token || '').trim();
    const { plan_id, plan_name, duration } = body;

    if (!GUEST_TOKEN_REGEX.test(guestToken)) {
      return NextResponse.json({ error: 'Valid guest_token is required' }, { status: 400 });
    }
    if (!plan_id && !plan_name) {
      return NextResponse.json({ error: 'plan_id or plan_name is required' }, { status: 400 });
    }

    // 1. Fetch authoritative plan from DB
    let authoritativePlan = null;
    if (plan_id) {
      const { data } = await supabaseAdmin.from('plans').select('*').eq('id', plan_id).maybeSingle();
      authoritativePlan = data;
    }
    if (!authoritativePlan && plan_name) {
      const { data } = await supabaseAdmin.from('plans').select('*').eq('name', plan_name).maybeSingle();
      authoritativePlan = data;
    }
    if (!authoritativePlan) {
      return NextResponse.json({ error: 'Selected internet plan was not found' }, { status: 400 });
    }

    let numericPrice = Number(authoritativePlan.price);
    try {
      const { data: schedRow } = await supabaseAdmin
        .from('app_settings')
        .select('value')
        .eq('key', 'scheduler_rules')
        .maybeSingle();
      if (schedRow?.value) {
        const parsedRules = typeof schedRow.value === 'string' ? JSON.parse(schedRow.value) : schedRow.value;
        numericPrice = resolveScheduledPlanPrice(numericPrice, parsedRules);
      }
    } catch {}

    const effectivePlanName = authoritativePlan.name;
    const effectiveDuration = authoritativePlan.duration || duration || '24h';

    // 1b. Rapid double-click idempotency guard (15-second window)
    try {
      const windowStart = new Date(Date.now() - 15000).toISOString();
      const txQuery = supabaseAdmin
        .from('transactions')
        .select('id, amount, metadata, created_at');
      if (typeof txQuery?.is === 'function' && typeof txQuery?.contains === 'function' && typeof txQuery?.gte === 'function') {
        const { data: recentTx } = await txQuery
          .is('user_id', null)
          .eq('type', 'voucher_purchase')
          .eq('payment_method', 'guest_wallet')
          .contains('metadata', { guest_token: guestToken, plan_name: effectivePlanName })
          .gte('created_at', windowStart)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (recentTx?.metadata?.voucher_code) {
          const { data: wRow } = await supabaseAdmin
            .from('guest_wallets')
            .select('balance')
            .eq('guest_token', guestToken)
            .maybeSingle();
          return NextResponse.json({
            success: true,
            voucher_code: recentTx.metadata.voucher_code,
            plan: effectivePlanName,
            price: Number(recentTx.amount || numericPrice),
            duration: recentTx.metadata.duration || effectiveDuration,
            new_balance: Number(wRow?.balance || 0),
            is_fallback: false,
            idempotent: true,
          });
        }
      }
    } catch {}

    // 2. Fetch hotspot settings
    let hotspotSettings = { sharing_enabled: false, expiry_mode: 'elapsed' };
    try {
      const { data } = await supabaseAdmin.from('app_settings').select('value').eq('key', 'hotspot_settings').maybeSingle();
      if (data?.value) hotspotSettings = { ...hotspotSettings, ...data.value };
    } catch {}

    let planDevices = Number(authoritativePlan.devices) || 1;
    if (!hotspotSettings.sharing_enabled && !(Number(authoritativePlan.devices) > 1)) {
      planDevices = 1;
    }

    // 3. Atomic guest wallet deduction via Postgres RPC
    const { data: rpcResult, error: rpcErr } = await supabaseAdmin.rpc('adjust_guest_wallet_balance', {
      p_guest_token: guestToken,
      p_amount: numericPrice,
      p_operation: 'deduct',
      p_email: null,
    });

    if (rpcErr) {
      console.error('Guest wallet deduct RPC error:', rpcErr);
      return NextResponse.json({ error: 'Database error processing guest wallet payment' }, { status: 500 });
    }

    const newBalance = Number(rpcResult);
    if (newBalance < 0) {
      return NextResponse.json({
        error: 'Insufficient guest wallet balance. Please top up your guest wallet first.',
      }, { status: 400 });
    }

    let code = await generateUniqueCode();
    const guestTxRef = `GWALLET_${Date.now()}_${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    const uptimeMap = {
      '1h': '1h', '3h': '3h', '24h': '1d',
      '3d': '3d', '7d': '7d', '30d': '30d',
    };
    const voucherLimitUptime = uptimeMap[effectiveDuration] || effectiveDuration || '1d';
    const rateLimit = `${authoritativePlan.upload_speed || '12M'}/${authoritativePlan.download_speed || '12M'}`;

    let routerResult = null;
    let isFallback = false;
    const mikrotikConfigured = await isMikroTikConfigured();

    const refundGuestWallet = async () => {
      await supabaseAdmin.rpc('adjust_guest_wallet_balance', {
        p_guest_token: guestToken,
        p_amount: numericPrice,
        p_operation: 'add',
        p_email: null,
      }).catch(() => {});
    };

    if (mikrotikConfigured) {
      try {
        routerResult = await createOrQueueHotspotUser({
          code,
          password: code,
          profile: effectivePlanName,
          limitUptime: voucherLimitUptime,
          comment: `GuestWallet ${guestToken.slice(0, 12)} - ${effectivePlanName} - ₦${numericPrice}`,
          shared_users: planDevices,
          rate_limit: rateLimit,
          expiry_mode: hotspotSettings.expiry_mode || 'elapsed',
        });
      } catch (routerErr) {
        const { data: claimedRows, error: claimErr } = await supabaseAdmin.rpc('claim_fallback_voucher', {
          p_profile_name: effectivePlanName,
          p_plan_id: authoritativePlan.id || null,
          p_user_id: null,
        });
        if (!claimErr && claimedRows && claimedRows.length > 0) {
          code = claimedRows[0].voucher_code;
          isFallback = true;
        } else {
          await refundGuestWallet();
          return NextResponse.json({
            error: `Router connection failed: ${routerErr.message}. Your guest wallet has been refunded.`,
            router_error: true,
          }, { status: 502 });
        }
      }
    } else {
      const { data: claimedRows, error: claimErr } = await supabaseAdmin.rpc('claim_fallback_voucher', {
        p_profile_name: effectivePlanName,
        p_plan_id: authoritativePlan.id || null,
        p_user_id: null,
      });
      if (!claimErr && claimedRows && claimedRows.length > 0) {
        code = claimedRows[0].voucher_code;
        isFallback = true;
      } else {
        await refundGuestWallet();
        return NextResponse.json({
          error: `Wi-Fi router is not configured and no backup vouchers are in reserve. Your guest wallet has been refunded.`,
          router_error: true,
        }, { status: 502 });
      }
    }

    let insertedTxId = null;
    try {
      const { data: tx, error: txErr } = await supabaseAdmin
        .from('transactions')
        .insert({
          user_id: null,
          type: 'voucher_purchase',
          amount: numericPrice,
          status: 'successful',
          payment_method: 'guest_wallet',
          flw_ref: guestTxRef,
          metadata: {
            guest_token: guestToken,
            plan_name: effectivePlanName,
            voucher_code: code,
            duration: voucherLimitUptime,
          },
        })
        .select('id')
        .single();

      if (txErr) throw txErr;
      insertedTxId = tx?.id || null;

      const { error: voucherErr } = await supabaseAdmin.from('vouchers').insert({
        user_id: null,
        voucher_code: code,
        profile_name: effectivePlanName,
        price: numericPrice,
        transaction_id: insertedTxId,
        tx_ref: guestTxRef,
        is_used: false,
        auto_renew: false,
        duration: voucherLimitUptime,
        expiry_policy: 'first_login',
        activated_at: null,
        expires_at: null,
      });

      if (voucherErr) throw voucherErr;

      logger.financial({
        action: 'guest_wallet_voucher_purchase',
        amount: numericPrice,
        userId: guestToken,
        ref: guestTxRef,
        status: 'successful',
        balanceAfter: newBalance,
        details: { voucher_code: code, plan: effectivePlanName, is_fallback: isFallback },
      }, logger.getCorrelationId(request));
    } catch (dbErr) {
      if (insertedTxId) {
        try { await supabaseAdmin.from('transactions').delete().eq('id', insertedTxId); } catch {}
      }
      await refundGuestWallet();
      return NextResponse.json({
        error: 'Failed to save voucher record. Your guest wallet has been refunded.',
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      voucher_code: code,
      plan: effectivePlanName,
      price: numericPrice,
      duration: voucherLimitUptime,
      router_id: routerResult?.routerId || null,
      profile: routerResult?.profile || effectivePlanName,
      new_balance: newBalance,
      is_fallback: isFallback,
    });
  } catch (error) {
    console.error('POST /api/guest-wallet/purchase error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
