import { NextResponse } from 'next/server.js';
import { supabaseAdmin } from '@/lib/supabase-server.js';
import { validateAdminAuth, adminUnauthorizedResponse } from '@/lib/admin-auth.js';
import {
  getRouterBillingSettings,
  saveRouterBillingSettings,
  evaluateRouterBillingState,
  syncRoutersBillingState,
} from '@/lib/router-billing.js';
import { logger } from '@/lib/logger.js';

/**
 * GET /api/super-admin/router-billing
 * Returns global billing enforcement settings + every router's live subscription/enforcement status.
 */
export async function GET(request) {
  try {
    if (!(await validateAdminAuth(request))) return adminUnauthorizedResponse();

    const settings = await getRouterBillingSettings();
    const { data: routers, error } = await supabaseAdmin
      .from('routers')
      .select('id, name, ip_address, port, status, is_active, subscription_status, subscription_expires_at, subscription_fee, billing_enforcement_override, expiry_paused_by_billing, billing_notice_message')
      .order('created_at', { ascending: true });

    if (error) throw error;

    const enriched = (routers || []).map((r) => ({
      ...r,
      billing_state: evaluateRouterBillingState(r, settings),
    }));

    return NextResponse.json({
      success: true,
      settings,
      routers: enriched,
    });
  } catch (err) {
    logger.error('GET /api/super-admin/router-billing error:', { error: err.message });
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

/**
 * POST /api/super-admin/router-billing
 * Updates global monthly subscription enforcement settings (ON/OFF, mode, notice message, grace period)
 * and immediately syncs all connected routers (pausing unpaid routers if ON, or restoring all if OFF).
 */
export async function POST(request) {
  try {
    if (!(await validateAdminAuth(request))) return adminUnauthorizedResponse();

    const body = await request.json().catch(() => ({}));

    // Bulk action: disable enforcement for ALL routers & immediately restore auto-expiry everywhere
    if (body.action === 'disable_all') {
      const settings = await saveRouterBillingSettings({ enabled: false });
      await supabaseAdmin
        .from('routers')
        .update({ billing_enforcement_override: 'inherit', updated_at: new Date().toISOString() })
        .neq('id', '00000000-0000-0000-0000-000000000000');

      const sync = await syncRoutersBillingState({ settings });
      return NextResponse.json({ success: true, action: 'disable_all', ...sync });
    }

    const updatedSettings = await saveRouterBillingSettings({
      enabled: body.enabled,
      mode: body.mode,
      default_monthly_fee: body.default_monthly_fee,
      grace_period_days: body.grace_period_days,
      notice_message: body.notice_message,
    });

    const sync = await syncRoutersBillingState({ settings: updatedSettings });
    return NextResponse.json({ success: true, ...sync });
  } catch (err) {
    logger.error('POST /api/super-admin/router-billing error:', { error: err.message });
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

/**
 * PATCH /api/super-admin/router-billing
 * Updates an individual router's monthly subscription status, due date, or enforcement override
 * ('inherit' | 'force_on' | 'force_off'), or quick-marks it Paid (+30 days), and syncs that router live.
 */
export async function PATCH(request) {
  try {
    if (!(await validateAdminAuth(request))) return adminUnauthorizedResponse();

    const body = await request.json().catch(() => ({}));
    const { router_id } = body;
    if (!router_id) {
      return NextResponse.json({ success: false, error: 'router_id is required' }, { status: 400 });
    }

    const updates = { updated_at: new Date().toISOString() };

    if (body.action === 'mark_paid_30d') {
      const nextDue = new Date(Date.now() + 30 * 86400 * 1000).toISOString();
      updates.subscription_status = 'active';
      updates.subscription_expires_at = nextDue;
    } else if (body.action === 'mark_unpaid') {
      updates.subscription_status = 'past_due';
      updates.subscription_expires_at = new Date(Date.now() - 86400 * 1000).toISOString();
    } else {
      if (['active', 'past_due', 'suspended', 'exempt'].includes(body.subscription_status)) {
        updates.subscription_status = body.subscription_status;
      }
      if (['inherit', 'force_on', 'force_off'].includes(body.billing_enforcement_override)) {
        updates.billing_enforcement_override = body.billing_enforcement_override;
      }
      if (body.subscription_expires_at !== undefined) {
        updates.subscription_expires_at = body.subscription_expires_at || null;
      }
      if (body.subscription_fee !== undefined) {
        updates.subscription_fee = Math.max(0, Number(body.subscription_fee) || 0);
      }
      if (body.billing_notice_message !== undefined) {
        updates.billing_notice_message = body.billing_notice_message ? String(body.billing_notice_message).trim() : null;
      }
    }

    const { error: updErr } = await supabaseAdmin
      .from('routers')
      .update(updates)
      .eq('id', router_id);

    if (updErr) throw updErr;

    const sync = await syncRoutersBillingState({ routerId: router_id });
    return NextResponse.json({
      success: true,
      router_result: sync.results[0] || null,
      settings: sync.settings,
    });
  } catch (err) {
    logger.error('PATCH /api/super-admin/router-billing error:', { error: err.message });
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
