'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useBranding } from '../context/BrandingContext';
import { useAuth } from '../context/AuthContext';
import { WifiIcon } from '../components/Icons';

export default function LandingPage() {
  const { appName } = useBranding();
  const { user } = useAuth();
  const [plans, setPlans] = useState([]);
  const [plansLoading, setPlansLoading] = useState(true);

  // Fetch live plans from DB with clean fallbacks
  useEffect(() => {
    fetch('/api/super-admin/plans')
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setPlans(data.filter((p) => p.active !== false));
        } else {
          setPlans([
            { id: '1h', name: '1 Hour Pass', price: 100, duration: '1 Hour', popular: false },
            { id: '1d', name: '1 Day Pass', price: 300, duration: '24 Hours', popular: true },
            { id: '7d', name: '7 Days Pass', price: 1500, duration: '7 Days', popular: false },
            { id: '30d', name: '30 Days Pass', price: 5000, duration: '30 Days', popular: false },
          ]);
        }
      })
      .catch(() => {
        setPlans([
          { id: '1h', name: '1 Hour Pass', price: 100, duration: '1 Hour', popular: false },
          { id: '1d', name: '1 Day Pass', price: 300, duration: '24 Hours', popular: true },
          { id: '7d', name: '7 Days Pass', price: 1500, duration: '7 Days', popular: false },
          { id: '30d', name: '30 Days Pass', price: 5000, duration: '30 Days', popular: false },
        ]);
      })
      .finally(() => setPlansLoading(false));
  }, []);

  const formatPrice = (amount) =>
    '₦' +
    Number(amount || 0).toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#F8FAFC',
        color: '#0F172A',
        fontFamily:
          "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      {/* ── TOP HEADER ── */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 50,
          background: 'rgba(255, 255, 255, 0.92)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderBottom: '1px solid #E2E8F0',
          padding: '12px 20px',
        }}
      >
        <div
          style={{
            maxWidth: '1080px',
            margin: '0 auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          {/* Brand */}
          <Link
            href="/"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              textDecoration: 'none',
            }}
          >
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #16A34A 0%, #15803D 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 8px rgba(22, 163, 74, 0.25)',
              }}
            >
              <WifiIcon size={20} color="#FFFFFF" />
            </div>
            <div>
              <div
                style={{
                  fontSize: '16px',
                  fontWeight: 800,
                  color: '#0F172A',
                  lineHeight: 1.1,
                }}
              >
                My Collective Sub
              </div>
              <div
                style={{
                  fontSize: '11px',
                  color: '#16A34A',
                  fontWeight: 700,
                }}
              >
                Wi-Fi Katsina
              </div>
            </div>
          </Link>

          {/* Quick Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Link
              href={user ? '/' : '/auth'}
              style={{
                padding: '8px 18px',
                borderRadius: '8px',
                background: '#16A34A',
                color: '#FFFFFF',
                fontSize: '13px',
                fontWeight: 700,
                textDecoration: 'none',
                boxShadow: '0 2px 6px rgba(22, 163, 74, 0.25)',
              }}
            >
              {user ? 'My Account' : 'Sign In'}
            </Link>
          </div>
        </div>
      </header>

      {/* ── HERO SECTION ── */}
      <section
        style={{
          padding: '48px 20px 40px',
          maxWidth: '860px',
          margin: '0 auto',
          textAlign: 'center',
        }}
      >
        {/* Status Pill */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 14px',
            borderRadius: '999px',
            background: '#DCFCE7',
            border: '1px solid #BBF7D0',
            color: '#15803D',
            fontSize: '12px',
            fontWeight: 700,
            marginBottom: '20px',
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: '#16A34A',
            }}
          />
          High-Speed Wi-Fi • Katsina State, Nigeria
        </div>

        {/* Main Title */}
        <h1
          style={{
            fontSize: 'clamp(28px, 6vw, 46px)',
            fontWeight: 900,
            color: '#0F172A',
            lineHeight: 1.2,
            letterSpacing: '-0.5px',
            margin: '0 0 16px',
          }}
        >
          Fast, Reliable Wi-Fi Hotspots Across Katsina
        </h1>

        <p
          style={{
            fontSize: 'clamp(15px, 2.5vw, 17px)',
            color: '#475569',
            lineHeight: 1.6,
            maxWidth: '620px',
            margin: '0 auto 28px',
          }}
        >
          Connect instantly from <strong>₦100</strong>. Enjoy uninterrupted high-speed internet for browsing, streaming, work, and studies.
        </p>

        {/* CTA Button */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            marginBottom: '36px',
          }}
        >
          <a
            href="#plans"
            style={{
              display: 'inline-block',
              padding: '14px 32px',
              borderRadius: '10px',
              background: '#16A34A',
              color: '#FFFFFF',
              fontSize: '15px',
              fontWeight: 800,
              textDecoration: 'none',
              boxShadow: '0 4px 14px rgba(22, 163, 74, 0.3)',
            }}
          >
            View Wi-Fi Passes →
          </a>
        </div>

        {/* Trust Points */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: '20px',
            fontSize: '13px',
            color: '#64748B',
            fontWeight: 600,
          }}
        >
          <span>⚡ Instant Access</span>
          <span>•</span>
          <span>₦ Starting at ₦100</span>
          <span>•</span>
          <span>📍 156 Abdullahi Sarki Mukhtar Rd</span>
        </div>
      </section>

      {/* ── PLANS & PRICING ── */}
      <section
        id="plans"
        style={{
          padding: '40px 20px',
          maxWidth: '1000px',
          margin: '0 auto',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <h2
            style={{
              fontSize: 'clamp(22px, 4vw, 30px)',
              fontWeight: 800,
              color: '#0F172A',
              margin: '0 0 8px',
            }}
          >
            Affordable Wi-Fi Passes
          </h2>
          <p style={{ fontSize: '14px', color: '#64748B', margin: 0 }}>
            Choose a plan that fits your day. Instant activation.
          </p>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '16px',
          }}
        >
          {plans.map((plan) => {
            const isPopular = plan.popular || plan.id === '1d';
            return (
              <div
                key={plan.id}
                style={{
                  background: '#FFFFFF',
                  borderRadius: '14px',
                  padding: '24px 20px',
                  border: isPopular ? '2px solid #16A34A' : '1px solid #E2E8F0',
                  boxShadow: isPopular
                    ? '0 8px 24px -4px rgba(22, 163, 74, 0.15)'
                    : '0 2px 8px -2px rgba(0, 0, 0, 0.04)',
                  position: 'relative',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                }}
              >
                {isPopular && (
                  <span
                    style={{
                      position: 'absolute',
                      top: '-11px',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      background: '#16A34A',
                      color: '#FFFFFF',
                      fontSize: '11px',
                      fontWeight: 800,
                      padding: '2px 10px',
                      borderRadius: '999px',
                      textTransform: 'uppercase',
                    }}
                  >
                    Most Popular
                  </span>
                )}

                <div>
                  <h3
                    style={{
                      fontSize: '16px',
                      fontWeight: 800,
                      color: '#0F172A',
                      margin: '0 0 6px',
                    }}
                  >
                    {plan.name}
                  </h3>
                  <div
                    style={{
                      fontSize: '13px',
                      color: '#64748B',
                      marginBottom: '16px',
                    }}
                  >
                    {plan.duration || 'Unlimited high speed'}
                  </div>

                  <div
                    style={{
                      fontSize: '32px',
                      fontWeight: 900,
                      color: '#16A34A',
                      marginBottom: '16px',
                    }}
                  >
                    {formatPrice(plan.price)}
                  </div>
                </div>

                <Link
                  href="/packages"
                  style={{
                    display: 'block',
                    width: '100%',
                    padding: '10px 0',
                    textAlign: 'center',
                    borderRadius: '8px',
                    background: isPopular ? '#16A34A' : '#F1F5F9',
                    color: isPopular ? '#FFFFFF' : '#334155',
                    fontSize: '13.5px',
                    fontWeight: 700,
                    textDecoration: 'none',
                    boxSizing: 'border-box',
                  }}
                >
                  Buy Now →
                </Link>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── 3 EASY STEPS ── */}
      <section
        style={{
          padding: '40px 20px',
          maxWidth: '860px',
          margin: '0 auto',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <h2
            style={{
              fontSize: 'clamp(20px, 3.5vw, 26px)',
              fontWeight: 800,
              color: '#0F172A',
              margin: '0 0 6px',
            }}
          >
            How to Connect in 3 Steps
          </h2>
          <p style={{ fontSize: '13.5px', color: '#64748B', margin: 0 }}>
            Connect to any My Collective Sub hotspot within seconds.
          </p>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '16px',
          }}
        >
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: '12px',
              padding: '20px',
              border: '1px solid #E2E8F0',
            }}
          >
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: '#DCFCE7',
                color: '#15803D',
                fontWeight: 900,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '12px',
              }}
            >
              1
            </div>
            <div style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A', marginBottom: '4px' }}>
              Connect Wi-Fi
            </div>
            <p style={{ fontSize: '13px', color: '#64748B', margin: 0, lineHeight: 1.5 }}>
              Open your phone Wi-Fi settings and choose <strong>My Collective Sub</strong>.
            </p>
          </div>

          <div
            style={{
              background: '#FFFFFF',
              borderRadius: '12px',
              padding: '20px',
              border: '1px solid #E2E8F0',
            }}
          >
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: '#DCFCE7',
                color: '#15803D',
                fontWeight: 900,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '12px',
              }}
            >
              2
            </div>
            <div style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A', marginBottom: '4px' }}>
              Choose a Pass
            </div>
            <p style={{ fontSize: '13px', color: '#64748B', margin: 0, lineHeight: 1.5 }}>
              Select a plan from ₦100 or pay easily online using your card or bank transfer.
            </p>
          </div>

          <div
            style={{
              background: '#FFFFFF',
              borderRadius: '12px',
              padding: '20px',
              border: '1px solid #E2E8F0',
            }}
          >
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: '#DCFCE7',
                color: '#15803D',
                fontWeight: 900,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '12px',
              }}
            >
              3
            </div>
            <div style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A', marginBottom: '4px' }}>
              Browse Immediately
            </div>
            <p style={{ fontSize: '13px', color: '#64748B', margin: 0, lineHeight: 1.5 }}>
              Enter your voucher PIN code and start enjoying high-speed internet instantly.
            </p>
          </div>
        </div>
      </section>

      {/* ── SIMPLE CONTACT & LOCATION CARD ── */}
      <section
        style={{
          padding: '36px 20px',
          maxWidth: '860px',
          margin: '0 auto',
        }}
      >
        <div
          style={{
            background: '#FFFFFF',
            borderRadius: '16px',
            border: '1px solid #E2E8F0',
            padding: '28px 24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '18px',
            boxShadow: '0 2px 10px -2px rgba(0,0,0,0.04)',
          }}
        >
          <div style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A' }}>
            Katsina Hotspot Office &amp; Support
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: '16px',
            }}
          >
            <div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', marginBottom: '4px' }}>
                📍 Office Location
              </div>
              <div style={{ fontSize: '14.5px', color: '#0F172A', fontWeight: 600, lineHeight: 1.5 }}>
                156 Abdullahi Sarki Mukhtar Road, Katsina, Katsina State, Nigeria
              </div>
            </div>

            <div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', marginBottom: '4px' }}>
                ✉️ Email &amp; Support Line
              </div>
              <a
                href="mailto:Aabaxzsulyman@gmail.com"
                style={{
                  fontSize: '14.5px',
                  color: '#16A34A',
                  fontWeight: 700,
                  textDecoration: 'none',
                }}
              >
                Aabaxzsulyman@gmail.com
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer
        style={{
          background: '#FFFFFF',
          borderTop: '1px solid #E2E8F0',
          padding: '24px 20px',
          marginTop: '20px',
        }}
      >
        <div
          style={{
            maxWidth: '1000px',
            margin: '0 auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
            fontSize: '13px',
            color: '#64748B',
          }}
        >
          <div>
            © {new Date().getFullYear()} <strong>My Collective Sub</strong>. All rights reserved.
          </div>
          <div style={{ display: 'flex', gap: '16px' }}>
            <Link href="/packages" style={{ color: '#475569', textDecoration: 'none' }}>
              Passes
            </Link>
            <Link href="/auth" style={{ color: '#475569', textDecoration: 'none' }}>
              Account
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
