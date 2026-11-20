'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useBranding } from '../context/BrandingContext';
import { useAuth } from '../context/AuthContext';
import BrandMark from '../components/BrandMark';

export default function LandingPage() {
  const { appName } = useBranding();
  const { user } = useAuth();
  const [plans, setPlans] = useState([]);
  const [plansLoading, setPlansLoading] = useState(true);

  useEffect(() => {
    fetch('/api/super-admin/plans')
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setPlans(data.filter((p) => p.active !== false));
        } else {
          setPlans([
            { id: 'plan-1gb', name: '1GB', price: 100, duration: '24 Hours', popular: false },
            { id: 'plan-12h', name: '12 Hours', price: 250, duration: '12 Hours', popular: true },
            { id: 'plan-3d', name: '3 Days', price: 800, duration: '3 Days', popular: false },
            { id: 'plan-7d', name: '7 Days', price: 2000, duration: '7 Days', popular: false },
          ]);
        }
      })
      .catch(() => {
        setPlans([
          { id: 'plan-1gb', name: '1GB', price: 100, duration: '24 Hours', popular: false },
          { id: 'plan-12h', name: '12 Hours', price: 250, duration: '12 Hours', popular: true },
          { id: 'plan-3d', name: '3 Days', price: 800, duration: '3 Days', popular: false },
          { id: 'plan-7d', name: '7 Days', price: 2000, duration: '7 Days', popular: false },
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

  const lowestPrice = plans.length > 0
    ? Math.min(...plans.map((p) => Number(p.price) || 100))
    : 100;

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(160deg, #F7FBFF 0%, #E6F2FF 55%, #D5EBFF 100%)',
        color: '#062B66',
        fontFamily: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        position: 'relative',
        overflowX: 'hidden',
      }}
    >
      {/* Subtle Flyer Corner Ribbons */}
      <div style={{
        position: 'fixed', top: -80, left: -80, width: 220, height: 220,
        background: 'linear-gradient(135deg, #062B66, #0095FF)', borderRadius: '0 0 180px 0',
        opacity: 0.14, pointerEvents: 'none', zIndex: 0,
      }} />
      <div style={{
        position: 'fixed', bottom: -80, right: -80, width: 240, height: 180,
        background: 'linear-gradient(135deg, #0095FF, #062B66)', borderRadius: '160px 0 0 0',
        opacity: 0.14, pointerEvents: 'none', zIndex: 0,
      }} />

      {/* ── TOP HEADER ── */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 50,
          background: 'rgba(255, 255, 255, 0.92)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderBottom: '1px solid #CFE5FF',
          padding: '10px 20px',
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
          <Link href="/" style={{ textDecoration: 'none' }}>
            <BrandMark size={34} appName={appName} showSubtext />
          </Link>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Link
              href="/packages"
              style={{
                padding: '8px 14px',
                borderRadius: '999px',
                background: '#EFF6FF',
                border: '1px solid #BFDBFE',
                color: '#035EC8',
                fontSize: '13px',
                fontWeight: 800,
                textDecoration: 'none',
              }}
            >
              Data Plans
            </Link>
            <Link
              href={user ? '/' : '/auth'}
              style={{
                padding: '8px 18px',
                borderRadius: '999px',
                background: 'linear-gradient(90deg, #062B66 0%, #0088FF 100%)',
                color: '#FFFFFF',
                fontSize: '13px',
                fontWeight: 800,
                textDecoration: 'none',
                boxShadow: '0 4px 12px rgba(0, 136, 255, 0.28)',
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
          padding: '44px 20px 32px',
          maxWidth: '900px',
          margin: '0 auto',
          textAlign: 'center',
          position: 'relative',
          zIndex: 1,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
          <BrandMark size={56} showWordmark={false} />
        </div>

        <h1
          style={{
            fontSize: 'clamp(28px, 5.5vw, 44px)',
            fontWeight: 900,
            color: '#062B66',
            lineHeight: 1.15,
            letterSpacing: '-0.6px',
            margin: '0 0 8px',
          }}
        >
          MYCOLLECTIVE<span style={{ color: '#0095FF' }}>SUB</span>
        </h1>

        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          margin: '0 auto 6px', fontSize: 14, fontWeight: 700, color: '#062B66',
        }}>
          <span style={{ height: 2, width: 46, background: '#7CB7EF', borderRadius: 2 }} />
          <span>Digital Services</span>
          <span style={{ height: 2, width: 46, background: '#7CB7EF', borderRadius: 2 }} />
        </div>

        <p style={{ fontSize: '14px', fontWeight: 700, color: '#1E4079', margin: '0 0 18px' }}>
          Connecting People. Connecting Possibilities.
        </p>

        {/* Flyer Pill Banner */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '10px',
            padding: '6px 22px 6px 8px',
            borderRadius: '999px',
            background: 'linear-gradient(90deg, #032D74 0%, #008CFF 100%)',
            color: '#FFFFFF',
            fontSize: '15px',
            fontWeight: 800,
            marginBottom: '22px',
            boxShadow: '0 8px 22px rgba(0, 115, 230, 0.26)',
          }}
        >
          <span style={{
            width: 32, height: 32, borderRadius: '50%', background: '#FFFFFF',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0088FF" strokeWidth="2.4" strokeLinecap="round">
              <path d="M5 12.55a11 11 0 0 1 14.08 0" />
              <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
              <circle cx="12" cy="19.5" r="1.2" fill="#0088FF" />
            </svg>
          </span>
          Wi-Fi / Data Subscription
        </div>

        <p
          style={{
            fontSize: 'clamp(14.5px, 2.3vw, 17px)',
            color: '#3B5D94',
            lineHeight: 1.6,
            maxWidth: '600px',
            margin: '0 auto 24px',
          }}
        >
          Connect instantly from <strong>{formatPrice(lowestPrice)}</strong>. Fast, reliable wireless hotspot access for streaming, work, and study.
        </p>

        <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '26px' }}>
          <Link
            href="/packages"
            style={{
              display: 'inline-block',
              padding: '13px 28px',
              borderRadius: '999px',
              background: 'linear-gradient(90deg, #062B66 0%, #0088FF 100%)',
              color: '#FFFFFF',
              fontSize: '15px',
              fontWeight: 800,
              textDecoration: 'none',
              boxShadow: '0 8px 20px rgba(0, 136, 255, 0.28)',
            }}
          >
            Buy Data Plan →
          </Link>
          <a
            href="#plans"
            style={{
              display: 'inline-block',
              padding: '13px 24px',
              borderRadius: '999px',
              background: '#FFFFFF',
              border: '1.5px solid #BFDBFE',
              color: '#062B66',
              fontSize: '15px',
              fontWeight: 800,
              textDecoration: 'none',
              boxShadow: '0 4px 12px rgba(6, 43, 102, 0.06)',
            }}
          >
            View Plans
          </a>
        </div>

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: '16px',
            fontSize: '13px',
            color: '#3B5D94',
            fontWeight: 700,
          }}
        >
          <span>⚡ Instant Access</span>
          <span>•</span>
          <span>₦ Starting at {formatPrice(lowestPrice)}</span>
          <span>•</span>
          <span>📱 Works on Any Device</span>
        </div>
      </section>

      {/* ── PLANS & PRICING (Flyer Wave Cards) ── */}
      <section
        id="plans"
        style={{
          padding: '28px 20px 40px',
          maxWidth: '980px',
          margin: '0 auto',
          position: 'relative',
          zIndex: 1,
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: '26px' }}>
          <h2 style={{ fontSize: 'clamp(22px, 4vw, 30px)', fontWeight: 900, color: '#062B66', margin: '0 0 6px' }}>
            Affordable Wi-Fi &amp; Data Passes
          </h2>
          <p style={{ fontSize: '14px', color: '#3B5D94', margin: 0 }}>
            Tap any package below to proceed straight to instant checkout.
          </p>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
            gap: '16px',
          }}
        >
          {(plansLoading ? [] : plans).map((plan) => {
            const isPopular = plan.popular || plan.id === '1d';
            return (
              <Link
                key={plan.id}
                href={`/packages?plan_id=${encodeURIComponent(plan.id)}`}
                style={{
                  background: '#FFFFFF',
                  borderRadius: '20px',
                  overflow: 'hidden',
                  border: isPopular ? '2px solid #0088FF' : '1.5px solid #CFE5FF',
                  boxShadow: isPopular
                    ? '0 12px 28px rgba(0, 136, 255, 0.2)'
                    : '0 8px 20px rgba(6, 43, 102, 0.08)',
                  textDecoration: 'none',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  transition: 'transform 0.15s ease',
                }}
              >
                <div style={{ padding: '20px 16px 14px', textAlign: 'center' }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: '12px', background: '#EFF6FF',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10,
                  }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0088FF" strokeWidth="2.2" strokeLinecap="round">
                      <path d="M5 12.55a11 11 0 0 1 14.08 0" />
                      <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
                      <circle cx="12" cy="19.5" r="1.2" fill="#0088FF" />
                    </svg>
                  </div>
                  <h3 style={{ fontSize: '18px', fontWeight: 900, color: '#062B66', margin: '0 0 4px' }}>
                    {plan.name}
                  </h3>
                  <div style={{ fontSize: '12.5px', color: '#3B5D94', fontWeight: 600 }}>
                    {plan.duration || 'Unlimited fast speed'}
                    {plan.devices && Number(plan.devices) > 1 ? ` • ${plan.devices} Devices` : ''}
                  </div>
                </div>

                <div style={{
                  background: 'linear-gradient(180deg, #0099FF 0%, #0354B8 100%)',
                  padding: '16px 14px 18px',
                  borderRadius: '42% 42% 0 0 / 16px 16px 0 0',
                  textAlign: 'center',
                }}>
                  {isPopular && (
                    <div style={{ fontSize: '10px', fontWeight: 800, color: '#E0F2FE', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 6 }}>
                      ★ Popular Choice
                    </div>
                  )}
                  <div style={{
                    display: 'inline-block',
                    background: '#FFFFFF',
                    color: '#062B66',
                    fontSize: '20px',
                    fontWeight: 900,
                    padding: '5px 22px',
                    borderRadius: '999px',
                    boxShadow: '0 3px 10px rgba(0,0,0,0.14)',
                    marginBottom: 8,
                  }}>
                    {formatPrice(plan.price)}
                  </div>
                  <div style={{ fontSize: '12px', fontWeight: 800, color: '#FFFFFF' }}>
                    Buy Now →
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* ── 3 EASY STEPS ── */}
      <section style={{ padding: '24px 20px 36px', maxWidth: '880px', margin: '0 auto', position: 'relative', zIndex: 1 }}>
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <h2 style={{ fontSize: 'clamp(20px, 3.5vw, 26px)', fontWeight: 900, color: '#062B66', margin: '0 0 6px' }}>
            How to Connect in 3 Steps
          </h2>
          <p style={{ fontSize: '13.5px', color: '#3B5D94', margin: 0 }}>
            Get online on any MyCollectiveSub hotspot in seconds.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
          {[
            { num: '1', title: 'Connect Wi-Fi', desc: 'Open Wi-Fi on your phone or laptop and select the MyCollectiveSub hotspot.' },
            { num: '2', title: 'Choose a Pass', desc: `Pick a plan from ${formatPrice(lowestPrice)} and pay easily via card, wallet, or bank transfer.` },
            { num: '3', title: 'Browse Immediately', desc: 'Enter your voucher code (or auto-login from checkout) and start browsing.' },
          ].map((step) => (
            <div
              key={step.num}
              style={{
                background: '#FFFFFF',
                borderRadius: '18px',
                padding: '20px',
                border: '1.5px solid #CFE5FF',
                boxShadow: '0 6px 18px rgba(6, 43, 102, 0.06)',
              }}
            >
              <div
                style={{
                  width: '34px', height: '34px', borderRadius: '10px',
                  background: '#E6F2FF', color: '#035EC8', fontWeight: 900,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '12px',
                }}
              >
                {step.num}
              </div>
              <div style={{ fontSize: '15px', fontWeight: 800, color: '#062B66', marginBottom: '4px' }}>
                {step.title}
              </div>
              <p style={{ fontSize: '13px', color: '#3B5D94', margin: 0, lineHeight: 1.55 }}>
                {step.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── FLYER CONTACT & SUPPORT BAR ── */}
      <section style={{ padding: '20px 20px 40px', maxWidth: '880px', margin: '0 auto', position: 'relative', zIndex: 1 }}>
        <div style={{ textAlign: 'center', marginBottom: '12px' }}>
          <span style={{
            display: 'inline-block',
            background: 'linear-gradient(90deg, #062B66, #0088FF)',
            color: '#FFFFFF',
            fontSize: '12px',
            fontWeight: 800,
            padding: '5px 20px',
            borderRadius: '999px',
          }}>
            For More Information
          </span>
        </div>

        <div
          style={{
            background: '#FFFFFF',
            borderRadius: '20px',
            border: '1.5px solid #CFE5FF',
            padding: '22px 24px',
            boxShadow: '0 8px 24px rgba(6, 43, 102, 0.08)',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            alignItems: 'center',
          }}
        >
          <div style={{
            display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center',
            gap: '14px', fontSize: '16px', fontWeight: 900, color: '#062B66',
          }}>
            <a href="tel:08123725673" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: '#062B66', textDecoration: 'none' }}>
              <span style={{ width: 26, height: 26, borderRadius: '50%', background: '#062B66', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>☎</span>
              08123725673
            </a>
            <span style={{ color: '#94A3B8' }}>|</span>
            <a href="https://wa.me/2348038107462" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: '#062B66', textDecoration: 'none' }}>
              <span style={{ background: '#16A34A', color: '#fff', fontSize: 11, fontWeight: 800, padding: '4px 10px', borderRadius: '999px' }}>WhatsApp</span>
              08038107462
            </a>
          </div>

          <div style={{ fontSize: '13px', color: '#3B5D94', textAlign: 'center', fontWeight: 600 }}>
            📍 156 Abdullahi Sarki Mukhtar Road, Katsina &nbsp;•&nbsp; ✉️{' '}
            <a href="mailto:Aabaxzsulyman@gmail.com" style={{ color: '#035EC8', fontWeight: 700, textDecoration: 'none' }}>
              Aabaxzsulyman@gmail.com
            </a>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer
        style={{
          background: 'rgba(255, 255, 255, 0.92)',
          borderTop: '1px solid #CFE5FF',
          padding: '22px 20px',
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
            color: '#3B5D94',
          }}
        >
          <div>
            © {new Date().getFullYear()} <strong>MyCollectiveSub Digital Services</strong>. All rights reserved.
          </div>
          <div style={{ display: 'flex', gap: '16px', fontWeight: 700 }}>
            <Link href="/packages" style={{ color: '#035EC8', textDecoration: 'none' }}>Passes</Link>
            <Link href="/auth" style={{ color: '#035EC8', textDecoration: 'none' }}>Account</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
