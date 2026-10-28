'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from './context/AuthContext';
import { useBranding } from './context/BrandingContext';
import { supabase } from '../lib/supabase';
import BottomNav from './components/BottomNav';
import SideDrawer from './components/SideDrawer';
import CheckoutModal from './components/CheckoutModal';
import PwaInstallBanner from './components/PwaInstallBanner';
import {
  MenuSliderIcon,
  BellIcon,
  ArrowUpRightIcon,
  WalletIcon,
  WifiIcon,
  PlusIcon,
  ShieldIcon,
  ActivityIcon,
} from './components/Icons';

// Calculate duration in milliseconds from duration string or plan name
function getDurationMs(durationStr, planName) {
  const str = ((durationStr || '') + ' ' + (planName || '')).toLowerCase();
  if (str.includes('30 day') || str.includes('30d') || str.includes('month')) return 30 * 24 * 60 * 60 * 1000;
  if (str.includes('7 day') || str.includes('7d') || str.includes('week')) return 7 * 24 * 60 * 60 * 1000;
  if (str.includes('3 day') || str.includes('3d')) return 3 * 24 * 60 * 60 * 1000;
  if (str.includes('24h') || str.includes('24 hour') || str.includes('1 day') || str.includes('daily')) return 24 * 60 * 60 * 1000;
  if (str.includes('12h') || str.includes('12 hour')) return 12 * 60 * 60 * 1000;
  if (str.includes('6h') || str.includes('6 hour')) return 6 * 60 * 60 * 1000;
  if (str.includes('3h') || str.includes('3 hour')) return 3 * 60 * 60 * 1000;
  if (str.includes('2h') || str.includes('2 hour')) return 2 * 60 * 60 * 1000;
  if (str.includes('1h') || str.includes('1 hour') || str.includes('hourly')) return 1 * 60 * 60 * 1000;
  return 24 * 60 * 60 * 1000;
}

