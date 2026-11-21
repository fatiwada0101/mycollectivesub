import { NextResponse } from 'next/server.js';
import { supabaseAdmin, broadcastWalletUpdate } from '@/lib/supabase-server.js';
import { validateAdminAuth, unauthorizedResponse } from '@/lib/admin-auth.js';
import { logChange } from '@/lib/changeHistory.js';

export async function GET(request) {
  if (!(await validateAdminAuth(request))) return unauthorizedResponse();

  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search')?.toLowerCase().trim();

    // 1. Concurrently fetch profiles, wallets, transactions, vouchers, and auth users
    const [profilesRes, walletsRes, txRes, vouchersRes, authRes] = await Promise.all([
      supabaseAdmin.from('profiles').select('*').order('created_at', { ascending: false }),
      supabaseAdmin.from('wallets').select('*'),
      supabaseAdmin.from('transactions').select('user_id, amount, type, status'),
      supabaseAdmin.from('vouchers').select('user_id, id, is_used, status'),
      supabaseAdmin.auth.admin.listUsers({ perPage: 1000 }).catch(() => ({ data: { users: [] } })),
    ]);

    if (profilesRes.error) throw profilesRes.error;

    // 2. Build maps
    const emailMap = {};
    (authRes.data?.users || []).forEach(u => {
      emailMap[u.id] = u.email;
    });

    const walletMap = {};
    (walletsRes.data || []).forEach(w => {
      walletMap[w.user_id] = Number(w.balance) || 0;
    });

    const statsMap = {};
    (txRes.data || []).forEach(t => {
      if (!t.user_id) return;
      if (!statsMap[t.user_id]) statsMap[t.user_id] = { deposits: 0, spent: 0, count: 0 };
      if (t.status === 'successful') {
        statsMap[t.user_id].count++;
        if (t.type === 'wallet_topup') statsMap[t.user_id].deposits += (Number(t.amount) || 0);
        if (t.type === 'voucher_purchase') statsMap[t.user_id].spent += (Number(t.amount) || 0);
      }
    });

    const voucherCountMap = {};
    (vouchersRes.data || []).forEach(v => {
      if (v.user_id) {
        voucherCountMap[v.user_id] = (voucherCountMap[v.user_id] || 0) + 1;
      }
    });

    // 3. Assemble combined user records
    let users = (profilesRes.data || []).map(p => {
      const email = emailMap[p.id] || '—';
      const name = p.full_name || 'Customer';
      const phone = p.phone || '—';
      const walletBalance = walletMap[p.id] || 0;
      const userStats = statsMap[p.id] || { deposits: 0, spent: 0, count: 0 };

      return {
        id: p.id,
        name,
        email,
        phone,
        role: p.role || 'customer',
        wallet_balance: walletBalance,
        total_deposited: userStats.deposits,
        total_spent: userStats.spent,
        transactions_count: userStats.count,
        vouchers_count: voucherCountMap[p.id] || 0,
        created_at: p.created_at,
      };
    });

    // 4. Filter if search parameter provided
    if (search) {
      users = users.filter(u =>
        u.name.toLowerCase().includes(search) ||
        u.email.toLowerCase().includes(search) ||
        u.phone.toLowerCase().includes(search)
      );
    }

    // 5. Compute summary KPI metrics
    const totalUsers = users.length;
    const totalWalletBalance = users.reduce((sum, u) => sum + u.wallet_balance, 0);
    const totalDeposited = users.reduce((sum, u) => sum + u.total_deposited, 0);
    const totalSpent = users.reduce((sum, u) => sum + u.total_spent, 0);

    return NextResponse.json({
      users,
      summary: {
        totalUsers,
        totalWalletBalance,
        totalDeposited,
        totalSpent,
      },
    });
  } catch (error) {
    console.error('Super Admin users fetch error:', error);
    return NextResponse.json({ error: error.message || 'Failed to fetch users' }, { status: 500 });
  }
}

