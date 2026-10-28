'use client';

import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '../context/AuthContext';
import { useBranding } from '../context/BrandingContext';
import { useLanguage } from '../context/LanguageContext';
import SupportTicketModal from './SupportTicketModal';
import {
  HomeIcon,
  WifiIcon,
  WalletIcon,
  PieChartIcon,
  UserIcon,
  ShieldIcon,
  XIcon,
  LogOutIcon,
  ArrowUpRightIcon,
} from './Icons';

const navLinks = [
  { id: 'home', label: 'Home Dashboard', icon: HomeIcon, path: '/' },
  { id: 'landing', label: 'About & Hotspot Zones', icon: ArrowUpRightIcon, path: '/landing' },
  { id: 'packages', label: 'Wi-Fi Passes', icon: WifiIcon, path: '/packages' },
  { id: 'status', label: 'Active Pass Timer', icon: WifiIcon, path: '/vouchers/status' },
  { id: 'wallet', label: 'Wallet & History', icon: WalletIcon, path: '/wallet', auth: true },
  { id: 'reseller', label: 'Reseller & Agent Portal', icon: ShieldIcon, path: '/reseller' },
  { id: 'analytics', label: 'Usage Analytics', icon: PieChartIcon, path: '/analytics' },
  { id: 'auth', label: 'My Profile', icon: UserIcon, path: '/auth' },
];