export default function HomePage() {
  const router = useRouter();
  const { user, profile, wallet, refreshWallet, loading: authLoading } = useAuth();
  const { appName } = useBranding();

  // Gate: if not logged in and no guest session, redirect to landing
  useEffect(() => {
    if (authLoading) return; // wait for auth to resolve
    if (!user) {
      const isGuest = typeof window !== 'undefined' && localStorage.getItem('asuk_guest_session');
      if (!isGuest) {
        router.replace('/landing');
      }
    }
  }, [user, authLoading, router]);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [balanceHidden, setBalanceHidden] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [toast, setToast] = useState('');
  const [plans, setPlans] = useState([]);

  // Active Voucher & Live Expiry Tracking
  const [activeVoucher, setActiveVoucher] = useState(null);
  const [countdownText, setCountdownText] = useState('Checking...');
  const [isPassActive, setIsPassActive] = useState(false);
  const [copiedPin, setCopiedPin] = useState(false);

  // Notifications
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifOpen, setNotifOpen] = useState(false);

  // Real balance — 0 for guests, actual wallet balance for logged-in users
  const walletBalance = wallet ? parseFloat(wallet.balance) : 0;
  const displayName = profile?.full_name || (user?.email ? user.email.split('@')[0] : 'Guest');
  const initials = displayName.charAt(0).toUpperCase();

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3200);
  };

  const formatPrice = (amount) => '₦' + Number(amount || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  // Fetch plans from DB
  useEffect(() => {
    const fetchPlans = async () => {
      try {
        const res = await fetch('/api/super-admin/plans');
        if (res.ok) {
          const data = await res.json();
          setPlans(data);
        }
      } catch (err) {
        console.error('Error fetching plans:', err);
      }
    };
    fetchPlans();
  }, []);

  // Fetch notifications
  useEffect(() => {
    if (!user) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }

    const fetchNotifications = async () => {
      try {
        const res = await fetch(`/api/notifications?user_id=${user.id}`);
        if (res.ok) {
          const data = await res.json();
          setNotifications(data.notifications || []);
          setUnreadCount(data.unread_count || 0);
        }
      } catch (err) {
        console.error('Error fetching notifications:', err);
      }
    };

    fetchNotifications();
    // Refresh every 30 seconds
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [user]);

  const markAllRead = async () => {
    if (!user || unreadCount === 0) return;
    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id, mark_all: true }),
      });
      setUnreadCount(0);
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    } catch (err) {
      console.error('Error marking notifications read:', err);
    }
  };

  // Sync Active Voucher from local storage and Supabase
  const syncActiveVoucher = useCallback(async () => {
    let candidate = null;

    // 1. Check localStorage first (instant for guests and immediate post-checkout)
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('asuk_active_voucher');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed && parsed.code) {
            candidate = {
              code: parsed.code,
              plan: parsed.plan || 'Wi-Fi Pass',
              duration: parsed.duration || '24h',
              purchasedAt: parsed.purchasedAt || Date.now(),
              isUsed: parsed.isUsed !== undefined ? parsed.isUsed : false,
            };
          }
        }
      } catch (e) {
        console.error('Error reading localStorage voucher:', e);
      }
    }

    // 2. If user is logged in, query latest voucher from Supabase
    if (user) {
      try {
        const { data, error } = await supabase
          .from('vouchers')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (data && !error) {
          const dbPurchasedAt = new Date(data.created_at).getTime();
          // Prefer Supabase if candidate is missing or if DB record is equal/newer
          if (!candidate || dbPurchasedAt >= (candidate.purchasedAt - 60000)) {
            candidate = {
              code: data.voucher_code,
              plan: data.profile_name || 'Wi-Fi Pass',
              duration: data.profile_name || '24h',
              purchasedAt: dbPurchasedAt,
              isUsed: !!data.is_used,
              status: data.status,
            };
          }
        }
      } catch (err) {
        console.error('Error fetching latest user voucher:', err);
      }
    }

    if (candidate) {
      // If the voucher is not used yet, the session timer has NOT started.
      if (!candidate.isUsed) {
        setActiveVoucher({ ...candidate, isUnused: true, expiresAt: null });
        setCountdownText('Ready to Connect');
        setIsPassActive(true);
      } else {
        const durationMs = getDurationMs(candidate.duration, candidate.plan);
        const expiresAt = candidate.purchasedAt + durationMs;
        setActiveVoucher({ ...candidate, isUnused: false, expiresAt });
      }
    } else {
      setActiveVoucher(null);
      setCountdownText('No Active Pass');
      setIsPassActive(false);
    }
  }, [user]);

  // Initial load and listen for checkout updates
  useEffect(() => {
    syncActiveVoucher();

    const handleUpdate = () => syncActiveVoucher();
    window.addEventListener('active_voucher_updated', handleUpdate);
    window.addEventListener('storage', handleUpdate);

    return () => {
      window.removeEventListener('active_voucher_updated', handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, [syncActiveVoucher]);

  // Live real-time countdown timer (ticks every 1 second only if voucher is actively used)
  useEffect(() => {
    if (!activeVoucher) {
      setCountdownText('No Active Pass');
      setIsPassActive(false);
      return;
    }

    // Pass is ready to use, timer starts on first login
    if (activeVoucher.isUnused || !activeVoucher.expiresAt) {
      setCountdownText('Ready to Connect');
      setIsPassActive(true);
      return;
    }

    const updateTimer = () => {
      const remainingMs = activeVoucher.expiresAt - Date.now();

      if (remainingMs > 0) {
        setIsPassActive(true);
        const totalSecs = Math.floor(remainingMs / 1000);
        const days = Math.floor(totalSecs / 86400);
        const hours = Math.floor((totalSecs % 86400) / 3600);
        const mins = Math.floor((totalSecs % 3600) / 60);
        const secs = totalSecs % 60;

        if (days > 0) {
          setCountdownText(`${days}d ${hours}h left`);
        } else {
          setCountdownText(
            `${String(hours).padStart(2, '0')}h ${String(mins).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s`
          );
        }
      } else {
        setIsPassActive(false);
        setCountdownText('Pass Expired');
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [activeVoucher]);

  // Copy PIN code handler
  const handleCopyPin = (e) => {
    e.stopPropagation();
    if (activeVoucher?.code) {
      navigator.clipboard.writeText(activeVoucher.code);
      setCopiedPin(true);
      showToast(`✅ Hotspot PIN ${activeVoucher.code} copied! Enter on router page.`);
      setTimeout(() => setCopiedPin(false), 2000);
    } else {
      showToast('No active voucher. Tap Quick Pass to purchase one!');
    }
  };

  const handleOpenCheckout = (plan) => {
    setSelectedPlan(plan);
    setCheckoutOpen(true);
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  return (
    <div className="app-shell" style={{ paddingBottom: '96px' }}>
      <SideDrawer isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} />

      <CheckoutModal
        isOpen={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        plan={selectedPlan}
        onSuccess={() => {
          if (user) refreshWallet();
          syncActiveVoucher();
          showToast('Voucher generated successfully!');
        }}
      />

      {/* ── Top Bar (Redesigned Navbar) ── */}
      <header className="top-nav-bar" style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '16px 0 12px',
        position: 'relative',
        zIndex: 40,
      }}>
        {/* Left: Menu Hamburger */}
        <div className="top-nav-left" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            className="circle-icon-btn"
            onClick={() => setDrawerOpen(true)}
            aria-label="Menu"
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '50%',
              background: 'var(--surface, #FFFFFF)',
              border: '1.5px solid var(--border-light, #ECEEF2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              boxShadow: '0 2px 10px rgba(0, 0, 0, 0.04)',
              transition: 'transform 0.15s ease',
            }}
          >
            <MenuSliderIcon size={20} color="var(--text-primary, #121217)" />
          </button>

          {/* Brand Pill */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 14px',
            background: 'var(--surface, #FFFFFF)',
            borderRadius: '999px',
            border: '1.5px solid var(--border-light, #ECEEF2)',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.03)',
          }}>
            <div style={{
              width: '22px',
              height: '22px',
              borderRadius: '6px',
              background: 'linear-gradient(135deg, #34A853 0%, #1E8E3E 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <WifiIcon size={13} color="#FFFFFF" />
            </div>
            <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-primary, #121217)', letterSpacing: '-0.3px' }}>
              {appName || 'My Collective Sub'}
            </span>
          </div>
        </div>

        {/* Right: Notification Bell & User Avatar */}
        <div className="top-nav-right" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Notification Bell */}
          <div style={{ position: 'relative' }}>
            <button
              className="circle-icon-btn"
              onClick={() => {
                if (user) {
                  setNotifOpen(!notifOpen);
                  if (!notifOpen && unreadCount > 0) markAllRead();
                } else {
                  showToast('Sign in to view notifications');
                }
              }}
              aria-label="Notifications"
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '50%',
                background: 'var(--surface, #FFFFFF)',
                border: '1.5px solid var(--border-light, #ECEEF2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                boxShadow: '0 2px 10px rgba(0, 0, 0, 0.04)',
                position: 'relative',
              }}
            >
              <BellIcon size={20} color="var(--text-primary, #121217)" />
              {unreadCount > 0 && (
                <span style={{
                  position: 'absolute',
                  top: '9px',
                  right: '9px',
                  width: '9px',
                  height: '9px',
                  borderRadius: '50%',
                  background: '#EF4444',
                  boxShadow: '0 0 8px #EF4444',
                }} />
              )}
            </button>

            {/* Notification Dropdown */}
            {notifOpen && (
              <div
                className="notif-dropdown"
                style={{
                  position: 'absolute',
                  top: '52px',
                  right: 0,
                  width: '310px',
                  background: 'var(--surface, #FFFFFF)',
                  borderRadius: '20px',
                  border: '1.5px solid var(--border-light, #ECEEF2)',
                  boxShadow: '0 16px 40px rgba(0, 0, 0, 0.12)',
                  padding: '16px',
                  zIndex: 999,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', borderBottom: '1px solid var(--border-light, #ECEEF2)', paddingBottom: '10px' }}>
                  <strong style={{ fontSize: '14px', color: 'var(--text-primary, #121217)' }}>Notifications</strong>
                  {unreadCount > 0 && (
                    <span style={{ fontSize: '11px', fontWeight: 800, color: '#34A853', background: 'rgba(52, 168, 83, 0.12)', padding: '2px 8px', borderRadius: '999px' }}>
                      {unreadCount} new
                    </span>
                  )}
                </div>
                {notifications.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '20px 0', fontSize: '13px', color: 'var(--text-muted, #8E8E93)' }}>
                    No notifications yet
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '280px', overflowY: 'auto' }}>
                    {notifications.slice(0, 10).map((n) => (
                      <div
                        key={n.id}
                        style={{
                          display: 'flex',
                          gap: '10px',
                          padding: '8px',
                          borderRadius: '12px',
                          background: !n.is_read ? 'rgba(52, 168, 83, 0.06)' : 'transparent',
                        }}
                      >
                        <div style={{ fontSize: '18px' }}>
                          {n.type === 'wallet_credit' ? '💰' : n.type === 'voucher_purchase' ? '🎟️' : '🔔'}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text-primary, #121217)' }}>
                            {n.title}
                          </div>
                          <div style={{ fontSize: '11.5px', color: 'var(--text-muted, #8E8E93)', marginTop: '2px' }}>
                            {n.message}
                          </div>
                          <div style={{ fontSize: '10px', color: '#9CA3AF', marginTop: '4px' }}>
                            {n.created_at ? new Date(n.created_at).toLocaleString(undefined, {
                              month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                            }) : ''}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* User Avatar Circle */}
          <div
            onClick={() => router.push(user ? '/auth' : '/auth')}
            aria-label="User profile"
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #34A853 0%, #1E8E3E 100%)',
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '15px',
              fontWeight: 800,
              cursor: 'pointer',
              border: '2px solid #FFFFFF',
              boxShadow: '0 3px 12px rgba(52, 168, 83, 0.35)',
              position: 'relative',
            }}
          >
            {initials}
            {user && (
              <span style={{
                position: 'absolute',
                bottom: '-1px',
                right: '-1px',
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                background: '#10B981',
                border: '2px solid #FFFFFF',
              }} />
            )}
          </div>
        </div>
      </header>

      {/* ── Greeting Header ── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '10px',
        margin: '12px 0 18px',
      }}>
        <div>
          <h1 style={{
            fontSize: '22px',
            fontWeight: 800,
            color: 'var(--text-primary, #121217)',
            margin: 0,
            letterSpacing: '-0.4px',
          }}>
            {getGreeting()}, {displayName}!
          </h1>
          <p style={{
            fontSize: '13px',
            color: 'var(--text-muted, #8E8E93)',
            margin: '3px 0 0',
          }}>
            Manage your high-speed Wi-Fi &amp; wallet.
          </p>
        </div>

        {/* Live Hotspot Status Pill */}
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '7px',
          padding: '6px 14px',
          borderRadius: '999px',
          background: 'rgba(52, 168, 83, 0.12)',
          border: '1.5px solid rgba(52, 168, 83, 0.28)',
          color: '#34A853',
          fontSize: '12px',
          fontWeight: 800,
        }}>
          <span style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: '#34A853',
            boxShadow: '0 0 10px #34A853',
          }} />
          Hotspot Ready
        </div>
      </div>

      {/* ── Primary Wallet Master Card (Redesigned) ── */}
      <div className="wallet-card-container" style={{ marginBottom: '22px' }}>
        <div
          className="card-front-violet"
          style={{
            background: 'linear-gradient(135deg, #1A4D2E 0%, #153822 50%, #0F2A19 100%)',
            borderRadius: '26px',
            padding: '24px 22px 20px',
            color: '#FFFFFF',
            position: 'relative',
            overflow: 'hidden',
            boxShadow: '0 16px 36px -4px rgba(26, 77, 46, 0.45), 0 0 0 1px rgba(255, 255, 255, 0.12)',
          }}
        >
          {/* Subtle Ambient Radial Glow */}
          <div style={{
            position: 'absolute',
            top: '-60px',
            right: '-60px',
            width: '180px',
            height: '180px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(52, 168, 83, 0.35) 0%, transparent 70%)',
            pointerEvents: 'none',
          }} />

          {/* Top Row: Chip, Wi-Fi Brand & PIN Badge */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {/* Gold Chip Graphic */}
              <div style={{
                width: 32,
                height: 22,
                borderRadius: 5,
                background: 'linear-gradient(135deg, #FFDF00 0%, #D4AF37 100%)',
                border: '1px solid rgba(255, 255, 255, 0.4)',
                boxShadow: 'inset 0 1px 2px rgba(255, 255, 255, 0.6), 0 2px 6px rgba(0,0,0,0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}>
                <div style={{ width: 14, height: 9, border: '1px solid rgba(0,0,0,0.3)', borderRadius: 2 }} />
              </div>

              <WifiIcon size={18} color="#FFFFFF" />
              <span style={{ fontSize: '13.5px', fontWeight: 800, letterSpacing: '-0.2px', opacity: 0.95 }}>
                {appName || 'My Collective Sub'}
              </span>
            </div>

            {/* Hotspot PIN / ID Chip */}
            <div
              onClick={handleCopyPin}
              title={activeVoucher?.code ? 'Click to copy Hotspot PIN' : 'No active pass'}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                background: 'rgba(255, 255, 255, 0.14)',
                backdropFilter: 'blur(10px)',
                borderRadius: '12px',
                border: '1px solid rgba(255, 255, 255, 0.22)',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <span style={{ fontSize: '10.5px', fontWeight: 800, opacity: 0.75, letterSpacing: '0.5px' }}>
                {activeVoucher?.code ? 'PIN:' : 'ID:'}
              </span>
              <span style={{ fontSize: '12.5px', fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.8px' }}>
                {activeVoucher?.code || 'MYCOLLECTIVESUB-WIFI'}
              </span>
              <span style={{ fontSize: '12px' }}>{copiedPin ? '✓' : '📋'}</span>
            </div>
          </div>

          {/* Center Row: Balance & Expiry */}
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: '22px' }}>
            <div>
              <span style={{ fontSize: '11.5px', fontWeight: 700, opacity: 0.8, textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                Wallet Balance
              </span>
              <div
                onClick={() => setBalanceHidden(!balanceHidden)}
                style={{
                  fontSize: '26px',
                  fontWeight: 900,
                  cursor: 'pointer',
                  letterSpacing: '-0.5px',
                  marginTop: '2px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
                title="Click to toggle balance visibility"
              >
                <span>{balanceHidden ? '₦••••••••' : formatPrice(walletBalance)}</span>
                <span style={{ fontSize: '14px', opacity: 0.7 }}>{balanceHidden ? '👁️' : '👁️‍🗨️'}</span>
              </div>
            </div>

            <div
              onClick={() => router.push(activeVoucher?.code ? `/vouchers/status?code=${encodeURIComponent(activeVoucher.code)}` : '/vouchers/status')}
              style={{ textAlign: 'right', cursor: 'pointer' }}
              title="Click to view live session timer & data used"
            >
              <span style={{
                fontSize: '11px',
                fontWeight: 800,
                color: isPassActive ? '#4ADE80' : 'rgba(255,255,255,0.7)',
                display: 'block',
              }}>
                {activeVoucher?.isUnused ? '● Pass Ready' : (isPassActive ? '● Pass Active' : '● No Active Pass')}
              </span>
              <div style={{
                fontSize: '14px',
                fontWeight: 800,
                color: isPassActive ? '#4ADE80' : 'rgba(255,255,255,0.9)',
                fontFamily: "'JetBrains Mono', monospace",
                marginTop: '2px',
              }}>
                {countdownText}
              </div>
            </div>
          </div>

          {/* Bottom Row: User Name & Cutout Top-Up Button */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingTop: '14px',
            borderTop: '1px solid rgba(255, 255, 255, 0.14)',
          }}>
            <div>
              <span style={{ fontSize: '10.5px', fontWeight: 700, opacity: 0.7, textTransform: 'uppercase' }}>
                Hotspot Member
              </span>
              <div style={{ fontSize: '14px', fontWeight: 800, marginTop: '1px' }}>
                {displayName}
              </div>
            </div>

            <button
              onClick={() => router.push(user ? '/wallet' : '/auth')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '9px 18px',
                borderRadius: '999px',
                background: '#FFFFFF',
                color: '#153822',
                border: 'none',
                fontSize: '12.5px',
                fontWeight: 800,
                cursor: 'pointer',
                boxShadow: '0 4px 14px rgba(0,0,0,0.18)',
                transition: 'transform 0.15s ease',
              }}
            >
              <PlusIcon size={14} color="#153822" />
              <span>Top Up</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Active Session Live Widget ── */}
      {isPassActive && activeVoucher && (
        <div style={{
          background: 'var(--surface, #FFFFFF)',
          borderRadius: '20px',
          padding: '16px 18px',
          border: '1.5px solid rgba(52, 168, 83, 0.25)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '22px',
          boxShadow: '0 6px 20px rgba(52, 168, 83, 0.08)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '42px',
              height: '42px',
              borderRadius: '14px',
              background: 'rgba(52, 168, 83, 0.12)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
            }}>
              <WifiIcon size={20} color="#34A853" />
              <span style={{
                position: 'absolute',
                top: '6px',
                right: '6px',
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: '#34A853',
                boxShadow: '0 0 8px #34A853',
              }} />
            </div>
            <div>
              <div style={{ fontSize: '13.5px', fontWeight: 800, color: 'var(--text-primary, #121217)' }}>
                Active Wi-Fi Session
              </div>
              <div style={{ fontSize: '12px', color: '#34A853', fontWeight: 700, marginTop: '2px' }}>
                {countdownText} remaining
              </div>
            </div>
          </div>

          <button
            onClick={() => router.push(`/vouchers/status?code=${encodeURIComponent(activeVoucher.code)}`)}
            style={{
              padding: '8px 14px',
              borderRadius: '999px',
              background: 'rgba(52, 168, 83, 0.12)',
              color: '#34A853',
              fontSize: '12px',
              fontWeight: 800,
              border: '1px solid rgba(52, 168, 83, 0.25)',
              cursor: 'pointer',
            }}
          >
            Session Info →
          </button>
        </div>
      )}

      {/* ── Quick Action 4-Grid (Redesigned) ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '10px',
        marginBottom: '26px',
      }}>
        {/* Quick Pass */}
        <div
          onClick={() => {
            if (plans.length > 0) handleOpenCheckout(plans[0]);
            else router.push('/packages');
          }}
          style={{
            background: 'var(--surface, #FFFFFF)',
            borderRadius: '18px',
            padding: '16px 8px 14px',
            textAlign: 'center',
            border: '1.5px solid var(--border-light, #ECEEF2)',
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(0,0,0,0.03)',
            transition: 'all 0.15s ease',
          }}
        >
          <div style={{
            width: '42px',
            height: '42px',
            borderRadius: '14px',
            background: 'rgba(52, 168, 83, 0.12)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 8px',
          }}>
            <ArrowUpRightIcon size={20} color="#34A853" />
          </div>
          <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-primary, #121217)', display: 'block' }}>
            Quick Pass
          </span>
        </div>

        {/* All Passes */}
        <div
          onClick={() => router.push('/packages')}
          style={{
            background: 'var(--surface, #FFFFFF)',
            borderRadius: '18px',
            padding: '16px 8px 14px',
            textAlign: 'center',
            border: '1.5px solid var(--border-light, #ECEEF2)',
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(0,0,0,0.03)',
            transition: 'all 0.15s ease',
          }}
        >
          <div style={{
            width: '42px',
            height: '42px',
            borderRadius: '14px',
            background: 'rgba(16, 185, 129, 0.12)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 8px',
          }}>
            <WifiIcon size={20} color="#10B981" />
          </div>
          <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-primary, #121217)', display: 'block' }}>
            All Passes
          </span>
        </div>

        {/* Top Up */}
        <div
          onClick={() => router.push(user ? '/wallet' : '/auth')}
          style={{
            background: 'var(--surface, #FFFFFF)',
            borderRadius: '18px',
            padding: '16px 8px 14px',
            textAlign: 'center',
            border: '1.5px solid var(--border-light, #ECEEF2)',
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(0,0,0,0.03)',
            transition: 'all 0.15s ease',
          }}
        >
          <div style={{
            width: '42px',
            height: '42px',
            borderRadius: '14px',
            background: 'rgba(255, 184, 76, 0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 8px',
          }}>
            <WalletIcon size={20} color="#F59E0B" />
          </div>
          <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-primary, #121217)', display: 'block' }}>
            Top Up
          </span>
        </div>

        {/* My Passes */}
        <div
          onClick={() => router.push(user ? '/vouchers' : '/auth')}
          style={{
            background: 'var(--surface, #FFFFFF)',
            borderRadius: '18px',
            padding: '16px 8px 14px',
            textAlign: 'center',
            border: '1.5px solid var(--border-light, #ECEEF2)',
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(0,0,0,0.03)',
            transition: 'all 0.15s ease',
          }}
        >
          <div style={{
            width: '42px',
            height: '42px',
            borderRadius: '14px',
            background: 'rgba(99, 102, 241, 0.12)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 8px',
          }}>
            <ShieldIcon size={20} color="#6366F1" />
          </div>
          <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-primary, #121217)', display: 'block' }}>
            My Passes
          </span>
        </div>
      </div>

      {/* ── Popular Passes Showcase ── */}
      {plans.length > 0 && (
        <div style={{ marginBottom: '24px' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '14px',
          }}>
            <h2 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary, #121217)', margin: 0, letterSpacing: '-0.3px' }}>
              Popular Passes
            </h2>
            <span
              onClick={() => router.push('/packages')}
              style={{ color: '#34A853', fontWeight: 800, fontSize: '13px', cursor: 'pointer' }}
            >
              View All Passes →
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {plans.slice(0, 3).map((plan, idx) => (
              <div
                key={plan.id || idx}
                style={{
                  background: 'var(--surface, #FFFFFF)',
                  borderRadius: '20px',
                  padding: '16px 18px',
                  border: '1.5px solid var(--border-light, #ECEEF2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  boxShadow: '0 3px 12px rgba(0,0,0,0.03)',
                  position: 'relative',
                }}
              >
                {idx === 0 && (
                  <span style={{
                    position: 'absolute',
                    top: '-9px',
                    left: '18px',
                    background: '#34A853',
                    color: '#FFFFFF',
                    fontSize: '10px',
                    fontWeight: 800,
                    padding: '2px 8px',
                    borderRadius: '999px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    boxShadow: '0 2px 6px rgba(52, 168, 83, 0.4)',
                  }}>
                    Popular
                  </span>
                )}

                <div style={{ marginTop: idx === 0 ? '4px' : '0' }}>
                  <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary, #121217)' }}>
                    {plan.name}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted, #8E8E93)', marginTop: '2px' }}>
                    {plan.duration || 'Unlimited Fast Internet'}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ fontSize: '16px', fontWeight: 900, color: '#34A853' }}>
                    {formatPrice(plan.price)}
                  </div>
                  <button
                    onClick={() => handleOpenCheckout(plan)}
                    style={{
                      padding: '8px 16px',
                      borderRadius: '999px',
                      background: 'linear-gradient(135deg, #34A853 0%, #1E8E3E 100%)',
                      color: '#FFFFFF',
                      fontSize: '12.5px',
                      fontWeight: 800,
                      border: 'none',
                      cursor: 'pointer',
                      boxShadow: '0 3px 10px rgba(52, 168, 83, 0.3)',
                    }}
                  >
                    Get Pass
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Click outside to close notification dropdown */}
      {notifOpen && (
        <div
          onClick={() => setNotifOpen(false)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 900,
          }}
        />
      )}

      <PwaInstallBanner />
      <BottomNav />
      <div className={`toast ${toast ? 'show' : ''}`}>{toast}</div>
    </div>
  );
}