// POST — Admin direct wallet funding / debit for registered customers
export async function POST(request) {
  if (!(await validateAdminAuth(request))) return unauthorizedResponse();

  try {
    const body = await request.json();
    const { user_id, email, amount, operation = 'add', note } = body;

    let targetUserId = user_id || null;
    let targetEmail = (email || '').trim().toLowerCase();

    if (!targetUserId && targetEmail) {
      const { data: authData } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
      const matched = (authData?.users || []).find(
        (u) => (u.email || '').trim().toLowerCase() === targetEmail
      );
      if (matched?.id) {
        targetUserId = matched.id;
      }
    }

    if (!targetUserId) {
      return NextResponse.json({ error: 'Customer account not found (provide valid user_id or registered email)' }, { status: 400 });
    }

    const numAmount = Math.round(Math.abs(Number(amount)) * 100) / 100;
    if (!Number.isFinite(numAmount) || numAmount <= 0 || numAmount > 10_000_000) {
      return NextResponse.json({ error: 'Valid positive amount (₦1 – ₦10,000,000) is required' }, { status: 400 });
    }

    const isDebit = operation === 'subtract' || operation === 'deduct';
    const rpcOp = isDebit ? 'deduct' : 'add';

    // Call atomic wallet adjustment RPC (exact 3-argument signature: p_user_id, p_amount, p_operation)
    const { data: rpcResult, error } = await supabaseAdmin.rpc('adjust_wallet_balance', {
      p_user_id: targetUserId,
      p_amount: numAmount,
      p_operation: rpcOp,
    });

    if (error) throw error;

    const newBalance = Number(rpcResult);
    if (isDebit && newBalance < 0) {
      return NextResponse.json({
        error: 'Insufficient customer wallet balance for this debit amount.',
      }, { status: 400 });
    }

    const adminRef = `ADMIN_${isDebit ? 'DEBIT' : 'FUND'}_${Date.now()}_${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    const cleanNote = String(note || (isDebit ? 'Admin wallet debit' : 'Direct wallet funding by Admin')).trim().slice(0, 300);

    // Record ledger transaction so funding shows in customer wallet history & admin analytics
    let insertedTx = null;
    try {
      const { data: txData } = await supabaseAdmin
        .from('transactions')
        .insert({
          user_id: targetUserId,
          type: isDebit ? 'admin_debit' : 'wallet_topup',
          amount: numAmount,
          status: 'successful',
          payment_method: 'admin_manual',
          flw_ref: adminRef,
          metadata: {
            funded_by: 'super_admin',
            operation: rpcOp,
            note: cleanNote,
          },
        })
        .select('id, user_id, amount, flw_ref, status, created_at')
        .single();
      insertedTx = txData || null;
    } catch (txErr) {
      console.warn('Admin wallet adjustment transaction log warning:', txErr?.message || txErr);
    }

    // Notify customer in-app
    try {
      await supabaseAdmin.from('notifications').insert({
        user_id: targetUserId,
        title: isDebit ? 'Wallet Adjusted by Admin' : 'Wallet Funded by Admin 💰',
        message: isDebit
          ? `₦${numAmount.toLocaleString()} was debited from your wallet (${cleanNote}). New balance: ₦${newBalance.toLocaleString()}.`
          : `₦${numAmount.toLocaleString()} has been added to your wallet (${cleanNote}). New balance: ₦${newBalance.toLocaleString()}.`,
        type: isDebit ? 'info' : 'wallet_credit',
      });
    } catch {}

    // Broadcast live balance update to user's open tabs immediately
    try {
      await broadcastWalletUpdate(targetUserId, newBalance, {
        amount: isDebit ? -numAmount : numAmount,
        flw_ref: adminRef,
        transaction: insertedTx,
      });
    } catch {}

    // Audit trail
    try {
      await logChange({
        category: 'finance',
        action: isDebit ? 'wallet_debit' : 'wallet_credit',
        summary: `Admin ${isDebit ? 'debited' : 'funded'} ₦${numAmount.toLocaleString()} (${targetEmail || targetUserId}): ${cleanNote}`,
        beforeState: {},
        afterState: { user_id: targetUserId, amount: numAmount, operation: rpcOp, new_balance: newBalance, ref: adminRef },
        metadata: { user_id: targetUserId, ref: adminRef, note: cleanNote },
      });
    } catch {}

    return NextResponse.json({
      success: true,
      new_balance: newBalance,
      reference: adminRef,
      message: `Successfully ${isDebit ? 'debited' : 'funded'} ₦${numAmount.toLocaleString()}. New balance: ₦${newBalance.toLocaleString()}`,
    });
  } catch (error) {
    console.error('Admin wallet adjustment error:', error);
    return NextResponse.json({ error: error.message || 'Failed to adjust wallet' }, { status: 500 });
  }
}
