'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../context/AuthContext';
import { getGuestVouchers, enableGuestSession } from '../../lib/guest-vouchers.js';
import BottomNav from '../components/BottomNav';
import CheckoutModal from '../components/CheckoutModal';
import PendingPaymentBanner from '../components/PendingPaymentBanner';
import RoamingBanner from '../components/RoamingBanner';
import {
  ChevronLeftIcon,
  ShieldIcon,
  WifiIcon,
  ArrowUpRightIcon,
  CheckIcon,
} from '../components/Icons';

const CATEGORY_FILTERS = [
  { id: 'all', label: 'All Passes' },
  { id: 'hourly', label: 'Hourly' },
  { id: 'daily', label: 'Daily' },
  { id: 'unlimited', label: 'Unlimited' },
];

export default function PackagesPage() {
  const router = useRouter();
  const { user, refreshWallet } = useAuth();

  const [plans, setPlans] = useState([]);
  const [schedulerRules, setSchedulerRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [activeFilter, setActiveFilter] = useState('all');
  const [toast, setToast] = useState('');
  const [savedVoucher, setSavedVoucher] = useState(null);
  const [copiedSaved, setCopiedSaved] = useState(false);

  useEffect(() => {
    const refreshLocal = () => {
      const list = getGuestVouchers();
      setSavedVoucher(list[0] || null);
    };
    refreshLocal();
    window.addEventListener('active_voucher_updated', refreshLocal);
    window.addEventListener('storage', refreshLocal);
    return () => {
      window.removeEventListener('active_voucher_updated', refreshLocal);
      window.removeEventListener('storage', refreshLocal);
    };
  }, []);

  const formatPrice = (amount) =>
    '₦' +
    Number(amount || 0).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const getPlanPricing = (plan) => {
    if (!schedulerRules || schedulerRules.length === 0) {
      return { price: plan.price, isDiscounted: false, originalPrice: plan.price, badge: null };
    }
    const topRule = [...schedulerRules].sort((a, b) => (b.discount_percent || 0) - (a.discount_percent || 0))[0];
    const discount = topRule.discount_percent || 0;
    const effective = Math.round(plan.price * (1 - discount / 100));
    return {
      price: effective,
      isDiscounted: discount > 0,
      originalPrice: plan.price,
      badge: topRule.badge
    };
  };

  useEffect(() => {
    const fetchPlans = async () => {
      try {
        if (typeof window !== 'undefined') {
          const sp = new URLSearchParams(window.location.search);
          const loginUrl = sp.get('link_login_only') || sp.get('link-login-only');
          if (loginUrl) {
            try { sessionStorage.setItem('an_hotspot_login_url', loginUrl); } catch {}
          }
        }
        const [plansRes, schedRes] = await Promise.all([
          fetch('/api/super-admin/plans'),
          fetch('/api/settings/scheduler').catch(() => null)
        ]);
        let activeRules = [];
        if (schedRes && schedRes.ok) {
          const sData = await schedRes.json();
          if (sData.active_rules) {
            activeRules = sData.active_rules;
            setSchedulerRules(sData.active_rules);
          }
        }
        if (plansRes.ok) {
          const data = await plansRes.json();
          setPlans(data);
          if (typeof window !== 'undefined' && Array.isArray(data) && data.length > 0) {
            const sp = new URLSearchParams(window.location.search);
            const targetId = sp.get('plan_id') || sp.get('plan');
            if (targetId) {
              const match = data.find(p => String(p.id) === targetId || String(p.name || '').toLowerCase() === targetId.toLowerCase());
              if (match) {
                const topRule = activeRules.length > 0
                  ? [...activeRules].sort((a, b) => (b.discount_percent || 0) - (a.discount_percent || 0))[0]
                  : null;
                const discount = topRule?.discount_percent || 0;
                const planToBuy = discount > 0 ? { ...match, price: Math.round(match.price * (1 - discount / 100)) } : match;
                setSelectedPlan(planToBuy);
                setCheckoutOpen(true);
              }
            }
          }
        }
      } catch (err) {
        console.error('Error loading plans or scheduler:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchPlans();
  }, []);

  const handleSelectPlan = (plan) => {
    setSelectedPlan(plan);
    setCheckoutOpen(true);
  };

  // Filter plans based on active capsule filter
  const filteredPlans = useMemo(() => {
    if (activeFilter === 'all') return plans;
    if (activeFilter === 'hourly') {
      return plans.filter((p) => {
        const d = (p.duration || '').toLowerCase();
        const n = (p.name || '').toLowerCase();
        return d.includes('hour') || n.includes('hour') || d.includes('hr');
      });
    }
    if (activeFilter === 'daily') {
      return plans.filter((p) => {
        const d = (p.duration || '').toLowerCase();
        const n = (p.name || '').toLowerCase();
        return d.includes('day') || n.includes('day') || d.includes('24h');
      });
    }
    if (activeFilter === 'unlimited') {
      return plans.filter((p) => {
        const s = (p.speed || '').toLowerCase();
        const n = (p.name || '').toLowerCase();
        return s.includes('unlimited') || n.includes('unlimited') || p.popular;
      });
    }
    return plans;
  }, [plans, activeFilter]);

  // Find a flagship / popular plan for the top hero banner
  const featuredPlan = useMemo(() => {
    const raw = plans.find((p) => p.popular) || plans[0] || null;
    if (!raw) return null;
    const pricing = getPlanPricing(raw);
    return pricing.isDiscounted ? { ...raw, price: pricing.price, originalPrice: pricing.originalPrice, badge: pricing.badge } : raw;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plans, schedulerRules]);

  return (
    <div className="app-shell">
      <CheckoutModal
        isOpen={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        plan={selectedPlan}
        onSuccess={() => {
          if (user) refreshWallet();
          showToast('Pass voucher activated!');
        }}
      />

      {/* Screen Topbar */}
      <div className="screen-topbar">
        <button
          className="circle-icon-btn"
          onClick={() => {
            enableGuestSession();
            router.push('/');
          }}
          aria-label="Back to home"
        >
          <ChevronLeftIcon size={20} color="#121217" />
        </button>

        <h1 className="screen-title">Wi-Fi Passes</h1>

        <div style={{ width: '40px' }} />
      </div>

      <PendingPaymentBanner showManualRecovery={!user} onVoucherRecovered={() => showToast('✅ Paid pass recovered & saved!')} />

      {savedVoucher && (
        <div style={{
          background: '#EFF6FF',
          border: '1.5px solid #BFDBFE',
          borderRadius: '18px',
          padding: '12px 16px',
          marginBottom: '16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '10px',
          flexWrap: 'wrap',
        }}>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 800, color: '#035EC8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Saved Pass Ready ({savedVoucher.plan})
            </div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '17px', fontWeight: 900, color: '#062B66', letterSpacing: '1.5px' }}>
              {savedVoucher.code}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(savedVoucher.code);
                setCopiedSaved(true);
                showToast(`PIN ${savedVoucher.code} copied!`);
                setTimeout(() => setCopiedSaved(false), 2000);
              }}
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
              {copiedSaved ? '✓ Copied' : 'Copy PIN'}
            </button>
            <button
              type="button"
              onClick={() => router.push('/vouchers')}
              style={{
                padding: '7px 12px',
                borderRadius: '999px',
                background: '#FFFFFF',
                color: '#035EC8',
                border: '1px solid #BFDBFE',
                fontSize: '11.5px',
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              My Passes →
            </button>
          </div>
        </div>
      )}

      <RoamingBanner onVoucherResumed={() => router.push('/status')} />

      {/* Featured Flagship Pass Hero */}
      {featuredPlan && (
        <div className="packages-hero-card">
          <div className="packages-hero-tag">
            <span>⚡ Most Popular Choice</span>
          </div>

          <h2 className="packages-hero-title">{featuredPlan.name}</h2>
          <p className="packages-hero-sub">
            {featuredPlan.speed || 'High-Speed 12 Mbps'} • {featuredPlan.devices || 1} Device{(featuredPlan.devices || 1) > 1 ? 's' : ''} • {featuredPlan.duration}
          </p>

          <div className="packages-hero-bottom">
            <div className="packages-hero-price">
              {formatPrice(featuredPlan.price)}
            </div>

            <button
              className="packages-hero-btn"
              onClick={() => handleSelectPlan(featuredPlan)}
            >
              + Buy Pass Now
            </button>
          </div>
        </div>
      )}

      {/* Category Segmented Capsule Filter */}
      <div className="packages-filter-wrap">
        {CATEGORY_FILTERS.map((cat) => (
          <button
            key={cat.id}
            className={`packages-filter-pill ${activeFilter === cat.id ? 'active' : ''}`}
            onClick={() => setActiveFilter(cat.id)}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Passes Grid */}
      {loading ? (
        <div className="pass-card-modern" style={{ textAlign: 'center', padding: '36px' }}>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
            Loading live router passes...
          </p>
        </div>
      ) : filteredPlans.length === 0 ? (
        <div className="pass-card-modern" style={{ textAlign: 'center', padding: '36px' }}>
          <p style={{ fontSize: '14px', color: 'var(--text-muted)' }}>
            No passes found in this category.
          </p>
        </div>
      ) : (
        <div className="pass-grid-list">
          {filteredPlans.map((plan) => {
            const pricing = getPlanPricing(plan);
            const planToBuy = pricing.isDiscounted ? { ...plan, price: pricing.price } : plan;
            return (
              <div
                key={plan.id}
                className="pass-card-modern"
                onClick={() => handleSelectPlan(planToBuy)}
              >
                <div className="pass-card-top">
                  <div className="pass-badge-group">
                    <div className="pass-wifi-icon-badge">
                      <WifiIcon size={20} color="#0088FF" />
                    </div>
                    <span className={`pass-tag-pill ${plan.popular ? 'popular' : ''}`}>
                      {plan.duration}
                    </span>
                    {pricing.badge && (
                      <span className="pass-tag-pill" style={{ background: '#E6F2FF', color: '#035EC8', border: '1px solid #BFDBFE' }}>
                        {pricing.badge}
                      </span>
                    )}
                  </div>

                  {pricing.isDiscounted ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                      <span style={{ fontSize: '11px', textDecoration: 'line-through', color: 'var(--text-muted)' }}>
                        {formatPrice(pricing.originalPrice)}
                      </span>
                      <div className="pass-price-large" style={{ color: '#035EC8' }}>
                        {formatPrice(pricing.price)}
                      </div>
                    </div>
                  ) : (
                    <div className="pass-price-large">{formatPrice(plan.price)}</div>
                  )}
                </div>

                <div className="pass-card-mid">
                  <h3 className="pass-card-title">{plan.name}</h3>
                  <p className="pass-card-specs">
                    {plan.speed || 'Unlimited Bandwidth'} • {plan.devices || 1} Device{(plan.devices || 1) > 1 ? 's' : ''}
                  </p>
                </div>

                <div className="pass-card-bottom">
                  <div className="pass-instant-tag">
                    <CheckIcon size={14} color="#0088FF" />
                    <span>Instant MikroTik Pin</span>
                  </div>

                  <button
                    type="button"
                    className="pass-buy-action-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSelectPlan(planToBuy);
                    }}
                  >
                    <span>Select</span>
                    <ArrowUpRightIcon size={14} color="#FFFFFF" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <BottomNav />
      {toast && <div className="toast show">{toast}</div>}
    </div>
  );
}
