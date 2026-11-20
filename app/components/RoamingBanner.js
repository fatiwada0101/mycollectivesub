'use client';

import { useState, useEffect } from 'react';
import { WifiIcon, ZapIcon, CheckIcon, ShieldIcon } from './Icons';

export default function RoamingBanner({ onVoucherResumed, searchParams }) {
  const [roamingData, setRoamingData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [resumed, setResumed] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function checkStatus() {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const routerIdentity = urlParams.get('router') || searchParams?.router || '';
        const clientMac = urlParams.get('mac') || searchParams?.mac || '';

        // Query server
        const res = await fetch(`/api/roaming/check-status?router=${encodeURIComponent(routerIdentity)}&mac=${encodeURIComponent(clientMac)}`);
        const data = await res.json();

        if (isMounted && data.success && data.hasActiveVoucher && data.voucher) {
          setRoamingData(data);
        }
      } catch (err) {
        console.warn('Roaming status check non-fatal error:', err.message);
      }
    }

    checkStatus();
    return () => {
      isMounted = false;
    };
  }, [searchParams]);

  if (!roamingData || !roamingData.hasActiveVoucher || dismissed) {
    return null;
  }

  const { voucher, resolvedRouter } = roamingData;
  const locationName = resolvedRouter?.locationName || 'Supported Hotspot';

  const handleResume = async () => {
    setResuming(true);
    try {
      const res = await fetch('/api/roaming/handoff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          voucher_code: voucher.voucher_code,
          target_router_id: resolvedRouter?.id,
          router_identity: resolvedRouter?.identity,
        }),
      });

      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      setResumed(true);
      if (onVoucherResumed) {
        onVoucherResumed(data);
      }
    } catch (err) {
      alert('Could not resume session: ' + err.message);
    } finally {
      setResuming(false);
    }
  };

  return (
    <div
      style={{
        background: 'linear-gradient(135deg, rgba(0, 136, 255, 0.1) 0%, rgba(6, 43, 102, 0.06) 100%)',
        border: '1px solid #BFDBFE',
        borderRadius: '16px',
        padding: '16px 20px',
        margin: '16px 0 24px',
        boxShadow: '0 4px 20px rgba(0, 136, 255, 0.1)',
        position: 'relative',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
        <div
          style={{
            background: 'linear-gradient(135deg, #062B66 0%, #0088FF 100%)',
            color: '#FFFFFF',
            borderRadius: '12px',
            width: '40px',
            height: '40px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <ZapIcon size={20} />
        </div>

        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                color: '#035EC8',
                display: 'inline-block',
                marginBottom: '4px',
              }}
            >
              Smart Roaming Detected
            </span>
            <button
              onClick={() => setDismissed(true)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted, #9CA3AF)',
                cursor: 'pointer',
                fontSize: '14px',
                padding: '0 4px',
              }}
            >
              ✕
            </button>
          </div>

          <h4 style={{ margin: '0 0 6px', fontSize: '15px', fontWeight: 800, color: 'var(--text-primary, #121217)' }}>
            Welcome to {locationName}!
          </h4>

          <p style={{ margin: '0 0 12px', fontSize: '13px', color: 'var(--text-secondary, #4B5563)', lineHeight: '1.4' }}>
            You have an active pass <strong>({voucher.profile_name})</strong> with{' '}
            <strong style={{ color: '#035EC8' }}>{voucher.remainingFormatted} remaining</strong>. Continue surfing without paying again.
          </p>

          {resumed ? (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 16px',
                background: '#EFF6FF',
                color: '#035EC8',
                borderRadius: '10px',
                fontWeight: 700,
                fontSize: '13px',
              }}
            >
              <CheckIcon size={16} /> Connection Resumed! You are online.
            </div>
          ) : (
            <button
              onClick={handleResume}
              disabled={resuming}
              style={{
                background: 'linear-gradient(135deg, #062B66 0%, #0088FF 100%)',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '10px',
                padding: '9px 18px',
                fontSize: '13px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 2px 8px rgba(114, 87, 255, 0.3)',
              }}
            >
              <WifiIcon size={15} />
              <span>{resuming ? 'Synchronizing Session...' : '⚡ Resume My Pass'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
