'use client';

import { usePathname, useRouter } from 'next/navigation';
import { HomeIcon, WifiIcon, ActivityIcon, WalletIcon, PieChartIcon, UserIcon } from './Icons';

const navItems = [
  { id: 'home', label: 'Home', icon: HomeIcon, path: '/' },
  { id: 'packages', label: 'Passes', icon: WifiIcon, path: '/packages' },
  { id: 'telemetry', label: 'Session', icon: ActivityIcon, path: '/vouchers/status' },
  { id: 'wallet', label: 'Wallet', icon: WalletIcon, path: '/wallet' },
  { id: 'analytics', label: 'Analytics', icon: PieChartIcon, path: '/analytics' },
  { id: 'auth', label: 'Profile', icon: UserIcon, path: '/auth' },
];

export default function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();

  // Don't show on admin panel
  if (pathname.startsWith('/super-admin') || pathname.startsWith('/admin')) return null;

  return (
    <nav
      className="floating-dock"
      aria-label="Bottom Navigation"
      style={{
        position: 'fixed',
        bottom: 'calc(16px + env(safe-area-inset-bottom, 0px))',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 999,
        background: 'rgba(18, 20, 26, 0.92)',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        borderRadius: '999px',
        padding: '6px 8px',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        boxShadow: '0 20px 48px rgba(0, 0, 0, 0.45), 0 0 0 1px rgba(0, 0, 0, 0.2), 0 4px 20px rgba(52, 168, 83, 0.2)',
        backdropFilter: 'blur(28px)',
        WebkitBackdropFilter: 'blur(28px)',
        maxWidth: 'calc(100vw - 24px)',
        boxSizing: 'border-box',
        transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      {navItems.map((item) => {
        const IconComponent = item.icon;
        const isActive =
          item.path === '/'
            ? pathname === '/'
            : item.id === 'telemetry'
            ? pathname.startsWith('/vouchers/status') || pathname.startsWith('/status')
            : item.id === 'packages'
            ? pathname.startsWith('/packages') || pathname === '/vouchers'
            : pathname.startsWith(item.path);

        if (isActive) {
          return (
            <button
              key={item.id}
              className="dock-pill-active"
              onClick={() => router.push(item.path)}
              style={{
                background: 'linear-gradient(135deg, #34A853 0%, #1E8E3E 100%)',
                color: '#FFFFFF',
                borderRadius: '999px',
                padding: '9px 16px',
                fontWeight: 800,
                fontSize: '12.5px',
                display: 'flex',
                alignItems: 'center',
                gap: '7px',
                border: 'none',
                cursor: 'pointer',
                boxShadow: '0 4px 18px rgba(52, 168, 83, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.25)',
                whiteSpace: 'nowrap',
                letterSpacing: '-0.2px',
                transition: 'transform 0.15s ease',
              }}
            >
              <IconComponent size={17} color="#FFFFFF" />
              <span>{item.label}</span>
            </button>
          );
        }

        return (
          <button
            key={item.id}
            className="dock-item"
            onClick={() => router.push(item.path)}
            aria-label={item.label}
            title={item.label}
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#9CA3AF',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
          >
            <IconComponent size={19} color="#9CA3AF" />
          </button>
        );
      })}
    </nav>
  );
}