export default function SideDrawer({ isOpen, onClose }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, profile, wallet, signOut } = useAuth();
  const { appName, theme, isDark, toggleMode } = useBranding();
  const { locale, setLocale, languages } = useLanguage();
  const [showSupport, setShowSupport] = useState(false);

  const handleNavigate = (path, requiresAuth) => {
    if (requiresAuth && !user) {
      router.push('/auth');
    } else {
      router.push(path);
    }
    onClose();
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      localStorage.removeItem('asuk_guest_session');
      router.push('/auth');
    } catch (err) {
      console.error('Sign out error:', err);
    }
    onClose();
  };

  const displayName = profile?.full_name || user?.email?.split('@')[0] || 'Guest User';
  const initial = displayName.charAt(0).toUpperCase();
  const walletBalance = wallet ? parseFloat(wallet.balance) : 0;

  const formatPrice = (amount) =>
    '₦' +
    Number(amount || 0).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  return (
    <>
      {/* Backdrop blur overlay */}
      <div
        className={`drawer-overlay ${isOpen ? 'open' : ''}`}
        onClick={onClose}
        aria-hidden="true"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.55)',
          backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)',
          zIndex: 1000,
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? 'auto' : 'none',
          transition: 'opacity 0.3s ease',
        }}
      />

      {/* Modern Side Drawer */}
      <aside
        className={`side-drawer ${isOpen ? 'open' : ''}`}
        aria-label="Main navigation drawer"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          bottom: 0,
          width: '85%',
          maxWidth: '330px',
          background: 'var(--surface, #FFFFFF)',
          zIndex: 1001,
          transform: isOpen ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '20px 0 60px rgba(0, 0, 0, 0.25)',
          padding: '24px 20px',
          borderRight: '1px solid var(--border-light, #EAECEF)',
          overflowY: 'auto',
          boxSizing: 'border-box',
        }}
      >
        {/* Top bar with brand and close button */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '9px', fontWeight: 800, fontSize: '16px', color: 'var(--text-primary, #121217)', letterSpacing: '-0.3px' }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #34A853 0%, #1E8E3E 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(52, 168, 83, 0.35)',
            }}>
              <WifiIcon size={17} color="#FFFFFF" />
            </div>
            <span>{appName || 'My Collective Sub'}</span>
          </div>

          <button
            onClick={onClose}
            aria-label="Close menu"
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              background: 'var(--bg, #F4F5F8)',
              border: '1px solid var(--border-light, #ECEEF2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <XIcon size={17} color="var(--text-primary, #121217)" />
          </button>
        </div>

        {/* User Identity Card */}
        <div style={{
          background: 'linear-gradient(135deg, rgba(52, 168, 83, 0.08) 0%, rgba(20, 24, 28, 0.02) 100%)',
          borderRadius: '20px',
          padding: '16px',
          border: '1.5px solid rgba(52, 168, 83, 0.2)',
          marginBottom: '20px',
          boxShadow: '0 4px 16px rgba(0,0,0,0.02)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '46px',
              height: '46px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #34A853 0%, #1E8E3E 100%)',
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '18px',
              fontWeight: 800,
              boxShadow: '0 4px 12px rgba(52, 168, 83, 0.3)',
              border: '2px solid #FFFFFF',
              flexShrink: 0,
            }}>
              {initial}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <h3 style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary, #121217)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {displayName}
              </h3>
              <p style={{ fontSize: '12px', color: 'var(--text-muted, #8E8E93)', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user ? user.email : 'Guest Session'}
              </p>
            </div>
          </div>

          {user ? (
            <div style={{
              marginTop: '12px',
              paddingTop: '12px',
              borderTop: '1px solid rgba(52, 168, 83, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <div>
                <span style={{ fontSize: '11px', color: 'var(--text-muted, #8E8E93)', fontWeight: 700, textTransform: 'uppercase' }}>
                  Wallet Balance
                </span>
                <div style={{ fontSize: '16px', fontWeight: 800, color: '#34A853', marginTop: '1px' }}>
                  {formatPrice(walletBalance)}
                </div>
              </div>

              <button
                onClick={() => {
                  router.push('/wallet');
                  onClose();
                }}
                style={{
                  padding: '6px 12px',
                  borderRadius: '999px',
                  background: '#34A853',
                  color: '#FFFFFF',
                  fontSize: '11.5px',
                  fontWeight: 800,
                  border: 'none',
                  cursor: 'pointer',
                  boxShadow: '0 3px 10px rgba(52, 168, 83, 0.3)',
                }}
              >
                + Top Up
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                router.push('/auth');
                onClose();
              }}
              style={{
                marginTop: '12px',
                width: '100%',
                padding: '8px',
                borderRadius: '12px',
                background: '#34A853',
                color: '#FFFFFF',
                fontSize: '12px',
                fontWeight: 800,
                border: 'none',
                cursor: 'pointer',
                textAlign: 'center',
              }}
            >
              Sign In / Create Account →
            </button>
          )}
        </div>

        {/* Navigation Menu Items */}
        <nav style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
          {navLinks.map((item) => {
            const IconComp = item.icon;
            const isActive =
              item.path === '/'
                ? pathname === '/'
                : pathname.startsWith(item.path);

            return (
              <button
                key={item.id}
                onClick={() => handleNavigate(item.path, item.auth)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 14px',
                  borderRadius: '14px',
                  background: isActive ? 'linear-gradient(135deg, #34A853 0%, #1E8E3E 100%)' : 'transparent',
                  color: isActive ? '#FFFFFF' : 'var(--text-primary, #121217)',
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s ease',
                  boxShadow: isActive ? '0 4px 14px rgba(52, 168, 83, 0.35)' : 'none',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{
                    color: isActive ? '#FFFFFF' : 'var(--text-muted, #8E8E93)',
                    display: 'flex',
                    alignItems: 'center',
                  }}>
                    <IconComp size={18} color="currentColor" />
                  </div>
                  <span style={{ fontSize: '13.5px', fontWeight: 700 }}>
                    {item.label}
                  </span>
                </div>

                <ArrowUpRightIcon
                  size={14}
                  color={isActive ? '#FFFFFF' : 'var(--text-muted, #8E8E93)'}
                />
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => setShowSupport(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 14px',
              borderRadius: '14px',
              background: 'transparent',
              color: 'var(--text-primary, #121217)',
              border: 'none',
              cursor: 'pointer',
              textAlign: 'left',
              marginTop: '4px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '17px' }}>🎧</span>
              <span style={{ fontSize: '13.5px', fontWeight: 700 }}>
                Customer Helpdesk
              </span>
            </div>
            <span style={{ fontSize: '11px', color: '#34A853', fontWeight: 800, background: 'rgba(52, 168, 83, 0.12)', padding: '2px 8px', borderRadius: '999px' }}>
              24/7
            </span>
          </button>
        </nav>

        {/* Drawer Footer Controls */}
        <div style={{ marginTop: 'auto', paddingTop: '16px', borderTop: '1px solid var(--border-light, #EAECEF)' }}>
          {/* Dark Mode Switcher */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 12px',
            background: isDark ? 'rgba(255, 255, 255, 0.06)' : 'var(--bg, #F4F5F8)',
            borderRadius: '14px',
            marginBottom: '10px',
            border: '1px solid var(--border-light, #ECEEF2)',
          }}>
            <span style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text-primary, #121217)' }}>
              {isDark ? '🌙 Dark Mode' : '☀️ Light Mode'}
            </span>
            <button
              onClick={toggleMode}
              type="button"
              style={{
                padding: '4px 10px',
                borderRadius: '999px',
                background: '#34A853',
                color: '#FFFFFF',
                fontSize: '11px',
                fontWeight: 700,
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Switch
            </button>
          </div>

          {/* Language Switcher */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 12px',
            background: isDark ? 'rgba(255, 255, 255, 0.06)' : 'var(--bg, #F4F5F8)',
            borderRadius: '14px',
            marginBottom: '10px',
            border: '1px solid var(--border-light, #ECEEF2)',
          }}>
            <span style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text-primary, #121217)' }}>
              🌐 Language
            </span>
            <select
              value={locale}
              onChange={(e) => setLocale(e.target.value)}
              style={{
                padding: '4px 8px',
                borderRadius: '8px',
                background: 'var(--surface, #FFFFFF)',
                color: 'var(--text-primary, #121217)',
                fontSize: '11px',
                fontWeight: 700,
                border: '1px solid var(--border-light, #ECEEF2)',
                cursor: 'pointer',
              }}
            >
              {languages.map(l => (
                <option key={l.code} value={l.code}>{l.flag} {l.name}</option>
              ))}
            </select>
          </div>

          {/* Sign Out Button (if logged in) */}
          {user && (
            <button
              onClick={handleSignOut}
              style={{
                width: '100%',
                padding: '10px',
                background: 'rgba(239, 68, 68, 0.08)',
                border: '1px solid rgba(239, 68, 68, 0.25)',
                borderRadius: '12px',
                color: '#EF4444',
                fontSize: '12.5px',
                fontWeight: 800,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                marginTop: '4px',
              }}
            >
              <LogOutIcon size={15} color="#EF4444" />
              Sign Out
            </button>
          )}
        </div>

        {/* Support Modal */}
        <SupportTicketModal
          isOpen={showSupport}
          onClose={() => setShowSupport(false)}
        />
      </aside>
    </>
  );
}
