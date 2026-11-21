import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { fulfillVerifiedFlutterwaveVoucher, getFlutterwaveSecretKey } from '@/lib/flutterwave-fulfill.js';

async function checkAndFulfillByTxRef(txRef) {
  const cleanRef = String(txRef || '').trim();
  if (!cleanRef || cleanRef.length > 200) {
    return { status: 'invalid', error: 'Invalid transaction reference' };
  }

  // 1. Check if voucher was already provisioned (by webhook or callback)
  const { data: existingVoucher } = await supabaseAdmin
    .from('vouchers')
    .select('voucher_code, profile_name, price, duration, created_at')
    .eq('tx_ref', cleanRef)
    .maybeSingle();

  if (existingVoucher?.voucher_code) {
    return {
      status: 'fulfilled',
      voucher_code: existingVoucher.voucher_code,
      plan: existingVoucher.profile_name,
      price: Number(existingVoucher.price || 0),
      duration: existingVoucher.duration || '24h',
      created_at: existingVoucher.created_at,
      tx_ref: cleanRef,
      idempotent: true,
    };
  }

  // 2. Ask Flutterwave directly by tx_ref (works even when mobile browser never received transaction_id!)
  const secretKey = await getFlutterwaveSecretKey();
  if (!secretKey) {
    return { status: 'pending', message: 'Gateway verification unavailable' };
  }

  try {
    const flwRes = await fetch(
      `https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=${encodeURIComponent(cleanRef)}`,
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${secretKey}`, 'Content-Type': 'application/json' },
        cache: 'no-store',
        signal: AbortSignal.timeout(10000),
      }
    );

    if (!flwRes.ok) {
      return { status: 'pending' };
    }

    const flwJson = await flwRes.json();
    const flwTx = flwJson?.data;
    const flwStatus = String(flwTx?.status || '').toLowerCase();

    if (flwJson?.status !== 'success' || (flwStatus !== 'successful' && flwStatus !== 'completed')) {
      return { status: 'pending' };
    }

    const fulfilled = await fulfillVerifiedFlutterwaveVoucher(flwTx, { tx_ref: cleanRef });
    if (!fulfilled.ok) {
      return { status: 'error', error: fulfilled.error, httpStatus: fulfilled.status || 400 };
    }

    return {
      status: 'fulfilled',
      voucher_code: fulfilled.voucher_code,
      plan: fulfilled.plan,
      price: fulfilled.price,
      duration: fulfilled.duration,
      is_fallback: !!fulfilled.is_fallback,
      tx_ref: cleanRef,
    };
  } catch (err) {
    console.warn('check-tx verify_by_reference error:', err.message);
    return { status: 'pending' };
  }
}

/**
 * GET /api/purchase/check-tx?tx_ref=FLW_...
 * Fast polling & localStorage recovery endpoint for guest/user Flutterwave payments.
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const txRef = searchParams.get('tx_ref');
    if (!txRef) {
      return NextResponse.json({ error: 'tx_ref is required' }, { status: 400 });
    }

    const result = await checkAndFulfillByTxRef(txRef);
    if (result.status === 'invalid') {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    if (result.status === 'error') {
      return NextResponse.json({ status: 'error', error: result.error }, { status: result.httpStatus || 400 });
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error('GET /api/purchase/check-tx error:', error);
    return NextResponse.json({ error: 'Unable to check payment status' }, { status: 500 });
  }
}

/**
 * POST /api/purchase/check-tx
 * Body: { tx_ref } OR { email }
 * Allows guests to recover a paid voucher even if their Captive Portal WebView closed
 * and wiped localStorage/sessionStorage (by verifying recent 24h Flutterwave payments for that email).
 */
export async function POST(request) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    if (body.tx_ref) {
      const result = await checkAndFulfillByTxRef(body.tx_ref);
      if (result.status === 'error') {
        return NextResponse.json({ status: 'error', error: result.error }, { status: result.httpStatus || 400 });
      }
      return NextResponse.json(result);
    }

    const email = String(body.email || '').trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Please enter a valid payment email or reference' }, { status: 400 });
    }

    const vouchers = [];
    const seenRefs = new Set();
    const cutoffIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // 1. Check Flutterwave API for recent successful voucher_purchase payments by this email (last 24h)
    const secretKey = await getFlutterwaveSecretKey();
    if (secretKey) {
      try {
        const flwRes = await fetch(
          `https://api.flutterwave.com/v3/transactions?customer_email=${encodeURIComponent(email)}&status=successful&page=1`,
          {
            headers: { Authorization: `Bearer ${secretKey}` },
            cache: 'no-store',
            signal: AbortSignal.timeout(10000),
          }
        );
        if (flwRes.ok) {
          const flwJson = await flwRes.json();
          const txs = Array.isArray(flwJson?.data) ? flwJson.data : [];
          for (const tx of txs.slice(0, 8)) {
            const ref = String(tx?.tx_ref || '').trim();
            if (!ref || ref.startsWith('FLW_TOPUP_') || tx?.meta?.type === 'wallet_topup') continue;
            if (tx.created_at && new Date(tx.created_at).getTime() < Date.now() - 24 * 60 * 60 * 1000) continue;
            if (seenRefs.has(ref)) continue;
            seenRefs.add(ref);

            const fulfilled = await fulfillVerifiedFlutterwaveVoucher(tx, { tx_ref: ref, email });
            if (fulfilled.ok && fulfilled.voucher_code) {
              vouchers.push({
                voucher_code: fulfilled.voucher_code,
                plan: fulfilled.plan,
                price: fulfilled.price,
                duration: fulfilled.duration,
                tx_ref: ref,
                created_at: tx.created_at,
                is_fallback: !!fulfilled.is_fallback,
              });
            }
          }
        }
      } catch (err) {
        console.warn('Email recovery Flutterwave query warning:', err.message);
      }
    }

    // 2. Also include any already-saved recent voucher transactions for this email in Supabase
    try {
      const { data: recentTxs } = await supabaseAdmin
        .from('transactions')
        .select('flw_ref, metadata, created_at')
        .eq('type', 'voucher_purchase')
        .gte('created_at', cutoffIso)
        .order('created_at', { ascending: false })
        .limit(30);

      for (const tx of recentTxs || []) {
        const txEmail = String(tx.metadata?.customer_email || '').trim().toLowerCase();
        if (txEmail !== email || !tx.flw_ref || seenRefs.has(tx.flw_ref)) continue;
        const { data: v } = await supabaseAdmin
          .from('vouchers')
          .select('voucher_code, profile_name, price, duration, created_at')
          .eq('tx_ref', tx.flw_ref)
          .maybeSingle();
        if (v?.voucher_code) {
          seenRefs.add(tx.flw_ref);
          vouchers.push({
            voucher_code: v.voucher_code,
            plan: v.profile_name,
            price: Number(v.price || 0),
            duration: v.duration || '24h',
            tx_ref: tx.flw_ref,
            created_at: v.created_at,
          });
        }
      }
    } catch {}

    if (vouchers.length === 0) {
      return NextResponse.json({
        status: 'not_found',
        vouchers: [],
        message: 'No completed guest voucher payments were found for this email in the last 24 hours.',
      });
    }

    return NextResponse.json({
      status: 'fulfilled',
      vouchers,
      voucher_code: vouchers[0].voucher_code,
      plan: vouchers[0].plan,
      price: vouchers[0].price,
      duration: vouchers[0].duration,
    });
  } catch (error) {
    console.error('POST /api/purchase/check-tx error:', error);
    return NextResponse.json({ error: 'Unable to recover payment right now' }, { status: 500 });
  }
}
