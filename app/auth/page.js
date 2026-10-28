'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../context/AuthContext';
import { useBranding } from '../context/BrandingContext';
import { supabase } from '../../lib/supabase';
import BottomNav from '../components/BottomNav';
import {
  ChevronLeftIcon,
  WifiIcon,
  ShieldIcon,
  UserIcon,
  MailIcon,
  LockIcon,
  EyeIcon,
  EyeOffIcon,
  LogOutIcon,
  WalletIcon,
  ArrowUpRightIcon,
} from '../components/Icons';

export default function AuthPage() {
  const router = useRouter();
  const { signUp, signIn, signOut, user, profile, wallet, loading: authLoading } = useAuth();
  const { appName } = useBranding();

  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [forgotMode, setForgotMode] = useState(false);
  const [resetEmail, setResetEmail] = useState('');

  const formatPrice = (amount) =>
    '₦' +
    Number(amount || 0).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      if (isLogin) {
        await signIn(email.trim(), password);
        localStorage.removeItem('asuk_guest_session');
        router.push('/');
      } else {
        const data = await signUp(email.trim(), password, fullName.trim());
        if (data?.user?.identities?.length === 0) {
          setError('An account with this email already exists.');
        } else if (data?.user && !data?.session) {
          setSuccess('Account created! Please sign in with your credentials.');
          setIsLogin(true);
          setPassword('');
        } else {
          router.push('/');
        }
      }
    } catch (err) {
      setError(err.message || 'Authentication failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        resetEmail.trim(),
        {
          redirectTo: typeof window !== 'undefined'
            ? `${window.location.origin}/auth/reset-password`
            : undefined,
        }
      );
      if (resetError) throw resetError;
      setSuccess('Password reset link sent! Check your email inbox (and spam folder).');
    } catch (err) {
      setError(err.message || 'Failed to send reset email. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      localStorage.removeItem('asuk_guest_session');
      router.push('/auth');
    } catch (err) {
      console.error('Sign out error:', err);
    }
  };

  // ── Logged In User: Profile & Account Overview ──
  if (user && !authLoading) {
    const displayName = profile?.full_name || user.email?.split('@')[0] || 'Member';
    const initial = displayName.charAt(0).toUpperCase();
    const balance = wallet ? parseFloat(wallet.balance) : 0;

    return (
      <div className="app-shell" style={{ paddingBottom: '90px' }}>
        {/* Topbar */}
        <div className="screen-topbar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <button
            className="circle-icon-btn"
            onClick={() => router.push('/')}
            aria-label="Back to home"
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '50%',
              background: 'var(--surface, #FFFFFF)',
              border: '1px solid var(--border-light, #EAECEF)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
            }}
          >
            <ChevronLeftIcon size={20} color="var(--text-primary, #121217)" />
          </button>

          <h1 className="screen-title" style={{ fontSize: '18px', fontWeight: 800, margin: 0, color: 'var(--text-primary, #121217)' }}>
            My Account
          </h1>

          <div style={{ width: '42px' }} />
        </div>

        {/* Profile Hero Card */}
        <div style={{
          background: 'linear-gradient(135deg, rgba(52, 168, 83, 0.08) 0%, rgba(20, 24, 28, 0.03) 100%)',
          border: '1.5px solid rgba(52, 168, 83, 0.2)',
          borderRadius: '26px',
          padding: '28px 20px',
          textAlign: 'center',
          marginBottom: '20px',
          position: 'relative',
          overflow: 'hidden',
          boxShadow: '0 12px 32px rgba(0,0,0,0.04)',
        }}>
          <div style={{
            position: 'absolute',
            top: '-50px',
            right: '-50px',
            width: '120px',
            height: '120px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(52, 168, 83, 0.2) 0%, transparent 70%)',
            pointerEvents: 'none',
          }} />

          <div style={{
            width: '74px',
            height: '74px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #34A853 0%, #1E8E3E 100%)',
            color: '#FFFFFF',
            fontSize: '28px',
            fontWeight: 800,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 14px',
            boxShadow: '0 8px 24px rgba(52, 168, 83, 0.35)',
            border: '3px solid #FFFFFF',
          }}>
            {initial}
          </div>

          <h2 style={{ fontSize: '21px', fontWeight: 800, color: 'var(--text-primary, #121217)', margin: '0 0 4px', letterSpacing: '-0.3px' }}>
            {displayName}
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--text-muted, #8E8E93)', margin: '0 0 12px' }}>
            {user.email}
          </p>

          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '5px 14px', borderRadius: '999px', background: 'rgba(52, 168, 83, 0.12)', border: '1px solid rgba(52, 168, 83, 0.3)', color: '#34A853', fontSize: '12px', fontWeight: 700 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#34A853', boxShadow: '0 0 8px #34A853' }} />
            Verified Customer
          </div>
        </div>

        {/* Wallet & Passes Stats Strip */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
          <div style={{
            background: 'var(--surface, #FFFFFF)',
            border: '1.5px solid var(--border-light, #EAECEF)',
            borderRadius: '20px',
            padding: '18px 16px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.03)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}>
            <div>
              <span style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--text-muted, #8E8E93)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Wallet Balance
              </span>
              <div style={{ fontSize: '19px', fontWeight: 800, color: 'var(--text-primary, #121217)', marginTop: '4px' }}>
                {formatPrice(balance)}
              </div>
            </div>
            <button
              onClick={() => router.push('/wallet')}
              style={{
                marginTop: '12px',
                fontSize: '12.5px',
                fontWeight: 800,
                color: '#34A853',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                background: 'rgba(52, 168, 83, 0.1)',
                border: 'none',
                padding: '6px 12px',
                borderRadius: '999px',
                cursor: 'pointer',
                width: 'fit-content',
              }}
            >
              Top Up ↗
            </button>
          </div>

          <div style={{
            background: 'var(--surface, #FFFFFF)',
            border: '1.5px solid var(--border-light, #EAECEF)',
            borderRadius: '20px',
            padding: '18px 16px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.03)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}>
            <div>
              <span style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--text-muted, #8E8E93)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Wi-Fi Passes
              </span>
              <div style={{ fontSize: '19px', fontWeight: 800, color: '#34A853', marginTop: '4px' }}>
                Active
              </div>
            </div>
            <button
              onClick={() => router.push('/packages')}
              style={{
                marginTop: '12px',
                fontSize: '12.5px',
                fontWeight: 800,
                color: '#34A853',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                background: 'rgba(52, 168, 83, 0.1)',
                border: 'none',
                padding: '6px 12px',
                borderRadius: '999px',
                cursor: 'pointer',
                width: 'fit-content',
              }}
            >
              Buy Pass ↗
            </button>
          </div>
        </div>

        {/* Navigation Menu Links */}
        <div style={{
          background: 'var(--surface, #FFFFFF)',
          borderRadius: '22px',
          border: '1.5px solid var(--border-light, #EAECEF)',
          overflow: 'hidden',
          marginBottom: '20px',
          boxShadow: '0 4px 16px rgba(0,0,0,0.03)',
        }}>
          <div
            onClick={() => router.push('/wallet')}
            style={{
              padding: '16px 18px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderBottom: '1px solid var(--border-light, #EAECEF)',
              cursor: 'pointer',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '38px',
                height: '38px',
                borderRadius: '12px',
                background: 'rgba(52, 168, 83, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <WalletIcon size={18} color="#34A853" />
              </div>
              <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary, #121217)' }}>
                Wallet &amp; Transactions
              </span>
            </div>
            <ArrowUpRightIcon size={16} color="var(--text-muted, #8E8E93)" />
          </div>

          <div
            onClick={() => router.push('/packages')}
            style={{
              padding: '16px 18px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderBottom: '1px solid var(--border-light, #EAECEF)',
              cursor: 'pointer',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '38px',
                height: '38px',
                borderRadius: '12px',
                background: 'rgba(16, 185, 129, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <WifiIcon size={18} color="#10B981" />
              </div>
              <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary, #121217)' }}>
                Buy Wi-Fi Passes
              </span>
            </div>
            <ArrowUpRightIcon size={16} color="var(--text-muted, #8E8E93)" />
          </div>

          <div
            onClick={() => router.push('/analytics')}
            style={{
              padding: '16px 18px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '38px',
                height: '38px',
                borderRadius: '12px',
                background: 'rgba(255, 184, 76, 0.12)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <ShieldIcon size={18} color="#FFB84C" />
              </div>
              <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary, #121217)' }}>
                Usage Analytics
              </span>
            </div>
            <ArrowUpRightIcon size={16} color="var(--text-muted, #8E8E93)" />
          </div>
        </div>

        {/* Sign Out Button */}
        <button
          onClick={handleSignOut}
          style={{
            width: '100%',
            padding: '15px',
            background: 'var(--surface, #FFFFFF)',
            border: '1.5px solid #FEE2E2',
            borderRadius: '999px',
            color: '#EF4444',
            fontSize: '14px',
            fontWeight: 800,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            boxShadow: '0 2px 10px rgba(239, 68, 68, 0.06)',
            transition: 'all 0.15s ease',
          }}
        >
          <LogOutIcon size={18} color="#EF4444" />
          Sign Out of Account
        </button>

        <BottomNav />
      </div>
    );
  }

  // ── Logged Out: Modern User Sign In & Sign Up Form ──
  return (
    <div className="app-shell" style={{ paddingBottom: '40px' }}>
      {/* Top Bar */}
      <div className="screen-topbar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
        <button
          className="circle-icon-btn"
          onClick={() => router.push('/')}
          aria-label="Back to home"
          style={{
            width: '42px',
            height: '42px',
            borderRadius: '50%',
            background: 'var(--surface, #FFFFFF)',
            border: '1px solid var(--border-light, #EAECEF)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
          }}
        >
          <ChevronLeftIcon size={20} color="var(--text-primary, #121217)" />
        </button>

        <h1 className="screen-title" style={{ fontSize: '18px', fontWeight: 800, margin: 0, color: 'var(--text-primary, #121217)' }}>
          {isLogin ? 'Sign In' : 'Create Account'}
        </h1>

        <div style={{ width: '42px' }} />
      </div>

      {/* Modern Capsule Segmented Toggle */}
      <div style={{
        background: 'rgba(0, 0, 0, 0.05)',
        padding: '5px',
        borderRadius: '999px',
        display: 'flex',
        gap: '4px',
        marginBottom: '20px',
        border: '1px solid var(--border-subtle, rgba(0,0,0,0.04))',
      }}>
        <button
          type="button"
          onClick={() => {
            setIsLogin(true);
            setForgotMode(false);
            setError('');
            setSuccess('');
          }}
          style={{
            flex: 1,
            padding: '11px',
            borderRadius: '999px',
            border: 'none',
            fontSize: '13.5px',
            fontWeight: 800,
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            background: isLogin ? 'var(--surface, #FFFFFF)' : 'transparent',
            color: isLogin ? 'var(--text-primary, #121217)' : 'var(--text-muted, #8E8E93)',
            boxShadow: isLogin ? '0 3px 10px rgba(0,0,0,0.06)' : 'none',
          }}
        >
          Sign In
        </button>
        <button
          type="button"
          onClick={() => {
            setIsLogin(false);
            setForgotMode(false);
            setError('');
            setSuccess('');
          }}
          style={{
            flex: 1,
            padding: '11px',
            borderRadius: '999px',
            border: 'none',
            fontSize: '13.5px',
            fontWeight: 800,
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            background: !isLogin ? 'var(--surface, #FFFFFF)' : 'transparent',
            color: !isLogin ? 'var(--text-primary, #121217)' : 'var(--text-muted, #8E8E93)',
            boxShadow: !isLogin ? '0 3px 10px rgba(0,0,0,0.06)' : 'none',
          }}
        >
          Sign Up
        </button>
      </div>

      {/* Modern Branded Auth Card */}
      <div style={{
        background: 'var(--surface, #FFFFFF)',
        borderRadius: '26px',
        padding: '28px 22px 24px',
        border: '1.5px solid var(--border-light, #EAECEF)',
        boxShadow: '0 16px 40px rgba(0,0,0,0.05)',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Glow Accent */}
        <div style={{
          position: 'absolute',
          top: '-40px',
          right: '-40px',
          width: '100px',
          height: '100px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(52, 168, 83, 0.18) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />

        {/* Brand Icon Badge */}
        <div style={{
          width: '58px',
          height: '58px',
          borderRadius: '18px',
          background: 'linear-gradient(135deg, rgba(52, 168, 83, 0.15) 0%, rgba(45, 146, 73, 0.05) 100%)',
          border: '1.5px solid rgba(52, 168, 83, 0.25)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 16px',
          boxShadow: '0 8px 20px rgba(52, 168, 83, 0.18)',
        }}>
          <WifiIcon size={26} color="#34A853" />
        </div>

        <h2 style={{
          fontSize: '22px',
          fontWeight: 800,
          textAlign: 'center',
          color: 'var(--text-primary, #121217)',
          letterSpacing: '-0.4px',
          margin: '0 0 4px',
        }}>
          {forgotMode ? 'Reset Password' : isLogin ? 'Welcome Back' : `Join ${appName || 'My Collective Sub'}`}
        </h2>

        <p style={{
          fontSize: '13px',
          color: 'var(--text-muted, #8E8E93)',
          textAlign: 'center',
          margin: '0 0 20px',
          fontWeight: 500,
        }}>
          {forgotMode
            ? 'Enter your email to receive a password reset link'
            : isLogin
            ? 'Sign in to access your wallet & saved passes'
            : 'Register to manage your wallet and Wi-Fi passes'}
        </p>

        {error && (
          <div style={{
            padding: '12px 14px',
            background: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '14px',
            color: '#DC2626',
            fontSize: '12.5px',
            fontWeight: 600,
            marginBottom: '16px',
            textAlign: 'center',
            lineHeight: 1.4,
          }}>
            ⚠️ {error}
          </div>
        )}

        {success && (
          <div style={{
            padding: '12px 14px',
            background: 'rgba(52, 168, 83, 0.1)',
            border: '1px solid rgba(52, 168, 83, 0.35)',
            borderRadius: '14px',
            color: '#166534',
            fontSize: '12.5px',
            fontWeight: 600,
            marginBottom: '16px',
            textAlign: 'center',
            lineHeight: 1.4,
          }}>
            ✓ {success}
          </div>
        )}

        {forgotMode ? (
          <>
            <form onSubmit={handleForgotPassword}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#4A4A52', marginBottom: '6px' }}>
                  Email Address
                </label>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  background: 'var(--bg, #F4F5F8)',
                  border: '1.5px solid var(--border-light, #ECEEF2)',
                  borderRadius: '16px',
                  padding: '13px 15px',
                }}>
                  <MailIcon size={18} color="#8E8E93" />
                  <input
                    type="email"
                    placeholder="you@example.com"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    required
                    autoComplete="email"
                    autoFocus
                    style={{
                      flex: 1,
                      background: 'transparent',
                      border: 'none',
                      outline: 'none',
                      fontSize: '14px',
                      color: 'var(--text-primary, #121217)',
                      fontWeight: 600,
                    }}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                style={{
                  width: '100%',
                  padding: '15px',
                  background: loading ? '#9CA3AF' : 'linear-gradient(135deg, #34A853 0%, #1E8E3E 100%)',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '16px',
                  fontSize: '14.5px',
                  fontWeight: 800,
                  cursor: loading ? 'wait' : 'pointer',
                  boxShadow: '0 6px 20px rgba(52, 168, 83, 0.35)',
                  transition: 'all 0.2s ease',
                }}
              >
                {loading ? 'Sending Reset Link...' : 'Send Password Reset Email'}
              </button>
            </form>

            <div style={{ textAlign: 'center', marginTop: '16px' }}>
              <button
                type="button"
                onClick={() => {
                  setForgotMode(false);
                  setError('');
                  setSuccess('');
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#34A853',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                ← Back to Sign In
              </button>
            </div>
          </>
        ) : (
          <>
            <form onSubmit={handleSubmit}>
              {!isLogin && (
                <div style={{ marginBottom: '14px' }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#4A4A52', marginBottom: '6px' }}>
                    Full Name
                  </label>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    background: 'var(--bg, #F4F5F8)',
                    border: '1.5px solid var(--border-light, #ECEEF2)',
                    borderRadius: '16px',
                    padding: '13px 15px',
                  }}>
                    <UserIcon size={18} color="#8E8E93" />
                    <input
                      type="text"
                      placeholder="e.g. Muminul Hoque"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      required={!isLogin}
                      autoComplete="name"
                      style={{
                        flex: 1,
                        background: 'transparent',
                        border: 'none',
                        outline: 'none',
                        fontSize: '14px',
                        color: 'var(--text-primary, #121217)',
                        fontWeight: 600,
                      }}
                    />
                  </div>
                </div>
              )}

              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#4A4A52', marginBottom: '6px' }}>
                  Email Address
                </label>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  background: 'var(--bg, #F4F5F8)',
                  border: '1.5px solid var(--border-light, #ECEEF2)',
                  borderRadius: '16px',
                  padding: '13px 15px',
                }}>
                  <MailIcon size={18} color="#8E8E93" />
                  <input
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    style={{
                      flex: 1,
                      background: 'transparent',
                      border: 'none',
                      outline: 'none',
                      fontSize: '14px',
                      color: 'var(--text-primary, #121217)',
                      fontWeight: 600,
                    }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: '18px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#4A4A52', marginBottom: '6px' }}>
                  Password
                </label>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  background: 'var(--bg, #F4F5F8)',
                  border: '1.5px solid var(--border-light, #ECEEF2)',
                  borderRadius: '16px',
                  padding: '13px 15px',
                }}>
                  <LockIcon size={18} color="#8E8E93" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    autoComplete={isLogin ? 'current-password' : 'new-password'}
                    style={{
                      flex: 1,
                      background: 'transparent',
                      border: 'none',
                      outline: 'none',
                      fontSize: '14px',
                      color: 'var(--text-primary, #121217)',
                      fontWeight: 600,
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: 0,
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    {showPassword ? (
                      <EyeOffIcon size={18} color="#8E8E93" />
                    ) : (
                      <EyeIcon size={18} color="#8E8E93" />
                    )}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                style={{
                  width: '100%',
                  padding: '15px',
                  background: loading ? '#9CA3AF' : 'linear-gradient(135deg, #34A853 0%, #1E8E3E 100%)',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '16px',
                  fontSize: '14.5px',
                  fontWeight: 800,
                  cursor: loading ? 'wait' : 'pointer',
                  boxShadow: '0 6px 20px rgba(52, 168, 83, 0.35)',
                  transition: 'all 0.2s ease',
                }}
              >
                {loading ? (
                  <span>Authenticating...</span>
                ) : (
                  <span>{isLogin ? 'Sign In to Account' : 'Create Free Account'}</span>
                )}
              </button>

              {isLogin && (
                <div style={{ textAlign: 'center', marginTop: '14px' }}>
                  <button
                    type="button"
                    onClick={() => {
                      setForgotMode(true);
                      setResetEmail(email);
                      setError('');
                      setSuccess('');
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#34A853',
                      fontSize: '13px',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    Forgot Password?
                  </button>
                </div>
              )}
            </form>

            {/* Wholesale / Reseller Agent Banner */}
            <div style={{
              marginTop: '22px',
              padding: '14px 16px',
              borderRadius: '16px',
              background: 'linear-gradient(135deg, rgba(52, 168, 83, 0.08) 0%, rgba(52, 168, 83, 0.02) 100%)',
              border: '1px solid rgba(52, 168, 83, 0.2)',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: '12.5px', color: 'var(--text-primary, #121217)', fontWeight: 800 }}>
                💼 Want to sell Wi-Fi passes &amp; earn profit?
              </div>
              <p style={{ fontSize: '11.5px', color: 'var(--text-muted, #8E8E93)', margin: '4px 0 10px' }}>
                Join our wholesale Agent Network with discounted bulk rates.
              </p>
              <Link
                href="/reseller/signup"
                style={{
                  display: 'inline-block',
                  padding: '7px 16px',
                  borderRadius: '999px',
                  background: '#34A853',
                  color: '#FFFFFF',
                  fontSize: '11.5px',
                  fontWeight: 800,
                  textDecoration: 'none',
                  boxShadow: '0 4px 12px rgba(52, 168, 83, 0.25)',
                }}
              >
                Apply as a Reseller Agent →
              </Link>
            </div>

            {/* Switch Mode Toggle */}
            <div style={{
              textAlign: 'center',
              marginTop: '18px',
              fontSize: '13px',
              color: 'var(--text-muted, #8E8E93)',
            }}>
              {isLogin ? "Don't have an account yet? " : 'Already registered? '}
              <span
                style={{
                  color: '#34A853',
                  fontWeight: 800,
                  cursor: 'pointer',
                  textDecoration: 'underline',
                }}
                onClick={() => {
                  setIsLogin(!isLogin);
                  setError('');
                  setSuccess('');
                }}
              >
                {isLogin ? 'Sign Up' : 'Sign In'}
              </span>
            </div>

            {/* Frictionless Continue as Guest */}
            <div style={{ textAlign: 'center', marginTop: '14px' }}>
              <button
                type="button"
                onClick={() => {
                  localStorage.setItem('asuk_guest_session', 'true');
                  router.push('/');
                }}
                style={{
                  fontSize: '13px',
                  color: 'var(--text-muted, #8E8E93)',
                  fontWeight: 600,
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '6px 12px',
                }}
              >
                ← Continue as Guest
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
