'use client';

import { useState, useEffect, useCallback } from 'react';
import { RefreshIcon, WalletIcon, UsersIcon } from '../../components/Icons';

export default function UsersTab({ adminHeaders, formatPrice, showToast }) {
  const [users, setUsers] = useState([]);
  const [summary, setSummary] = useState({ totalUsers: 0, totalWalletBalance: 0, totalDeposited: 0, totalSpent: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Modal for direct wallet funding / adjustment
  const [selectedUser, setSelectedUser] = useState(null);
  const [quickFundOpen, setQuickFundOpen] = useState(false);
  const [quickFundEmail, setQuickFundEmail] = useState('');
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustOp, setAdjustOp] = useState('add'); // 'add' | 'subtract'
  const [adjustNote, setAdjustNote] = useState('');
  const [adjusting, setAdjusting] = useState(false);
  const PRESET_AMOUNTS = [100, 250, 500, 1000, 2000, 5000];

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const q = search.trim() ? `?search=${encodeURIComponent(search.trim())}` : '';
      const res = await fetch(`/api/super-admin/users${q}`, { headers: adminHeaders() });
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
        setSummary(data.summary || { totalUsers: 0, totalWalletBalance: 0, totalDeposited: 0, totalSpent: 0 });
      } else {
        showToast('Failed to load customers');
      }
    } catch (err) {
      console.error('Fetch users error:', err);
      showToast('Network error loading users');
    } finally {
      setLoading(false);
    }
  }, [adminHeaders, search, showToast]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleAdjustWallet = async (e) => {
    e.preventDefault();
    const targetEmail = quickFundEmail.trim();
    if ((!selectedUser && !targetEmail) || !adjustAmount) return;
    const num = Number(adjustAmount);
    if (isNaN(num) || num <= 0) {
      showToast('Please enter a valid amount');
      return;
    }

    setAdjusting(true);
    try {
      const res = await fetch('/api/super-admin/users', {
        method: 'POST',
        headers: {
          ...adminHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: selectedUser?.id || undefined,
          email: !selectedUser ? targetEmail : undefined,
          amount: num,
          operation: adjustOp,
          note: adjustNote || (adjustOp === 'add' ? 'Direct wallet funding by Admin' : 'Admin wallet debit'),
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        showToast('✅ ' + (data.message || 'Wallet funded successfully!'));
        setSelectedUser(null);
        setQuickFundOpen(false);
        setQuickFundEmail('');
        setAdjustAmount('');
        setAdjustNote('');
        fetchUsers();
      } else {
        showToast('❌ ' + (data.error || 'Failed to adjust wallet'));
      }
    } catch (err) {
      console.error('Adjust wallet error:', err);
      showToast('Network error');
    } finally {
      setAdjusting(false);
    }
  };

  const getInitials = (name) => {
    if (!name) return 'U';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return name.slice(0, 2).toUpperCase();
  };

  return (
    <div className="sa-tab-body">
      {/* Top Summary Cards */}
      <div className="sa-kpi-grid">
        <div className="sa-kpi-card sa-kpi-hero">
          <div className="sa-kpi-top">
            <span className="sa-kpi-label">Registered Customers</span>
            <div className="sa-kpi-icon-mini"><UsersIcon size={16} color="#7257FF" /></div>
          </div>
          <div className="sa-kpi-value">{summary.totalUsers}</div>
          <div className="sa-kpi-footer">Active platform accounts</div>
        </div>

        <div className="sa-kpi-card">
          <div className="sa-kpi-top">
            <span className="sa-kpi-label">Total Wallet Balance</span>
            <div className="sa-kpi-icon-mini"><WalletIcon size={16} color="#10B981" /></div>
          </div>
          <div className="sa-kpi-value sa-color-green">{formatPrice(summary.totalWalletBalance)}</div>
          <div className="sa-kpi-footer">Customer balances in custody</div>
        </div>

        <div className="sa-kpi-card">
          <div className="sa-kpi-top">
            <span className="sa-kpi-label">Total Deposits</span>
          </div>
          <div className="sa-kpi-value" style={{ color: '#60A5FA' }}>{formatPrice(summary.totalDeposited)}</div>
          <div className="sa-kpi-footer">Lifetime customer wallet funding</div>
        </div>

        <div className="sa-kpi-card">
          <div className="sa-kpi-top">
            <span className="sa-kpi-label">Total Pass Spend</span>
          </div>
          <div className="sa-kpi-value" style={{ color: '#C4B5FD' }}>{formatPrice(summary.totalSpent)}</div>
          <div className="sa-kpi-footer">Spent by users on Wi-Fi passes</div>
        </div>
      </div>

      {/* Main Customers List */}
      <div className="sa-glass-card" style={{ marginTop: 24 }}>
        <div className="sa-card-header" style={{ flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h3 className="sa-card-title">Customer Accounts Directory</h3>
            <p className="sa-card-sub">Registered platform users, login emails, and wallet balances</p>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              type="text"
              placeholder="Search by name, email, phone..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                background: 'var(--sa-surface, #F8FAFC)',
                color: 'var(--sa-text, #0F172A)',
                border: '1px solid var(--sa-border, #CBD5E1)',
                borderRadius: 10,
                padding: '8px 14px',
                fontSize: '0.85rem',
                minWidth: 230,
              }}
            />
            <button
              className="sa-btn-primary"
              onClick={() => {
                setSelectedUser(null);
                setAdjustOp('add');
                setAdjustAmount('');
                setAdjustNote('');
                setQuickFundEmail('');
                setQuickFundOpen(true);
              }}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', fontSize: '0.85rem', background: 'linear-gradient(135deg, #062B66 0%, #0088FF 100%)', border: 'none' }}
            >
              <span>💰</span> Fund User Wallet
            </button>
            <button
              className="sa-btn-outline"
              onClick={fetchUsers}
              disabled={loading}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', fontSize: '0.85rem' }}
            >
              <RefreshIcon size={14} /> Refresh
            </button>
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 48, color: '#8E8E93' }}>
            Loading customer accounts...
          </div>
        ) : users.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 48, color: '#8E8E93' }}>
            No customer accounts found matching your query.
          </div>
        ) : (
          <div className="sa-table-responsive">
            <table className="sa-modern-table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Wallet Balance</th>
                  <th>Deposited</th>
                  <th>Spent</th>
                  <th>Activity</th>
                  <th>Role</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                          width: 34,
                          height: 34,
                          borderRadius: '50%',
                          background: 'linear-gradient(135deg, #7257FF, #34A853)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 700,
                          fontSize: '0.8rem',
                          color: '#fff',
                          flexShrink: 0
                        }}>
                          {getInitials(u.name)}
                        </div>
                        <div>
                          <strong style={{ fontSize: '0.9rem' }}>{u.name}</strong>
                          <div style={{ fontSize: '0.75rem', color: '#8E8E93' }}>
                            Joined {new Date(u.created_at).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td>
                      <a href={`mailto:${u.email}`} style={{ color: '#C4B5FD', textDecoration: 'none', fontSize: '0.85rem' }}>
                        {u.email}
                      </a>
                    </td>

                    <td style={{ fontSize: '0.85rem', color: u.phone !== '—' ? '#fff' : '#8E8E93' }}>
                      {u.phone}
                    </td>

                    <td>
                      <span className="sa-badge" style={{
                        background: u.wallet_balance > 0 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255,255,255,0.06)',
                        color: u.wallet_balance > 0 ? '#10B981' : '#8E8E93',
                        fontWeight: 700,
                        fontSize: '0.85rem',
                      }}>
                        {formatPrice(u.wallet_balance)}
                      </span>
                    </td>

                    <td style={{ fontSize: '0.85rem', color: '#10B981', fontWeight: 600 }}>
                      {formatPrice(u.total_deposited)}
                    </td>

                    <td style={{ fontSize: '0.85rem', color: '#C4B5FD', fontWeight: 600 }}>
                      {formatPrice(u.total_spent)}
                    </td>

                    <td style={{ fontSize: '0.8rem', color: '#8E8E93' }}>
                      <div>{u.transactions_count} Tx</div>
                      <div>{u.vouchers_count} Pass{u.vouchers_count === 1 ? '' : 'es'}</div>
                    </td>

                    <td>
                      <span className="sa-badge" style={{
                        textTransform: 'uppercase',
                        fontSize: '0.7rem',
                        background: u.role === 'admin' ? 'rgba(239, 68, 68, 0.15)' : u.role === 'reseller' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(114, 87, 255, 0.15)',
                        color: u.role === 'admin' ? '#EF4444' : u.role === 'reseller' ? '#F59E0B' : '#C4B5FD',
                      }}>
                        {u.role}
                      </span>
                    </td>

                    <td>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button
                          className="sa-btn-pill-small"
                          onClick={() => {
                            setSelectedUser(u);
                            setAdjustOp('add');
                            setAdjustAmount('');
                            setAdjustNote('');
                            setQuickFundOpen(false);
                          }}
                          style={{ fontSize: '0.75rem', padding: '5px 11px', background: 'linear-gradient(135deg, #062B66 0%, #0088FF 100%)', color: '#FFFFFF', border: 'none', fontWeight: 700 }}
                        >
                          + Fund
                        </button>
                        <button
                          className="sa-btn-pill-small"
                          onClick={() => {
                            setSelectedUser(u);
                            setAdjustOp('subtract');
                            setAdjustAmount('');
                            setAdjustNote('');
                            setQuickFundOpen(false);
                          }}
                          style={{ fontSize: '0.75rem', padding: '5px 10px', background: 'rgba(239, 68, 68, 0.12)', color: '#EF4444', border: '1px solid rgba(239, 68, 68, 0.3)', fontWeight: 700 }}
                        >
                          Debit
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal for Direct Wallet Funding / Adjustment */}
      {(selectedUser || quickFundOpen) && (
        <div className="sa-modal-backdrop" onClick={() => { setSelectedUser(null); setQuickFundOpen(false); }}>
          <div className="sa-modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 460 }}>
            <div className="sa-card-header">
              <div>
                <h3 className="sa-card-title">
                  {adjustOp === 'subtract' ? 'Debit Customer Wallet' : '💰 Fund Customer Wallet'}
                </h3>
                <p className="sa-card-sub">
                  {selectedUser
                    ? `${selectedUser.name} (${selectedUser.email})`
                    : 'Select a customer or enter their registered email'}
                </p>
              </div>
              <button className="sa-btn-pill-small" onClick={() => { setSelectedUser(null); setQuickFundOpen(false); }}>✕</button>
            </div>

            <form onSubmit={handleAdjustWallet} style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 14 }}>
              {selectedUser ? (
                <div style={{
                  background: 'rgba(0, 136, 255, 0.08)',
                  border: '1px solid rgba(0, 136, 255, 0.2)',
                  padding: '12px 16px',
                  borderRadius: 10,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}>
                  <span style={{ opacity: 0.75, fontSize: '0.85rem', fontWeight: 600 }}>Current Balance</span>
                  <strong style={{ fontSize: '1.1rem', color: '#035EC8' }}>{formatPrice(selectedUser.wallet_balance)}</strong>
                </div>
              ) : (
                <div className="sa-field-box">
                  <label>Select Customer or Type Email *</label>
                  <select
                    value={selectedUser?.id || ''}
                    onChange={(e) => {
                      const found = users.find((u) => u.id === e.target.value);
                      if (found) {
                        setSelectedUser(found);
                        setQuickFundEmail('');
                      }
                    }}
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      borderRadius: 8,
                      border: '1px solid var(--sa-border, #CBD5E1)',
                      background: 'var(--sa-surface, #FFFFFF)',
                      color: 'var(--sa-text, #0F172A)',
                      marginBottom: 8,
                    }}
                  >
                    <option value="">-- Choose from registered users ({users.length}) --</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} — {u.email} (Bal: {formatPrice(u.wallet_balance)})
                      </option>
                    ))}
                  </select>
                  <input
                    type="email"
                    placeholder="Or type registered customer email..."
                    value={quickFundEmail}
                    onChange={e => setQuickFundEmail(e.target.value)}
                    required={!selectedUser}
                    style={{
                      background: 'var(--sa-surface, #FFFFFF)',
                      color: 'var(--sa-text, #0F172A)',
                      border: '1px solid var(--sa-border, #CBD5E1)',
                      borderRadius: 8,
                      padding: '9px 12px',
                      width: '100%',
                    }}
                  />
                </div>
              )}

              <div className="sa-field-box">
                <label>Operation</label>
                <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
                  <button
                    type="button"
                    className="sa-btn-outline"
                    onClick={() => setAdjustOp('add')}
                    style={{
                      flex: 1,
                      background: adjustOp === 'add' ? '#0088FF' : 'transparent',
                      color: adjustOp === 'add' ? '#fff' : 'inherit',
                      borderColor: adjustOp === 'add' ? '#0088FF' : 'var(--sa-border, #CBD5E1)',
                      padding: '8px 12px',
                      fontWeight: 700,
                    }}
                  >
                    + Fund (Credit)
                  </button>
                  <button
                    type="button"
                    className="sa-btn-outline"
                    onClick={() => setAdjustOp('subtract')}
                    style={{
                      flex: 1,
                      background: adjustOp === 'subtract' ? '#EF4444' : 'transparent',
                      color: adjustOp === 'subtract' ? '#fff' : 'inherit',
                      borderColor: adjustOp === 'subtract' ? '#EF4444' : 'var(--sa-border, #CBD5E1)',
                      padding: '8px 12px',
                      fontWeight: 700,
                    }}
                  >
                    - Debit (Deduct)
                  </button>
                </div>
              </div>

              <div className="sa-field-box">
                <label>Amount (₦) *</label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                  {PRESET_AMOUNTS.map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setAdjustAmount(String(amt))}
                      style={{
                        padding: '5px 10px',
                        borderRadius: 999,
                        fontSize: '12px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        border: Number(adjustAmount) === amt ? '1.5px solid #0088FF' : '1px solid var(--sa-border, #CBD5E1)',
                        background: Number(adjustAmount) === amt ? '#EFF6FF' : 'transparent',
                        color: Number(adjustAmount) === amt ? '#035EC8' : 'inherit',
                      }}
                    >
                      ₦{amt.toLocaleString()}
                    </button>
                  ))}
                </div>
                <input
                  type="number"
                  placeholder="e.g. 500"
                  min="1"
                  value={adjustAmount}
                  onChange={e => setAdjustAmount(e.target.value)}
                  required
                  style={{
                    background: 'var(--sa-surface, #FFFFFF)',
                    color: 'var(--sa-text, #0F172A)',
                    border: '1px solid var(--sa-border, #CBD5E1)',
                    borderRadius: 8,
                    padding: '10px 14px',
                    fontSize: '1rem',
                    fontWeight: 700,
                    width: '100%',
                  }}
                />
              </div>

              <div className="sa-field-box">
                <label>Reason / Note</label>
                <input
                  type="text"
                  placeholder="e.g. Cash payment received, bank transfer credit"
                  value={adjustNote}
                  onChange={e => setAdjustNote(e.target.value)}
                  style={{
                    background: 'var(--sa-surface, #FFFFFF)',
                    color: 'var(--sa-text, #0F172A)',
                    border: '1px solid var(--sa-border, #CBD5E1)',
                    borderRadius: 8,
                    padding: '10px 14px',
                    width: '100%',
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
                <button
                  type="button"
                  className="sa-btn-outline"
                  onClick={() => { setSelectedUser(null); setQuickFundOpen(false); }}
                  disabled={adjusting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="sa-btn-primary"
                  disabled={adjusting}
                  style={{
                    background: adjustOp === 'subtract' ? '#EF4444' : 'linear-gradient(135deg, #062B66 0%, #0088FF 100%)',
                    borderColor: adjustOp === 'subtract' ? '#EF4444' : '#0088FF',
                  }}
                >
                  {adjusting ? 'Processing...' : `Confirm ${adjustOp === 'add' ? 'Funding' : 'Debit'}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
