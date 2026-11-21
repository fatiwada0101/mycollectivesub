'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createPaymentHeaders } from '../../lib/payment-client.js';
import {
  getPendingOrders,
  removePendingOrder,
  saveGuestVoucher,
} from '../../lib/guest-vouchers.js';

/**
 * PendingPaymentBanner
 * Automatically recovers paid Flutterwave guest/user vouchers stored in localStorage
 * whenever the user returns from OPay / PalmPay / Moniepoint or reloads the page.
 * Also provides 1-tap "Verify Now" and manual email recovery when Captive Portal WebViews clear storage.
 */
export default function PendingPaymentBanner({ showManualRecovery = false, onVoucherRecovered }) {
  const router = useRouter();
  const [pendingOrders, setPendingOrders] = useState([]);
  const [checkingRef, setCheckingRef] = useState('');
  const [recoveredVoucher, setRecoveredVoucher] = useState(null);
  const [copied, setCopied] = useState(false);

  // Manual recovery by email or tx_ref
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [recoveryInput, setRecoveryInput] = useState('');
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const [recoveryMessage, setRecoveryMessage] = useState('');

  const syncList = useCallback(() => {
    setPendingOrders(getPendingOrders());
  }, []);

  const checkOrder = useCallback(async (order, silent = false) => {
    if (!order?.tx_ref) return false;
    if (!silent) setCheckingRef(order.tx_ref);
    try {
      const res = await fetch(`/api/purchase/check-tx?tx_ref=${encodeURIComponent(order.tx_ref)}`, {
        cache: 'no-store',
      });
      if (!res.ok) return false;
      const data = await res.json();
      if (data?.status === 'fulfilled' && data.voucher_code) {
        const entry = {
          code: data.voucher_code,
          plan: data.plan || order.plan_name || 'Wi-Fi Pass',
          duration: data.duration || order.duration || '24h',
          price: Number(data.price || order.price || 0),
          purchasedAt: Date.now(),
          isUsed: false,
          isFallback: !!data.is_fallback,
        };
        saveGuestVoucher(entry);
        removePendingOrder(order.tx_ref);
        setRecoveredVoucher(entry);
        syncList();
        onVoucherRecovered?.(entry);
        return true;
      }
    } catch {}
    finally {
      if (!silent) setCheckingRef('');
    }
    return false;
  }, [onVoucherRecovered, syncList]);

  const checkAllPending = useCallback(async () => {
    const orders = getPendingOrders();
    setPendingOrders(orders);
    for (const order of orders) {
      await checkOrder(order, true);
    }
  }, [checkOrder]);

  useEffect(() => {
    checkAllPending();

    const handleResume = () => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') {
        checkAllPending();
      }
    };
    const handleStorage = () => syncList();

    window.addEventListener('focus', handleResume);
    window.addEventListener('visibilitychange', handleResume);
    window.addEventListener('pending_orders_updated', handleStorage);
    window.addEventListener('storage', handleStorage);

    // Poll every 8s while any pending order exists
    const timer = setInterval(() => {
      if (getPendingOrders().length > 0) {
        checkAllPending();
      }
    }, 8000);

    return () => {
      window.removeEventListener('focus', handleResume);
      window.removeEventListener('visibilitychange', handleResume);
      window.removeEventListener('pending_orders_updated', handleStorage);
      window.removeEventListener('storage', handleStorage);
      clearInterval(timer);
    };
  }, [checkAllPending, syncList]);

  const handleManualRecover = async (e) => {
    e.preventDefault();
    const val = recoveryInput.trim();
    if (!val) return;
    setRecoveryLoading(true);
    setRecoveryMessage('');
    try {
      const payload = val.includes('@') ? { email: val } : { tx_ref: val };
      const res = await fetch('/api/purchase/check-tx', {
        method: 'POST',
        headers: createPaymentHeaders(),
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data?.status === 'fulfilled' && data.voucher_code) {
        const list = Array.isArray(data.vouchers) && data.vouchers.length > 0
          ? data.vouchers
          : [{
              voucher_code: data.voucher_code,
              plan: data.plan || 'Wi-Fi Pass',
              duration: data.duration || '24h',
              price: Number(data.price || 0),
              tx_ref: data.tx_ref || val,
              is_fallback: !!data.is_fallback,
            }];
        let firstEntry = null;
        for (const item of list) {
          const entry = {
            code: item.voucher_code,
            plan: item.plan || 'Wi-Fi Pass',
            duration: item.duration || '24h',
            price: Number(item.price || 0),
            purchasedAt: item.created_at ? new Date(item.created_at).getTime() : Date.now(),
            isUsed: false,
            isFallback: !!item.is_fallback,
          };
          saveGuestVoucher(entry);
          if (item.tx_ref) removePendingOrder(item.tx_ref);
          if (!firstEntry) firstEntry = entry;
        }
        setRecoveredVoucher(firstEntry);
        setRecoveryInput('');
        setRecoveryOpen(false);
        syncList();
        onVoucherRecovered?.(firstEntry);
      } else {
        setRecoveryMessage(data.message || data.error || 'No completed payment found yet. Wait 10 seconds after transfer and try again.');
      }
    } catch {
      setRecoveryMessage('Network error while checking payment. Please try again.');
    } finally {
      setRecoveryLoading(false);
    }
  };

  if (!recoveredVoucher && pendingOrders.length === 0 && !showManualRecovery) {
    return null;
  }

  return (
    <div style={{ marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {/* Celebratory Recovered Voucher Banner */}
      {recoveredVoucher && (
        <div style={{
          background: 'linear-gradient(135deg, #062B66 0%, #035EC8 100%)',
          color: '#FFFFFF',
          borderRadius: '18px',
          padding: '16px',
          boxShadow: '0 8px 24px rgba(0, 136, 255, 0.28)',
          border: '1.5px solid #38BDF8',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: 800, color: '#BAE6FD', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              🎉 Payment Confirmed — Wi-Fi Pass Ready!
            </span>
            <button
              type="button"
              onClick={() => setRecoveredVoucher(null)}
              style={{ background: 'rgba(255,255,255,0.16)', border: 'none', color: '#fff', borderRadius: '999px', padding: '2px 8px', fontSize: '11px', cursor: 'pointer' }}
            >
              ✕
            </button>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: '12px', opacity: 0.85 }}>{recoveredVoucher.plan}</div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '22px', fontWeight: 900, letterSpacing: '2px' }}>
                {recoveredVoucher.code}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(recoveredVoucher.code);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                style={{
                  padding: '8px 14px',
                  borderRadius: '999px',
                  background: '#FFFFFF',
                  color: '#062B66',
                  border: 'none',
                  fontSize: '12px',
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                {copied ? '✓ Copied' : 'Copy PIN'}
              </button>
              <button
                type="button"
                onClick={() => router.push(`/vouchers/status?code=${encodeURIComponent(recoveredVoucher.code)}`)}
                style={{
                  padding: '8px 14px',
                  borderRadius: '999px',
                  background: 'rgba(255,255,255,0.18)',
                  color: '#FFFFFF',
                  border: '1px solid rgba(255,255,255,0.35)',
                  fontSize: '12px',
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                Connect Now →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pending Flutterwave Bank Transfer Auto-Recovery Cards */}
      {pendingOrders.map((order) => (
        <div
          key={order.tx_ref}
          style={{
            background: '#FFFBEB',
            border: '1.5px solid #FCD34D',
            borderRadius: '16px',
            padding: '12px 14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '10px',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ minWidth: 0, flex: '1 1 180px' }}>
            <div style={{ fontSize: '12.5px', fontWeight: 800, color: '#92400E' }}>
              ⏳ Paid via Bank Transfer? ({order.plan_name} • ₦{Number(order.price || 0).toLocaleString()})
            </div>
            <div style={{ fontSize: '11px', color: '#B45309', marginTop: '2px' }}>
              Auto-checking Flutterwave... Tap Verify if you already sent the transfer from OPay, PalmPay, or Moniepoint.
            </div>
          </div>
          <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
            <button
              type="button"
              disabled={checkingRef === order.tx_ref}
              onClick={() => checkOrder(order, false)}
              style={{
                padding: '7px 12px',
                borderRadius: '999px',
                background: 'linear-gradient(135deg, #062B66 0%, #0088FF 100%)',
                color: '#FFFFFF',
                border: 'none',
                fontSize: '11.5px',
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              {checkingRef === order.tx_ref ? 'Checking...' : '✓ Verify & Claim'}
            </button>
            <button
              type="button"
              onClick={() => {
                removePendingOrder(order.tx_ref);
                syncList();
              }}
              style={{
                padding: '7px 10px',
                borderRadius: '999px',
                background: 'transparent',
                color: '#92400E',
                border: '1px solid #F59E0B',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Dismiss
            </button>
          </div>
        </div>
      ))}

      {/* Optional Manual Recovery Trigger (for guests whose captive portal cleared localStorage) */}
      {showManualRecovery && (
        <div style={{
          background: '#F8FAFC',
          border: '1.5px solid #CBD5E1',
          borderRadius: '16px',
          padding: '12px 14px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '12.5px', fontWeight: 700, color: '#0F172A' }}>
              Paid as Guest via Bank Transfer and didn&apos;t see your PIN?
            </span>
            <button
              type="button"
              onClick={() => {
                setRecoveryOpen(!recoveryOpen);
                setRecoveryMessage('');
              }}
              style={{
                padding: '6px 12px',
                borderRadius: '999px',
                background: '#EFF6FF',
                color: '#035EC8',
                border: '1px solid #BFDBFE',
                fontSize: '11.5px',
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              {recoveryOpen ? 'Hide' : '🔍 Claim Paid Pass'}
            </button>
          </div>

          {recoveryOpen && (
            <form onSubmit={handleManualRecover} style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <input
                  type="text"
                  value={recoveryInput}
                  onChange={(e) => setRecoveryInput(e.target.value)}
                  placeholder="Enter the email you used at checkout (or FLW_ ref)"
                  required
                  style={{
                    flex: '1 1 200px',
                    padding: '9px 12px',
                    borderRadius: '12px',
                    border: '1.5px solid #CBD5E1',
                    fontSize: '13px',
                    background: '#FFFFFF',
                    color: '#0F172A',
                  }}
                />
                <button
                  type="submit"
                  disabled={recoveryLoading}
                  style={{
                    padding: '9px 16px',
                    borderRadius: '12px',
                    background: 'linear-gradient(135deg, #062B66 0%, #0088FF 100%)',
                    color: '#FFFFFF',
                    border: 'none',
                    fontSize: '12.5px',
                    fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  {recoveryLoading ? 'Checking...' : 'Recover Pass'}
                </button>
              </div>
              {recoveryMessage && (
                <div style={{ fontSize: '12px', color: '#B45309', fontWeight: 600 }}>
                  {recoveryMessage}
                </div>
              )}
            </form>
          )}
        </div>
      )}
    </div>
  );
}
