'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useBranding } from '../context/BrandingContext';
import { useAuth } from '../context/AuthContext';
import {
  WifiIcon,
  ShieldIcon,
  ArrowUpRightIcon,
  WalletIcon,
  ActivityIcon,
} from '../components/Icons';

export default function LandingPage() {
  const router = useRouter();
  const { appName } = useBranding();
  const { user } = useAuth();

  const [plans, setPlans] = useState([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [inquiryName, setInquiryName] = useState('');
  const [inquiryEmail, setInquiryEmail] = useState('');
  const [inquiryPhone, setInquiryPhone] = useState('');
  const [inquiryMessage, setInquiryMessage] = useState('');
  const [inquirySent, setInquirySent] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Fetch live plans from DB
  useEffect(() => {
    fetch('/api/super-admin/plans')
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setPlans(data.filter((p) => p.active !== false));
        } else {
          // Default fallback packages
          setPlans([
            { id: '1h', name: '1 Hour Fast Pass', price: 100, duration: '1 Hour', popular: false },
            { id: '1d', name: '1 Day Unlimited Pass', price: 300, duration: '24 Hours', popular: true },
            { id: '7d', name: '7 Days Business Pass', price: 1500, duration: '7 Days', popular: false },
            { id: '30d', name: '30 Days Premium Monthly', price: 5000, duration: '30 Days', popular: false },
          ]);
        }
      })
      .catch(() => {
        setPlans([
          { id: '1h', name: '1 Hour Fast Pass', price: 100, duration: '1 Hour', popular: false },
          { id: '1d', name: '1 Day Unlimited Pass', price: 300, duration: '24 Hours', popular: true },
          { id: '7d', name: '7 Days Business Pass', price: 1500, duration: '7 Days', popular: false },
          { id: '30d', name: '30 Days Premium Monthly', price: 5000, duration: '30 Days', popular: false },
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

  const handleInquirySubmit = (e) => {
    e.preventDefault();
    setInquirySent(true);
    setTimeout(() => {
      setInquiryName('');
      setInquiryEmail('');
      setInquiryPhone('');
      setInquiryMessage('');
    }, 4000);
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0B0D13',
      color: '#F3F4F6',
      fontFamily: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      overflowX: 'hidden',
    }}>
      {/* ── TOP ANNOUNCEMENT TICKER ── */}
      <div style={{
        background: 'linear-gradient(90deg, #15803D 0%, #16A34A 50%, #15803D 100%)',
        color: '#FFFFFF',
        padding: '8px 16px',
        fontSize: '12.5px',
        fontWeight: 700,
        textAlign: 'center',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
      }}>
        <span>🎉 Welcome to My Collective Sub! Ultra-fast Wi-Fi hotspots now live in Katsina State.</span>
        <Link href="/packages" style={{ color: '#FEF08A', textDecoration: 'underline', fontWeight: 800 }}>
          Get ₦100 Pass →
        </Link>
      </div>

      {/* ── NAVIGATION HEADER ── */}
      <header style={{
        position: 'sticky',
        top: 0,
        zIndex: 100,
        background: 'rgba(11, 13, 19, 0.88)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        padding: '14px 24px',
      }}>
        <div style={{
          maxWidth: '1200px',
          margin: '0 auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          {/* Brand Logo */}
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none' }}>
            <div style={{
              width: '38px',
              height: '38px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #22C55E 0%, #15803D 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 16px rgba(34, 197, 94, 0.4)',
            }}>
              <WifiIcon size={20} color="#FFFFFF" />
            </div>
            <div>
              <div style={{ fontSize: '17px', fontWeight: 900, color: '#FFFFFF', letterSpacing: '-0.3px', lineHeight: 1.1 }}>
                My Collective Sub
              </div>
              <div style={{ fontSize: '10px', color: '#22C55E', fontWeight: 800, letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                Wi-Fi &amp; Internet Services
              </div>
            </div>
          </Link>

          {/* Desktop Nav Links */}
          <nav style={{
            display: 'none',
            alignItems: 'center',
            gap: '28px',
          }} className="desktop-nav">
            <a href="#features" style={{ color: '#D1D5DB', textDecoration: 'none', fontSize: '14px', fontWeight: 600 }}>Features</a>
            <a href="#plans" style={{ color: '#D1D5DB', textDecoration: 'none', fontSize: '14px', fontWeight: 600 }}>Plans &amp; Pricing</a>
            <a href="#coverage" style={{ color: '#D1D5DB', textDecoration: 'none', fontSize: '14px', fontWeight: 600 }}>Katsina Hotspots</a>
            <a href="#how-it-works" style={{ color: '#D1D5DB', textDecoration: 'none', fontSize: '14px', fontWeight: 600 }}>How It Works</a>
            <a href="#reseller" style={{ color: '#D1D5DB', textDecoration: 'none', fontSize: '14px', fontWeight: 600 }}>Reseller Agent</a>
            <a href="#contact" style={{ color: '#D1D5DB', textDecoration: 'none', fontSize: '14px', fontWeight: 600 }}>Contact</a>
          </nav>

          {/* Action Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Link
              href="/login"
              style={{
                padding: '8px 16px',
                borderRadius: '999px',
                background: 'rgba(255, 255, 255, 0.08)',
                color: '#FFFFFF',
                fontSize: '13px',
                fontWeight: 700,
                textDecoration: 'none',
                border: '1px solid rgba(255, 255, 255, 0.15)',
              }}
            >
              Connect Hotspot
            </Link>

            <Link
              href={user ? '/' : '/auth'}
              style={{
                padding: '8px 18px',
                borderRadius: '999px',
                background: 'linear-gradient(135deg, #22C55E 0%, #16A34A 100%)',
                color: '#FFFFFF',
                fontSize: '13px',
                fontWeight: 800,
                textDecoration: 'none',
                boxShadow: '0 4px 14px rgba(34, 197, 94, 0.35)',
              }}
            >
              {user ? 'My Portal →' : 'Client Login'}
            </Link>
          </div>
        </div>
      </header>

      {/* ── HERO SECTION ── */}
      <section style={{
        position: 'relative',
        padding: '70px 24px 80px',
        maxWidth: '1200px',
        margin: '0 auto',
        textAlign: 'center',
      }}>
        {/* Ambient Radial Mesh Background */}
        <div style={{
          position: 'absolute',
          top: '10%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '650px',
          height: '400px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(34, 197, 94, 0.15) 0%, rgba(16, 185, 129, 0.05) 45%, transparent 70%)',
          filter: 'blur(50px)',
          pointerEvents: 'none',
          zIndex: 0,
        }} />

        <div style={{ position: 'relative', zIndex: 1 }}>
          {/* Location Badge */}
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 16px',
            borderRadius: '999px',
            background: 'rgba(34, 197, 94, 0.12)',
            border: '1px solid rgba(34, 197, 94, 0.3)',
            color: '#4ADE80',
            fontSize: '12.5px',
            fontWeight: 800,
            marginBottom: '24px',
          }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22C55E', boxShadow: '0 0 10px #22C55E' }} />
            High-Speed Wi-Fi Network • Katsina State, Nigeria
          </div>

          <h1 style={{
            fontSize: 'clamp(32px, 5.5vw, 58px)',
            fontWeight: 900,
            color: '#FFFFFF',
            lineHeight: 1.15,
            letterSpacing: '-1px',
            maxWidth: '920px',
            margin: '0 auto 20px',
          }}>
            Ultra-Fast, Affordable Wi-Fi Hotspots Across <span style={{
              background: 'linear-gradient(135deg, #4ADE80 0%, #22C55E 50%, #10B981 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}>Katsina</span>
          </h1>

          <p style={{
            fontSize: 'clamp(15px, 2vw, 19px)',
            color: '#9CA3AF',
            maxWidth: '680px',
            margin: '0 auto 34px',
            lineHeight: 1.6,
            fontWeight: 400,
          }}>
            Experience seamless high-speed internet starting from just <strong>₦100</strong>. Instant voucher delivery, digital wallet top-ups, zero monthly contracts, and 24/7 unlimited access.
          </p>

          {/* Hero CTAs */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '14px',
            flexWrap: 'wrap',
            marginBottom: '48px',
          }}>
            <a
              href="#plans"
              style={{
                padding: '14px 28px',
                borderRadius: '999px',
                background: 'linear-gradient(135deg, #22C55E 0%, #15803D 100%)',
                color: '#FFFFFF',
                fontSize: '15px',
                fontWeight: 800,
                textDecoration: 'none',
                boxShadow: '0 6px 24px rgba(34, 197, 94, 0.45)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <span>⚡ Buy Wi-Fi Pass</span>
              <ArrowUpRightIcon size={18} color="#FFFFFF" />
            </a>

            <Link
              href="/login"
              style={{
                padding: '14px 28px',
                borderRadius: '999px',
                background: 'rgba(255, 255, 255, 0.08)',
                color: '#FFFFFF',
                fontSize: '15px',
                fontWeight: 800,
                textDecoration: 'none',
                border: '1.5px solid rgba(255, 255, 255, 0.2)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <span>📶 Connect at Hotspot</span>
            </Link>

            <Link
              href="/reseller/signup"
              style={{
                padding: '14px 24px',
                borderRadius: '999px',
                background: 'transparent',
                color: '#4ADE80',
                fontSize: '14.5px',
                fontWeight: 800,
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <span>💼 Become a Reseller Agent →</span>
            </Link>
          </div>

          {/* Key Trust Stats Pill Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
            gap: '14px',
            maxWidth: '960px',
            margin: '0 auto',
          }}>
            {[
              { icon: '🚀', label: 'Gigabit Fiber', val: 'Up to 50 Mbps' },
              { icon: '⚡', label: 'Activation', val: 'Instant Delivery' },
              { icon: '💰', label: 'Starting Rate', val: 'From ₦100 / Pass' },
              { icon: '🛡️', label: 'Network Uptime', val: '99.9% Reliable' },
            ].map((stat, i) => (
              <div
                key={i}
                style={{
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '18px',
                  padding: '18px 16px',
                  textAlign: 'center',
                  backdropFilter: 'blur(10px)',
                }}
              >
                <div style={{ fontSize: '24px', marginBottom: '4px' }}>{stat.icon}</div>
                <div style={{ fontSize: '18px', fontWeight: 900, color: '#FFFFFF' }}>{stat.val}</div>
                <div style={{ fontSize: '12px', color: '#9CA3AF', marginTop: '2px', fontWeight: 600 }}>{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PLANS & PRICING SHOWCASE ── */}
      <section id="plans" style={{
        padding: '70px 24px',
        maxWidth: '1200px',
        margin: '0 auto',
      }}>
        <div style={{ textAlign: 'center', marginBottom: '48px' }}>
          <span style={{ fontSize: '12px', fontWeight: 800, color: '#22C55E', textTransform: 'uppercase', letterSpacing: '1px' }}>
            Flexible &amp; Transparent
          </span>
          <h2 style={{ fontSize: '32px', fontWeight: 900, color: '#FFFFFF', margin: '8px 0 12px' }}>
            Choose Your Wi-Fi Pass
          </h2>
          <p style={{ fontSize: '15px', color: '#9CA3AF', maxWidth: '520px', margin: '0 auto' }}>
            No subscriptions or hidden fees. Purchase a pass, receive your code instantly, and start surfing immediately.
          </p>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
          gap: '20px',
        }}>
          {plans.map((p, idx) => {
            const isPop = p.popular || idx === 1;
            return (
              <div
                key={p.id || idx}
                style={{
                  background: isPop
                    ? 'linear-gradient(135deg, rgba(34, 197, 94, 0.14) 0%, rgba(20, 24, 28, 0.95) 100%)'
                    : 'rgba(255, 255, 255, 0.03)',
                  border: isPop ? '2px solid #22C55E' : '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '24px',
                  padding: '28px 22px',
                  position: 'relative',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  boxShadow: isPop ? '0 12px 36px rgba(34, 197, 94, 0.25)' : 'none',
                }}
              >
                {isPop && (
                  <span style={{
                    position: 'absolute',
                    top: '-12px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: '#22C55E',
                    color: '#0B0D13',
                    fontSize: '11px',
                    fontWeight: 900,
                    padding: '3px 12px',
                    borderRadius: '999px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                  }}>
                    Most Popular
                  </span>
                )}

                <div>
                  <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#FFFFFF', margin: '0 0 6px' }}>
                    {p.name}
                  </h3>
                  <div style={{ fontSize: '13px', color: '#9CA3AF', marginBottom: '20px' }}>
                    Duration: <strong style={{ color: '#4ADE80' }}>{p.duration || 'Unlimited Fast'}</strong>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginBottom: '24px' }}>
                    <span style={{ fontSize: '34px', fontWeight: 900, color: '#FFFFFF', letterSpacing: '-0.5px' }}>
                      {formatPrice(p.price)}
                    </span>
                    <span style={{ fontSize: '13px', color: '#9CA3AF' }}>/ pass</span>
                  </div>

                  {/* Feature Bullets */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '28px' }}>
                    {[
                      'Unlimited High-Speed Download',
                      'Instant Voucher PIN via SMS/Screen',
                      'Multiple Router Roaming',
                      'First-Login Expiry Policy',
                      '24/7 Network Support',
                    ].map((feat, fIdx) => (
                      <div key={fIdx} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#D1D5DB' }}>
                        <span style={{ color: '#22C55E', fontWeight: 800 }}>✓</span>
                        <span>{feat}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <Link
                  href="/packages"
                  style={{
                    display: 'block',
                    textAlign: 'center',
                    padding: '12px 18px',
                    borderRadius: '14px',
                    background: isPop ? '#22C55E' : 'rgba(255, 255, 255, 0.08)',
                    color: isPop ? '#0B0D13' : '#FFFFFF',
                    fontSize: '14px',
                    fontWeight: 800,
                    textDecoration: 'none',
                    transition: 'all 0.2s ease',
                  }}
                >
                  Get Pass Now →
                </Link>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section id="how-it-works" style={{
        padding: '70px 24px',
        background: 'rgba(255, 255, 255, 0.015)',
        borderTop: '1px solid rgba(255, 255, 255, 0.05)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
      }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '50px' }}>
            <span style={{ fontSize: '12px', fontWeight: 800, color: '#22C55E', textTransform: 'uppercase', letterSpacing: '1px' }}>
              Simple 3-Step Process
            </span>
            <h2 style={{ fontSize: '32px', fontWeight: 900, color: '#FFFFFF', margin: '8px 0 12px' }}>
              How to Connect to Our Hotspot
            </h2>
            <p style={{ fontSize: '15px', color: '#9CA3AF', maxWidth: '520px', margin: '0 auto' }}>
              Connect your smartphone, tablet, or laptop in less than 30 seconds.
            </p>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '24px',
          }}>
            {[
              {
                step: '01',
                title: 'Join the Wi-Fi Network',
                desc: 'Open your device Wi-Fi settings and select "My Collective Sub Wi-Fi" or our local Katsina hotspot SSID.',
                icon: '📶',
              },
              {
                step: '02',
                title: 'Select or Enter Voucher',
                desc: 'The captive portal opens automatically. Enter your voucher PIN or buy a pass directly using Flutterwave / Monnify / Wallet.',
                icon: '🎟️',
              },
              {
                step: '03',
                title: 'Surf Without Limits',
                desc: 'You are authenticated immediately. Enjoy ultra-fast browsing, HD video streaming, voice calls, and downloads.',
                icon: '⚡',
              },
            ].map((step, idx) => (
              <div
                key={idx}
                style={{
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '22px',
                  padding: '30px 24px',
                  position: 'relative',
                }}
              >
                <div style={{
                  fontSize: '32px',
                  fontWeight: 900,
                  color: 'rgba(34, 197, 94, 0.3)',
                  marginBottom: '14px',
                  fontFamily: "'JetBrains Mono', monospace",
                }}>
                  {step.step}
                </div>
                <div style={{ fontSize: '28px', marginBottom: '12px' }}>{step.icon}</div>
                <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#FFFFFF', margin: '0 0 8px' }}>
                  {step.title}
                </h3>
                <p style={{ fontSize: '14px', color: '#9CA3AF', lineHeight: 1.6, margin: 0 }}>
                  {step.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── KATSINA COVERAGE & LOCATIONS ── */}
      <section id="coverage" style={{
        padding: '70px 24px',
        maxWidth: '1200px',
        margin: '0 auto',
      }}>
        <div style={{ textAlign: 'center', marginBottom: '48px' }}>
          <span style={{ fontSize: '12px', fontWeight: 800, color: '#22C55E', textTransform: 'uppercase', letterSpacing: '1px' }}>
            Coverage Zones
          </span>
          <h2 style={{ fontSize: '32px', fontWeight: 900, color: '#FFFFFF', margin: '8px 0 12px' }}>
            Our Hotspot Locations in Katsina State
          </h2>
          <p style={{ fontSize: '15px', color: '#9CA3AF', maxWidth: '580px', margin: '0 auto' }}>
            With our multi-router roaming architecture, your single voucher allows seamless internet access across multiple locations.
          </p>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: '20px',
        }}>
          {[
            {
              hub: 'Katsina Central Hub',
              area: '156 Abdullahi Sarki Mukhtar Road, Katsina',
              type: 'Headquarters & Primary Coverage Hub',
              status: 'Active 24/7',
              speed: '50 Mbps',
            },
            {
              hub: 'Katsina Commercial District',
              area: 'Central Business Area, Katsina City',
              type: 'Retail, Markets & Business Centers',
              status: 'Active 24/7',
              speed: '40 Mbps',
            },
            {
              hub: 'Educational & Student Hub',
              area: 'University & College Neighborhoods, Katsina',
              type: 'Student & Academic Hotspot Stations',
              status: 'Active 24/7',
              speed: '35 Mbps',
            },
            {
              hub: 'Transit & Gateway Stations',
              area: 'Major Transport Routes & Terminal Points',
              type: 'Travelers & On-The-Go Commuters',
              status: 'Active 24/7',
              speed: '30 Mbps',
            },
          ].map((loc, i) => (
            <div
              key={i}
              style={{
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '20px',
                padding: '24px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <span style={{ fontSize: '20px' }}>📍</span>
                <span style={{
                  fontSize: '11px',
                  fontWeight: 800,
                  color: '#22C55E',
                  background: 'rgba(34, 197, 94, 0.12)',
                  padding: '3px 10px',
                  borderRadius: '999px',
                }}>
                  {loc.status}
                </span>
              </div>
              <h3 style={{ fontSize: '17px', fontWeight: 800, color: '#FFFFFF', margin: '0 0 6px' }}>
                {loc.hub}
              </h3>
              <p style={{ fontSize: '13px', color: '#4ADE80', fontWeight: 600, margin: '0 0 8px' }}>
                {loc.area}
              </p>
              <p style={{ fontSize: '12.5px', color: '#9CA3AF', margin: '0 0 14px', lineHeight: 1.5 }}>
                {loc.type}
              </p>
              <div style={{ fontSize: '12px', color: '#E5E7EB', borderTop: '1px solid rgba(255, 255, 255, 0.06)', paddingTop: '10px' }}>
                Speed: <strong>{loc.speed} Broadband Fiber</strong>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── RESELLER WHOLESALE AGENT PROGRAM ── */}
      <section id="reseller" style={{
        padding: '70px 24px',
        maxWidth: '1200px',
        margin: '0 auto',
      }}>
        <div style={{
          background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.18) 0%, rgba(21, 128, 61, 0.1) 100%)',
          border: '1.5px solid rgba(34, 197, 94, 0.35)',
          borderRadius: '28px',
          padding: '48px 36px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          position: 'relative',
          overflow: 'hidden',
        }}>
          <div style={{
            fontSize: '12px',
            fontWeight: 800,
            color: '#4ADE80',
            textTransform: 'uppercase',
            letterSpacing: '1px',
            marginBottom: '8px',
          }}>
            💼 Business Partnership
          </div>
          <h2 style={{ fontSize: '32px', fontWeight: 900, color: '#FFFFFF', maxWidth: '680px', margin: '0 0 14px' }}>
            Become a Wi-Fi Voucher Agent in Katsina State
          </h2>
          <p style={{ fontSize: '15px', color: '#D1D5DB', maxWidth: '620px', margin: '0 0 28px', lineHeight: 1.6 }}>
            Do you own a shop, business center, POS kiosk, or are you a student? Buy Wi-Fi vouchers at wholesale bulk discounts and resell to customers with immediate profit margins.
          </p>

          <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', justifyContent: 'center' }}>
            <Link
              href="/reseller/signup"
              style={{
                padding: '14px 28px',
                borderRadius: '999px',
                background: '#22C55E',
                color: '#0B0D13',
                fontSize: '15px',
                fontWeight: 800,
                textDecoration: 'none',
                boxShadow: '0 6px 20px rgba(34, 197, 94, 0.4)',
              }}
            >
              Apply as an Agent Today →
            </Link>
            <Link
              href="/reseller"
              style={{
                padding: '14px 24px',
                borderRadius: '999px',
                background: 'rgba(255, 255, 255, 0.08)',
                color: '#FFFFFF',
                fontSize: '15px',
                fontWeight: 700,
                textDecoration: 'none',
                border: '1px solid rgba(255, 255, 255, 0.15)',
              }}
            >
              Agent Portal Login
            </Link>
          </div>
        </div>
      </section>

      {/* ── CONTACT & LOCATION SHOWCASE ── */}
      <section id="contact" style={{
        padding: '70px 24px',
        maxWidth: '1200px',
        margin: '0 auto',
      }}>
        <div style={{ textAlign: 'center', marginBottom: '48px' }}>
          <span style={{ fontSize: '12px', fontWeight: 800, color: '#22C55E', textTransform: 'uppercase', letterSpacing: '1px' }}>
            Get in Touch
          </span>
          <h2 style={{ fontSize: '32px', fontWeight: 900, color: '#FFFFFF', margin: '8px 0 12px' }}>
            Contact &amp; Customer Support
          </h2>
          <p style={{ fontSize: '15px', color: '#9CA3AF', maxWidth: '520px', margin: '0 auto' }}>
            Have questions about vouchers, hotspot coverage, or wholesale accounts? We are here to help.
          </p>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '28px',
        }}>
          {/* Official Contact Info Card */}
          <div style={{
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1.5px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '24px',
            padding: '34px 28px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}>
            <div>
              <h3 style={{ fontSize: '20px', fontWeight: 800, color: '#FFFFFF', margin: '0 0 18px' }}>
                Headquarters &amp; Support Info
              </h3>

              {/* Physical Address */}
              <div style={{ display: 'flex', gap: '14px', marginBottom: '22px' }}>
                <div style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '12px',
                  background: 'rgba(34, 197, 94, 0.12)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '20px',
                  flexShrink: 0,
                }}>
                  📍
                </div>
                <div>
                  <div style={{ fontSize: '12px', color: '#9CA3AF', fontWeight: 700, textTransform: 'uppercase' }}>
                    Physical Address
                  </div>
                  <div style={{ fontSize: '14.5px', color: '#FFFFFF', fontWeight: 700, marginTop: '2px', lineHeight: 1.5 }}>
                    156 Abdullahi Sarki Mukhtar Road, Katsina, Katsina State, Nigeria
                  </div>
                </div>
              </div>

              {/* Official Email */}
              <div style={{ display: 'flex', gap: '14px', marginBottom: '22px' }}>
                <div style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '12px',
                  background: 'rgba(34, 197, 94, 0.12)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '20px',
                  flexShrink: 0,
                }}>
                  ✉️
                </div>
                <div>
                  <div style={{ fontSize: '12px', color: '#9CA3AF', fontWeight: 700, textTransform: 'uppercase' }}>
                    Official Email
                  </div>
                  <a
                    href="mailto:Aabaxzsulyman@gmail.com"
                    style={{ fontSize: '14.5px', color: '#4ADE80', fontWeight: 700, marginTop: '2px', display: 'block', textDecoration: 'none' }}
                  >
                    Aabaxzsulyman@gmail.com
                  </a>
                </div>
              </div>

              {/* Support & Phone */}
              <div style={{ display: 'flex', gap: '14px', marginBottom: '22px' }}>
                <div style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '12px',
                  background: 'rgba(34, 197, 94, 0.12)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '20px',
                  flexShrink: 0,
                }}>
                  📞
                </div>
                <div>
                  <div style={{ fontSize: '12px', color: '#9CA3AF', fontWeight: 700, textTransform: 'uppercase' }}>
                    Customer Hotline &amp; WhatsApp
                  </div>
                  <div style={{ fontSize: '14.5px', color: '#FFFFFF', fontWeight: 700, marginTop: '2px' }}>
                    Aabaxzsulyman@gmail.com / Direct Support Line
                  </div>
                </div>
              </div>

              {/* Operating Hours */}
              <div style={{ display: 'flex', gap: '14px' }}>
                <div style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '12px',
                  background: 'rgba(34, 197, 94, 0.12)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '20px',
                  flexShrink: 0,
                }}>
                  ⏰
                </div>
                <div>
                  <div style={{ fontSize: '12px', color: '#9CA3AF', fontWeight: 700, textTransform: 'uppercase' }}>
                    Hotspot Service Hours
                  </div>
                  <div style={{ fontSize: '14.5px', color: '#FFFFFF', fontWeight: 700, marginTop: '2px' }}>
                    Open 24 Hours • 7 Days a Week
                  </div>
                </div>
              </div>
            </div>

            <div style={{
              marginTop: '28px',
              padding: '14px 18px',
              borderRadius: '14px',
              background: 'rgba(34, 197, 94, 0.08)',
              border: '1px solid rgba(34, 197, 94, 0.2)',
              fontSize: '12.5px',
              color: '#9CA3AF',
            }}>
              💡 <strong>Instant Voucher Verification:</strong> If you purchased a physical printed card at any of our outlets, enter the code directly in the <Link href="/login" style={{ color: '#4ADE80', fontWeight: 700 }}>Hotspot Login</Link> portal.
            </div>
          </div>

          {/* Direct Inquiry Form */}
          <div style={{
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1.5px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '24px',
            padding: '34px 28px',
          }}>
            <h3 style={{ fontSize: '20px', fontWeight: 800, color: '#FFFFFF', margin: '0 0 6px' }}>
              Send Us a Message
            </h3>
            <p style={{ fontSize: '13px', color: '#9CA3AF', margin: '0 0 20px' }}>
              We reply within minutes to inquiries and partnership requests.
            </p>

            {inquirySent ? (
              <div style={{
                padding: '24px',
                borderRadius: '16px',
                background: 'rgba(34, 197, 94, 0.15)',
                border: '1px solid rgba(34, 197, 94, 0.4)',
                textAlign: 'center',
              }}>
                <div style={{ fontSize: '32px', marginBottom: '8px' }}>✓</div>
                <div style={{ fontSize: '16px', fontWeight: 800, color: '#4ADE80', marginBottom: '4px' }}>
                  Thank you! Message Received.
                </div>
                <p style={{ fontSize: '13px', color: '#D1D5DB', margin: 0 }}>
                  Our support desk has received your request and will contact you at <strong>{inquiryEmail}</strong> shortly.
                </p>
              </div>
            ) : (
              <form onSubmit={handleInquirySubmit}>
                <div style={{ marginBottom: '14px' }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#9CA3AF', marginBottom: '6px' }}>
                    Your Name
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Aminu Bello"
                    value={inquiryName}
                    onChange={(e) => setInquiryName(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '12px 14px',
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      borderRadius: '12px',
                      color: '#FFFFFF',
                      fontSize: '14px',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#9CA3AF', marginBottom: '6px' }}>
                      Email Address
                    </label>
                    <input
                      type="email"
                      required
                      placeholder="you@gmail.com"
                      value={inquiryEmail}
                      onChange={(e) => setInquiryEmail(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '12px 14px',
                        background: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid rgba(255, 255, 255, 0.12)',
                        borderRadius: '12px',
                        color: '#FFFFFF',
                        fontSize: '14px',
                        outline: 'none',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#9CA3AF', marginBottom: '6px' }}>
                      Phone / WhatsApp
                    </label>
                    <input
                      type="tel"
                      placeholder="080..."
                      value={inquiryPhone}
                      onChange={(e) => setInquiryPhone(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '12px 14px',
                        background: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid rgba(255, 255, 255, 0.12)',
                        borderRadius: '12px',
                        color: '#FFFFFF',
                        fontSize: '14px',
                        outline: 'none',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>
                </div>

                <div style={{ marginBottom: '18px' }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#9CA3AF', marginBottom: '6px' }}>
                    Message / Question
                  </label>
                  <textarea
                    rows={4}
                    required
                    placeholder="How can we help you?"
                    value={inquiryMessage}
                    onChange={(e) => setInquiryMessage(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '12px 14px',
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      borderRadius: '12px',
                      color: '#FFFFFF',
                      fontSize: '14px',
                      outline: 'none',
                      resize: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                <button
                  type="submit"
                  style={{
                    width: '100%',
                    padding: '14px',
                    borderRadius: '14px',
                    background: 'linear-gradient(135deg, #22C55E 0%, #15803D 100%)',
                    color: '#FFFFFF',
                    border: 'none',
                    fontSize: '14.5px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    boxShadow: '0 4px 16px rgba(34, 197, 94, 0.35)',
                  }}
                >
                  Send Inquiry Message →
                </button>
              </form>
            )}
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{
        background: '#07080B',
        borderTop: '1px solid rgba(255, 255, 255, 0.08)',
        padding: '50px 24px 30px',
      }}>
        <div style={{
          maxWidth: '1200px',
          margin: '0 auto',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '30px',
          marginBottom: '40px',
        }}>
          {/* Brand Col */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #22C55E 0%, #15803D 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <WifiIcon size={16} color="#FFFFFF" />
              </div>
              <span style={{ fontSize: '17px', fontWeight: 900, color: '#FFFFFF' }}>
                My Collective Sub
              </span>
            </div>
            <p style={{ fontSize: '13px', color: '#9CA3AF', lineHeight: 1.6, margin: '0 0 14px' }}>
              Premier wireless broadband &amp; hotspot solutions across Katsina State, Nigeria.
            </p>
            <div style={{ fontSize: '12px', color: '#6B7280' }}>
              📍 156 Abdullahi Sarki Mukhtar Road, Katsina, Katsina State, Nigeria
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h4 style={{ fontSize: '14px', fontWeight: 800, color: '#FFFFFF', marginBottom: '14px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Quick Navigation
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13.5px' }}>
              <Link href="/packages" style={{ color: '#9CA3AF', textDecoration: 'none' }}>Wi-Fi Passes</Link>
              <Link href="/login" style={{ color: '#9CA3AF', textDecoration: 'none' }}>Hotspot Portal Login</Link>
              <Link href="/wallet" style={{ color: '#9CA3AF', textDecoration: 'none' }}>Customer Digital Wallet</Link>
              <Link href="/reseller/signup" style={{ color: '#9CA3AF', textDecoration: 'none' }}>Wholesale Agent Signup</Link>
              <Link href="/vouchers/status" style={{ color: '#9CA3AF', textDecoration: 'none' }}>Check Voucher Expiry</Link>
            </div>
          </div>

          {/* Portal Access */}
          <div>
            <h4 style={{ fontSize: '14px', fontWeight: 800, color: '#FFFFFF', marginBottom: '14px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Account &amp; Management
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13.5px' }}>
              <Link href="/auth" style={{ color: '#9CA3AF', textDecoration: 'none' }}>Client Account Sign In</Link>
              <Link href="/auth" style={{ color: '#9CA3AF', textDecoration: 'none' }}>Create Free Account</Link>
              <Link href="/reseller" style={{ color: '#9CA3AF', textDecoration: 'none' }}>Agent Management</Link>
              <Link href="/super-admin" style={{ color: '#9CA3AF', textDecoration: 'none' }}>Super Admin Center</Link>
            </div>
          </div>

          {/* Contact Direct */}
          <div>
            <h4 style={{ fontSize: '14px', fontWeight: 800, color: '#FFFFFF', marginBottom: '14px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Direct Inquiries
            </h4>
            <p style={{ fontSize: '13px', color: '#9CA3AF', lineHeight: 1.6, margin: '0 0 10px' }}>
              Email our management desk directly for bulk purchases, enterprise fiber, and partnership inquiries:
            </p>
            <a
              href="mailto:Aabaxzsulyman@gmail.com"
              style={{
                display: 'inline-block',
                padding: '8px 14px',
                borderRadius: '8px',
                background: 'rgba(34, 197, 94, 0.1)',
                color: '#4ADE80',
                fontSize: '13px',
                fontWeight: 700,
                textDecoration: 'none',
                border: '1px solid rgba(34, 197, 94, 0.25)',
              }}
            >
              Aabaxzsulyman@gmail.com
            </a>
          </div>
        </div>

        {/* Copyright */}
        <div style={{
          maxWidth: '1200px',
          margin: '0 auto',
          borderTop: '1px solid rgba(255, 255, 255, 0.06)',
          paddingTop: '20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          fontSize: '12px',
          color: '#6B7280',
        }}>
          <div>
            © {new Date().getFullYear()} My Collective Sub. All rights reserved. 156 Abdullahi Sarki Mukhtar Road, Katsina, Katsina State, Nigeria.
          </div>
          <div style={{ display: 'flex', gap: '16px' }}>
            <span>Aabaxzsulyman@gmail.com</span>
            <span>•</span>
            <span>Katsina Broadband Hotspots</span>
          </div>
        </div>
      </footer>

      {/* Responsive helper style */}
      <style jsx>{`
        @media (min-width: 768px) {
          .desktop-nav {
            display: flex !important;
          }
        }
      `}</style>
    </div>
  );
}

