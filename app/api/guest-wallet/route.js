import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

const GUEST_TOKEN_REGEX = /^gw_[a-f0-9]{24,64}$/i;

/**
 * GET /api/guest-wallet?guest_token=gw_...
 * Returns the authoritative server-stored Guest Wallet balance and recent transactions.
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const guestToken = String(searchParams.get('guest_token') || '').trim();

    if (!GUEST_TOKEN_REGEX.test(guestToken)) {
      return NextResponse.json({ error: 'Valid guest_token is required' }, { status: 400 });
    }

    const { data: walletRow, error: walletErr } = await supabaseAdmin
      .from('guest_wallets')
      .select('guest_token, balance, email, updated_at')
      .eq('guest_token', guestToken)
      .maybeSingle();

    if (walletErr) {
      console.error('Guest wallet fetch error:', walletErr);
      return NextResponse.json({ error: 'Unable to load guest wallet' }, { status: 500 });
    }

    // Fetch recent transactions belonging to this guest_token
    let transactions = [];
    try {
      const { data: txRows } = await supabaseAdmin
        .from('transactions')
        .select('id, type, amount, status, payment_method, flw_ref, metadata, created_at')
        .is('user_id', null)
        .eq('status', 'successful')
        .contains('metadata', { guest_token: guestToken })
        .order('created_at', { ascending: false })
        .limit(50);

      transactions = txRows || [];
    } catch {
      transactions = [];
    }

    return NextResponse.json({
      success: true,
      guest_token: guestToken,
      balance: Number(walletRow?.balance || 0),
      email: walletRow?.email || '',
      transactions,
    });
  } catch (error) {
    console.error('GET /api/guest-wallet error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
