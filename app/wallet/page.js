'use client';

import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '../context/AuthContext';
import { useBranding } from '../context/BrandingContext';
import { supabase } from '../../lib/supabase';
import { createPaymentHeaders } from '../../lib/payment-client.js';
import {
  getOrCreateGuestToken,
  getCachedGuestBalance,
  setCachedGuestBalance,
  savePendingGuestTopup,
  getPendingGuestTopups,
  removePendingGuestTopup,
} from '../../lib/guest-vouchers.js';
import BottomNav from '../components/BottomNav';
import ReceiptModal from '../components/ReceiptModal';
import WalletTransferModal from '../components/WalletTransferModal';
import ReferralCard from '../components/ReferralCard';
import {
  ChevronLeftIcon,
  MoreVerticalIcon,
  ArrowUpRightIcon,
  ArrowDownLeftIcon,
  CheckIcon,
  WifiIcon,
  WalletIcon,
  ShieldIcon,
  TicketIcon,
  RefreshIcon,
  PlusIcon,
  ReceiptIcon,
  FileTextIcon,
} from '../components/Icons';


const PRESET_AMOUNTS = ['100', '250', '500', '1000', '2000', '5000'];

function WalletContent() {
  const router = useRouter();
  const { user, profile, wallet, refreshWallet, loading: authLoading } = useAuth();
  const { appName } = useBranding();
  const topupProcessingRef = useRef(false);
  const monnifyCheckoutOpenRef = useRef(false);
  const topupRedirectHandledRef = useRef('');
  const [pendingMonnifyTopup, setPendingMonnifyTopup] = useState(null);
  useEffect(() => {
    try { setPendingMonnifyTopup(user?.id ? JSON.parse(sessionStorage.getItem(`monnify-topup-${user.id}`) || 'null') : null); } catch {}
  }, [user?.id]);
  const depositFormRef = useRef(null);
  const searchParams = useSearchParams();

  // Handle redirect back from Flutterwave (mobile / USSD payments don't fire the JS callback)
  useEffect(() => {
    const depositParam = searchParams?.get('deposit');
    const redirectStatus = (searchParams?.get('status') || '').toLowerCase();
    const redirectTxId = searchParams?.get('transaction_id') || searchParams?.get('transactionId') || '';
    const redirectTxRef = searchParams?.get('tx_ref') || '';
    const redirectAmount = Number(searchParams?.get('amount') || 0);

    if (depositParam !== 'success' && !redirectTxId) return;
    if (authLoading) return;

    const redirectKey = `${user?.id || 'guest'}:${redirectTxRef}:${redirectTxId}:${depositParam}:${redirectStatus}`;
    if (topupRedirectHandledRef.current === redirectKey) return;
    topupRedirectHandledRef.current = redirectKey;

    if (typeof window !== 'undefined') {
      window.history.replaceState({}, '', '/wallet');
    }

    if (redirectStatus === 'cancelled' || redirectStatus === 'failed') {
      showToast('Payment was cancelled or failed');
      return;
    }

    if (!user) {
      const gToken = getOrCreateGuestToken();
      const pendingList = getPendingGuestTopups();
      const matchedPending = pendingList.find((p) => p.tx_ref === redirectTxRef) || pendingList[0];
      const resolvedAmount = redirectAmount > 0 ? redirectAmount : Number(matchedPending?.amount || 0);
      const resolvedRef = redirectTxRef || matchedPending?.tx_ref || '';
      if (gToken && (redirectTxId || resolvedRef)) {
        finalizeGuestTopup(resolvedAmount, resolvedRef, redirectTxId, gToken, matchedPending?.email || '');
        return;
      }
      fetchGuestWalletData();
      return;
    }

    if (redirectTxId) {
      let savedTopup = null;
      try {
        savedTopup = JSON.parse(sessionStorage.getItem(`flw-topup-${user.id}`) || 'null');
      } catch {}
      const resolvedAmount = redirectAmount > 0 ? redirectAmount : Number(savedTopup?.amount || 0);
      const resolvedRef = redirectTxRef || savedTopup?.tx_ref;

      if (resolvedAmount > 0) {
        finalizeTopup(resolvedAmount, resolvedRef, redirectTxId, 'flutterwave');
        return;
      }
    }

    showToast('✅ Payment received! Your balance will update shortly.');
    refreshWallet();
    fetchTransactions();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, user, authLoading]);

  const [activeSegment, setActiveSegment] = useState('deposits'); // 'deposits' | 'vouchers'
  const [amountVal, setAmountVal] = useState('500');
  const [guestEmail, setGuestEmail] = useState('');
  const [guestBalance, setGuestBalance] = useState(0);
  const [pendingGuestTopups, setPendingGuestTopups] = useState([]);
  const [toast, setToast] = useState('');
  const [loading, setLoading] = useState(false);
  const [flwConfig, setFlwConfig] = useState({ publicKey: '', enabled: false });
  const [monnifyConfig, setMonnifyConfig] = useState({ apiKey: '', contractCode: '', enabled: false, isTest: true });
  const [activeGateway, setActiveGateway] = useState('flutterwave');
  const [selectedReceiptTx, setSelectedReceiptTx] = useState(null);
  const [showStatementModal, setShowStatementModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);

  // Real transaction data
  const [transactions, setTransactions] = useState([]);
  const [weeklyData, setWeeklyData] = useState([]);
  const [totalDeposits, setTotalDeposits] = useState(0);
  const [totalSpending, setTotalSpending] = useState(0);

  // Real balance — registered user wallet OR server-backed Guest Wallet
  const walletBalance = user ? (wallet ? parseFloat(wallet.balance) : 0) : guestBalance;
  const displayName = profile?.full_name || (user?.email ? user.email.split('@')[0] : 'Guest');

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3500);
  };

  const formatPrice = (amount) =>
    '₦' +
    Number(amount || 0).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const formatDate = (isoString) => {
    if (!isoString) return '';
    const d = new Date(isoString);
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Fetch payment gateway public settings
  useEffect(() => {
    fetch('/api/settings/public')
      .then((r) => r.json())
      .then((d) => {
        if (d.flutterwave) setFlwConfig(d.flutterwave);
        if (d.monnify) setMonnifyConfig(d.monnify);
        if (d.activeGateway) setActiveGateway(d.activeGateway);
      })
      .catch(() => {});
  }, []);

  const computeTxSummary = useCallback((txList) => {
    const list = Array.isArray(txList) ? txList : [];
    setTransactions(list);
    let deposits = 0;
    let spending = 0;
    list.forEach((tx) => {
      if (tx.type === 'wallet_topup') deposits += Number(tx.amount);
      else if (tx.type === 'voucher_purchase') spending += Number(tx.amount);
    });
    setTotalDeposits(deposits);
    setTotalSpending(spending);

    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const today = new Date();
    const weekData = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dayName = days[d.getDay()];
      const dateStr = d.toISOString().split('T')[0];
      const dayTotal = list
        .filter((tx) => new Date(tx.created_at).toISOString().split('T')[0] === dateStr)
        .reduce((sum, tx) => sum + Number(tx.amount), 0);
      weekData.push({ day: dayName, amount: dayTotal, isToday: i === 0 });
    }
    const maxAmt = Math.max(...weekData.map((w) => w.amount), 100);
    weekData.forEach((w) => {
      w.height = Math.max(12, Math.round((w.amount / maxAmt) * 100));
    });
    setWeeklyData(weekData);
  }, []);

  const fetchGuestWalletData = useCallback(async (checkPending = true) => {
    if (user || typeof window === 'undefined') return;
    const token = getOrCreateGuestToken();
    if (!token) return;
    setGuestBalance(getCachedGuestBalance());
    const pending = getPendingGuestTopups();
    setPendingGuestTopups(pending);

    if (checkPending && pending.length > 0) {
      for (const p of pending) {
        try {
          const checkRes = await fetch('/api/guest-wallet/topup', {
            method: 'POST',
            headers: createPaymentHeaders(),
            body: JSON.stringify({
              guest_token: token,
              flw_ref: p.tx_ref,
              amount: p.amount,
              email: p.email || guestEmail,
              check_only: true,
            }),
          });
          if (checkRes.ok) {
            const checkData = await checkRes.json();
            if (checkData?.status === 'fulfilled') {
              removePendingGuestTopup(p.tx_ref);
              const bal = Number(checkData.balance || 0);
              setGuestBalance(bal);
              setCachedGuestBalance(bal);
              setPendingGuestTopups(getPendingGuestTopups());
              showToast(`✅ ${formatPrice(checkData.amount || p.amount)} added to your Guest Wallet!`);
            }
          }
        } catch {}
      }
    }

    try {
      const res = await fetch(`/api/guest-wallet?guest_token=${encodeURIComponent(token)}`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        const bal = Number(data.balance || 0);
        setGuestBalance(bal);
        setCachedGuestBalance(bal);
        if (data.email && !guestEmail) setGuestEmail(data.email);
        computeTxSummary(data.transactions || []);
      }
    } catch {}
  }, [user, guestEmail, computeTxSummary]);

  // Fetch real transaction data for charts and history
  const fetchTransactions = useCallback(async () => {
    if (!user) {
      await fetchGuestWalletData(false);
      return;
    }
    try {
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'successful')
        .order('created_at', { ascending: false })
        .limit(100);

      if (!error && data) {
        computeTxSummary(data);
      }
    } catch (err) {
      console.error('Error fetching transactions:', err);
    }
  }, [user, fetchGuestWalletData, computeTxSummary]);

  useEffect(() => {
    if (authLoading) return;
    if (user) {
      fetchTransactions();
    } else {
      fetchGuestWalletData(true);
    }
  }, [authLoading, user, fetchTransactions, fetchGuestWalletData]);

  // Auto-refresh Guest Wallet when returning from OPay / PalmPay / Moniepoint
  useEffect(() => {
    if (user || authLoading) return;
    const handleResume = () => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') {
        fetchGuestWalletData(true);
      }
    };
    window.addEventListener('focus', handleResume);
    window.addEventListener('visibilitychange', handleResume);
    const interval = setInterval(() => {
      if (getPendingGuestTopups().length > 0) {
        fetchGuestWalletData(true);
      }
    }, 8000);
    return () => {
      window.removeEventListener('focus', handleResume);
      window.removeEventListener('visibilitychange', handleResume);
      clearInterval(interval);
    };
  }, [user, authLoading, fetchGuestWalletData]);

  // Realtime transaction updates (reflects webhook deposits instantly)
  useEffect(() => {
    if (!user?.id) return;

    const txChannel = supabase
      .channel(`realtime-tx-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'transactions',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          fetchTransactions();
          refreshWallet();
        }
      )
      .on('broadcast', { event: 'wallet_update' }, (msg) => {
        fetchTransactions();
        refreshWallet();
        if (Number(msg?.payload?.amount) > 0) {
          showToast(`₦${Number(msg.payload.amount).toLocaleString()} deposit credited to your balance!`);
        }
      })
      .subscribe();

    const handleVisibility = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        fetchTransactions();
        refreshWallet();
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('visibilitychange', handleVisibility);
      window.addEventListener('focus', handleVisibility);
    }

    return () => {
      supabase.removeChannel(txChannel);
      if (typeof window !== 'undefined') {
        window.removeEventListener('visibilitychange', handleVisibility);
        window.removeEventListener('focus', handleVisibility);
      }
    };
  }, [user?.id, fetchTransactions, refreshWallet]);

  const depositNum = Math.max(0, parseFloat(amountVal) || 0);
  const projectedBalance = walletBalance + depositNum;
  const passFlwFeePreview = !!(flwConfig?.passFeeToCustomer || flwConfig?.pass_fee_to_customer);
  const flwFeePctPreview = Math.min(10, Math.max(0, Number(flwConfig?.feePercent ?? flwConfig?.fee_percent ?? 2.15) || 0));
  const flwDepositFeePreview =
    activeGateway === 'flutterwave' && passFlwFeePreview && flwFeePctPreview > 0 && depositNum > 0
      ? Math.min(Math.ceil(depositNum / (1 - flwFeePctPreview / 100)) - depositNum, 2150)
      : 0;
  const flwDepositTotalPreview = depositNum + flwDepositFeePreview;

  const finalizeGuestTopup = async (amount, ref, transactionId, guestTokenOverride = '', emailOverride = '') => {
    if (topupProcessingRef.current) return;
    topupProcessingRef.current = true;
    setLoading(true);
    try {
      const gToken = guestTokenOverride || getOrCreateGuestToken();
      const res = await fetch('/api/guest-wallet/topup', {
        method: 'POST',
        headers: createPaymentHeaders(),
        body: JSON.stringify({
          guest_token: gToken,
          amount,
          flw_ref: ref,
          transaction_id: transactionId || undefined,
          email: emailOverride || guestEmail || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Guest deposit verification failed');
      removePendingGuestTopup(ref);
      const bal = Number(data.balance || 0);
      setGuestBalance(bal);
      setCachedGuestBalance(bal);
      setPendingGuestTopups(getPendingGuestTopups());
      await fetchGuestWalletData(false);
      showToast(`✅ ${formatPrice(data.amount || amount)} added to your Guest Wallet!`);
      setActiveSegment('deposits');
    } catch (err) {
      showToast('Note: ' + err.message);
    } finally {
      setLoading(false);
      topupProcessingRef.current = false;
    }
  };

  const handleFundWallet = async () => {
    if (loading || topupProcessingRef.current || monnifyCheckoutOpenRef.current) return;

    if (!depositNum || depositNum < 100) {
      showToast('Minimum deposit amount is ₦100');
      return;
    }

    // ── GUEST WALLET FLUTTERWAVE TOP-UP (No sign-in required!) ──
    if (!user) {
      if (!flwConfig.publicKey || typeof window.FlutterwaveCheckout === 'undefined') {
        showToast('Payment gateway is loading or not configured. Please try again in a moment.');
        return;
      }
      const gToken = typeof getOrCreateGuestToken === 'function' ? getOrCreateGuestToken() : '';
      if (!gToken) {
        showToast('Unable to initialize device wallet storage. Please allow browser storage or sign in.');
        return;
      }
      const cleanGuestEmail = (guestEmail || '').trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail.trim())
        ? guestEmail.trim()
        : `guest_${gToken.slice(3, 11)}@mycollectivesub.si`;
      const txRef = `FLW_GTOPUP_${Date.now()}_${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
      const redirectOrigin = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : '';
      let guestFlwStarted = false;
      const passFlwFee = !!(flwConfig?.passFeeToCustomer || flwConfig?.pass_fee_to_customer);
      const flwFeePct = Math.min(10, Math.max(0, Number(flwConfig?.feePercent ?? flwConfig?.fee_percent ?? 2.15) || 0));
      const flwGatewayFee = passFlwFee && flwFeePct > 0 && depositNum > 0
        ? Math.min(Math.ceil(depositNum / (1 - flwFeePct / 100)) - depositNum, 2150)
        : 0;
      const flwCheckoutAmount = depositNum + flwGatewayFee;

      if (typeof savePendingGuestTopup === 'function') {
        savePendingGuestTopup({ tx_ref: txRef, amount: depositNum, guest_token: gToken, email: cleanGuestEmail });
        if (typeof setPendingGuestTopups === 'function') setPendingGuestTopups(getPendingGuestTopups());
      }

      window.FlutterwaveCheckout({
        public_key: flwConfig.publicKey,
        tx_ref: txRef,
        amount: flwCheckoutAmount,
        currency: 'NGN',
        payment_options: 'card,banktransfer,ussd',
        redirect_url: `${redirectOrigin}/wallet?deposit=success&amount=${encodeURIComponent(depositNum)}&guest=1`,
        customer: {
          email: cleanGuestEmail,
          phone_number: '08000000000',
          name: 'Guest Customer',
        },
        meta: {
          type: 'guest_wallet_topup',
          guest_token: gToken,
          intended_amount: depositNum,
          gateway_fee: flwGatewayFee,
        },
        customizations: {
          title: `${appName} Guest Wallet`,
          description: `Credit ${formatPrice(depositNum)} to your Guest Wi-Fi Wallet`,
        },
        callback: async function (response) {
          if (guestFlwStarted) return;
          guestFlwStarted = true;
          if (response.status === 'successful' || response.status === 'completed') {
            const transactionId = response.transaction_id || response.id;
            await finalizeGuestTopup(depositNum, txRef, transactionId, gToken, cleanGuestEmail);
          } else {
            showToast('Payment was cancelled or failed');
          }
        },
        onclose: function () {
          if (!guestFlwStarted && typeof fetchGuestWalletData === 'function') {
            fetchGuestWalletData(true);
          }
        },
      });
      return;
    }

    // ── MONNIFY TOP-UP ──
    if (activeGateway === 'monnify') {
      if (!monnifyConfig.apiKey || !monnifyConfig.contractCode || typeof window.MonnifySDK === 'undefined') {
        showToast('Monnify payment gateway is loading or not configured. Please try again.');
        return;
      }

      monnifyCheckoutOpenRef.current = true;
      setLoading(true);
      let order;
      let verificationStarted = false;
      try {
        const { data } = await supabase.auth.getSession();
        const initRes = await fetch('/api/payments/monnify/initialize', {
          method: 'POST', headers: createPaymentHeaders(data?.session?.access_token),
          body: JSON.stringify({ purpose: 'wallet_topup', amount: depositNum }),
        });
        order = await initRes.json();
        if (!initRes.ok) throw new Error(order.error || 'Unable to start checkout');
        setPendingMonnifyTopup(order);
        try { sessionStorage.setItem(`monnify-topup-${user.id}`, JSON.stringify(order)); } catch {}
      } catch (error) {
        showToast(error.message);
        setLoading(false);
        monnifyCheckoutOpenRef.current = false;
        return;
      }
      const paymentRef = order.reference;

      try { window.MonnifySDK.initialize({
        amount: order.amount,
        currency: 'NGN',
        reference: paymentRef,
        customerFullName: displayName,
        customerEmail: user?.email || 'customer@mycollectivesub.com',
        apiKey: order.apiKey,
        contractCode: order.contractCode,
        paymentDescription: `${appName} Wallet Deposit - ${formatPrice(depositNum)}`,
        metadata: {
          user_id: user.id,
          type: 'wallet_topup',
        },
        onLoadStart: () => {},
        onLoadComplete: () => {},
        onComplete: async function (response) {
          if (verificationStarted) return;
          verificationStarted = true;
          if (response.paymentStatus === 'PAID' || response.status === 'SUCCESS') {
            const transactionId = response.transactionReference || paymentRef;
            await finalizeTopup(order.amount, paymentRef, transactionId, 'monnify');
          } else {
            showToast('Payment was cancelled or failed');
            setLoading(false);
            monnifyCheckoutOpenRef.current = false;
          }
        },
        onClose: function () {
          if (!verificationStarted) {
            setLoading(false);
            monnifyCheckoutOpenRef.current = false;
          }
        },
      }); } catch (error) {
        showToast(error.message || 'Unable to open Monnify checkout');
        setLoading(false);
        monnifyCheckoutOpenRef.current = false;
      }
      return;
    }

    // ── FLUTTERWAVE TOP-UP ──
    if (!flwConfig.publicKey || typeof window.FlutterwaveCheckout === 'undefined') {
      showToast('Payment gateway is loading or not configured. Please try again in a moment.');
      return;
    }

    const txRef = `FLW_TOPUP_${Date.now()}_${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    const redirectOrigin = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : '';
    let flwVerificationStarted = false;
    const passFlwFee = !!(flwConfig?.passFeeToCustomer || flwConfig?.pass_fee_to_customer);
    const flwFeePct = Math.min(10, Math.max(0, Number(flwConfig?.feePercent ?? flwConfig?.fee_percent ?? 2.15) || 0));
    const flwGatewayFee = passFlwFee && flwFeePct > 0 && depositNum > 0
      ? Math.min(Math.ceil(depositNum / (1 - flwFeePct / 100)) - depositNum, 2150)
      : 0;
    const flwCheckoutAmount = depositNum + flwGatewayFee;
    try {
      sessionStorage.setItem(`flw-topup-${user.id}`, JSON.stringify({ amount: depositNum, tx_ref: txRef }));
    } catch {}

    window.FlutterwaveCheckout({
      public_key: flwConfig.publicKey,
      tx_ref: txRef,
      amount: flwCheckoutAmount,
      currency: 'NGN',
      payment_options: 'card,banktransfer,ussd',
      // redirect_url: Flutterwave redirects here on mobile/USSD instead of firing the JS callback.
      // The wallet page verifies transaction_id via finalizeTopup and refreshes balance.
      redirect_url: `${redirectOrigin}/wallet?deposit=success&amount=${encodeURIComponent(depositNum)}`,
      customer: {
        email: user?.email || 'customer@mycollectivesub.com',
        phone_number: user?.user_metadata?.phone || '08000000000',
        name: displayName,
      },
      meta: {
        user_id: user.id,
        type: 'wallet_topup',
        intended_amount: depositNum,
        gateway_fee: flwGatewayFee,
      },
      customizations: {
        title: `${appName} Wallet Deposit`,
        description: `Credit ${formatPrice(depositNum)} to your Wi-Fi wallet`,
      },
      callback: async function (response) {
        if (flwVerificationStarted) return;
        flwVerificationStarted = true;
        if (response.status === 'successful' || response.status === 'completed') {
          const transactionId = response.transaction_id || response.id;
          await finalizeTopup(depositNum, txRef, transactionId, 'flutterwave');
        } else {
          showToast('Payment was cancelled or failed');
        }
      },
      onclose: function () {
        // User closed modal
      },
    });
  };

  const finalizeTopup = async (amount, ref, transactionId, gw) => {
    if (topupProcessingRef.current) return;
    topupProcessingRef.current = true;
    setLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      const headers = createPaymentHeaders(token);
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch('/api/wallet/topup', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          amount,
          user_id: user.id,
          flw_ref: ref,
          transaction_id: transactionId,
          gateway: gw || activeGateway,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Top-up failed');
      if (gw === 'monnify') {
        setPendingMonnifyTopup(null);
        try { sessionStorage.removeItem(`monnify-topup-${user.id}`); } catch {}
      } else if (gw === 'flutterwave') {
        try { sessionStorage.removeItem(`flw-topup-${user.id}`); } catch {}
      }

      await refreshWallet();
      await fetchTransactions();
      showToast(`✅ ${formatPrice(amount)} added to your wallet!`);
      setActiveSegment('deposits');
    } catch (err) {
      showToast('Error: ' + err.message);
    } finally {
      setLoading(false);
      topupProcessingRef.current = false;
      monnifyCheckoutOpenRef.current = false;
    }
  };

  // Filtered transactions for tabs
  const depositList = transactions.filter(t => t.type === 'wallet_topup');
  const voucherList = transactions.filter(t => t.type === 'voucher_purchase');

  const scrollToDeposit = () => {
    depositFormRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="app-shell">
      {pendingMonnifyTopup && user && (
        <div className="checkout-security-notice">
          <p>A Monnify deposit is saved. Check it before depositing again.</p>
          <button className="btn btn-primary" disabled={loading} onClick={() => finalizeTopup(pendingMonnifyTopup.amount, pendingMonnifyTopup.reference, pendingMonnifyTopup.reference, 'monnify')}>Check saved deposit</button>
        </div>
      )}
      {/* ── Screen Topbar ── */}
      <div className="screen-topbar">
        <button
          className="circle-icon-btn"
          onClick={() => router.back()}
          aria-label="Back"
        >
          <ChevronLeftIcon size={20} color="#121217" />
        </button>

        <h1 className="screen-title">Wallet &amp; Top-Up</h1>

        <button
          className="circle-icon-btn"
          onClick={() => {
            if (user) {
              refreshWallet();
              fetchTransactions();
            } else {
              fetchGuestWalletData(true);
            }
            showToast('Wallet refreshed');
          }}
          aria-label="Refresh"
          title="Refresh Balance"
        >
          <RefreshIcon size={18} color="#121217" />
        </button>
      </div>

      {/* ── Guest Wallet Active Banner (if not logged in) ── */}
      {!user && !authLoading && (
        <div
          style={{
            background: '#EFF6FF',
            border: '1.5px solid #BFDBFE',
            borderRadius: '18px',
            padding: '14px 16px',
            marginBottom: '18px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <WalletIcon size={18} color="#035EC8" />
              <span style={{ fontWeight: 800, fontSize: '13.5px', color: '#062B66' }}>
                Guest Wallet Active (No Sign-In Needed)
              </span>
            </div>
            <button
              type="button"
              onClick={() => router.push('/auth')}
              style={{
                background: '#FFFFFF',
                color: '#035EC8',
                border: '1px solid #BFDBFE',
                borderRadius: '999px',
                padding: '5px 12px',
                fontSize: '11.5px',
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              Sign In (Optional) →
            </button>
          </div>
          <p style={{ margin: 0, fontSize: '12.5px', color: '#1E3A8A', lineHeight: 1.45 }}>
            Deposit funds directly below via OPay, PalmPay, Moniepoint, Card, or USSD. Your Guest Wallet balance is saved securely on this device so you can buy Wi-Fi passes anytime!
          </p>
        </div>
      )}

      {/* ── Pending Guest Deposit Recovery Banner ── */}
      {!user && pendingGuestTopups.length > 0 && (
        <div style={{ marginBottom: '18px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {pendingGuestTopups.map((p) => (
            <div
              key={p.tx_ref}
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
                  ⏳ Pending Guest Deposit ({formatPrice(p.amount)})
                </div>
                <div style={{ fontSize: '11px', color: '#B45309', marginTop: '2px' }}>
                  Already sent transfer from OPay, PalmPay, or Moniepoint? Tap Verify to credit your balance now.
                </div>
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => finalizeGuestTopup(p.amount, p.tx_ref, '', p.guest_token, p.email)}
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
                  {loading ? 'Checking...' : '✓ Verify & Credit'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    removePendingGuestTopup(p.tx_ref);
                    setPendingGuestTopups(getPendingGuestTopups());
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
        </div>
      )}

      {/* ── Hero Balance Card ── */}
      <div
        style={{
          background: 'linear-gradient(135deg, #18181B 0%, #09090B 100%)',
          color: '#FFFFFF',
          borderRadius: '24px',
          padding: '24px 20px',
          marginBottom: '22px',
          boxShadow: '0 10px 30px rgba(0, 0, 0, 0.25)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
          <div>
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'rgba(255, 255, 255, 0.65)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Available Balance
            </span>
            <div style={{ fontSize: '36px', fontWeight: 900, marginTop: '4px', letterSpacing: '-0.5px' }}>
              {formatPrice(walletBalance)}
            </div>
          </div>
          <div
            style={{
              background: 'rgba(255, 255, 255, 0.12)',
              borderRadius: '12px',
              padding: '6px 12px',
              fontSize: '11px',
              fontWeight: 700,
              color: '#E0F2FE',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <ShieldIcon size={14} color="#60A5FA" />
            Active Wallet
          </div>
        </div>

        {/* Quick Balance Actions */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginTop: '12px' }}>
          <button
            onClick={scrollToDeposit}
            style={{
              background: '#FFFFFF',
              color: '#121217',
              border: 'none',
              borderRadius: '14px',
              padding: '12px 6px',
              fontSize: '12px',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(255, 255, 255, 0.15)',
            }}
          >
            <PlusIcon size={14} color="#121217" />
            Deposit
          </button>
          <button
            onClick={() => {
              if (!user) {
                showToast('Sign in to transfer balance to another member');
                return;
              }
              setShowTransferModal(true);
            }}
            style={{
              background: 'rgba(255, 255, 255, 0.18)',
              color: '#FFFFFF',
              border: '1px solid rgba(255, 255, 255, 0.25)',
              borderRadius: '14px',
              padding: '12px 6px',
              fontSize: '12px',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              cursor: 'pointer',
            }}
          >
            <span>💸</span>
            Transfer
          </button>
          <button
            onClick={() => router.push('/packages')}
            style={{
              background: 'rgba(255, 255, 255, 0.12)',
              color: '#FFFFFF',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: '14px',
              padding: '12px 6px',
              fontSize: '12px',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              cursor: 'pointer',
            }}
          >
            <WifiIcon size={14} color="#FFFFFF" />
            Buy Pass
          </button>
        </div>

        {/* Stats strip */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            borderTop: '1px solid rgba(255, 255, 255, 0.12)',
            marginTop: '18px',
            paddingTop: '14px',
            fontSize: '12px',
          }}
        >
          <div>
            <span style={{ color: 'rgba(255, 255, 255, 0.6)' }}>Total Deposited</span>
            <div style={{ fontWeight: 700, marginTop: '2px' }}>{formatPrice(totalDeposits)}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <span style={{ color: 'rgba(255, 255, 255, 0.6)' }}>Total Spent</span>
            <div style={{ fontWeight: 700, marginTop: '2px' }}>{formatPrice(totalSpending)}</div>
          </div>
        </div>
      </div>

      {/* ── Referral & Rewards Card (Feature 4.4) ── */}
      <ReferralCard />

      {/* ── Dedicated Deposit / Top-Up Card ── */}
      <div
        ref={depositFormRef}
        style={{
          background: '#FFFFFF',
          borderRadius: '24px',
          padding: '24px 20px',
          marginBottom: '24px',
          boxShadow: 'var(--shadow-card, 0 4px 20px rgba(0,0,0,0.06))',
          border: '1px solid #EDEDF2',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div>
            <h2 style={{ fontSize: '17px', fontWeight: 800, margin: 0, color: '#141417' }}>Deposit Funds</h2>
            <p style={{ fontSize: '12px', color: '#71717A', margin: '2px 0 0' }}>
              Instant wallet credit via Card, Bank Transfer, or USSD
            </p>
          </div>
          <div
            style={{
              background: '#F4F4F5',
              padding: '6px 10px',
              borderRadius: '10px',
              fontSize: '11px',
              fontWeight: 700,
              color: '#52525B',
            }}
          >
            NGN (₦)
          </div>
        </div>

        {/* Optional Receipt Email for Guests */}
        {!user && (
          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#52525B', marginBottom: '6px' }}>
              Receipt Email (optional)
            </label>
            <input
              type="email"
              value={guestEmail}
              onChange={(e) => setGuestEmail(e.target.value)}
              placeholder="Optional: your@email.com for payment receipt"
              style={{
                width: '100%',
                background: '#F4F4F5',
                borderRadius: '14px',
                padding: '11px 14px',
                border: '1.5px solid #E4E4E7',
                fontSize: '13.5px',
                fontWeight: 600,
                color: '#18181B',
                outline: 'none',
              }}
            />
          </div>
        )}

        {/* Amount Input Block */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#52525B', marginBottom: '6px' }}>
            Amount to Deposit (Min ₦100)
          </label>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              background: '#F4F4F5',
              borderRadius: '16px',
              padding: '4px 14px',
              border: '1.5px solid #E4E4E7',
              transition: 'border 0.2s ease',
            }}
          >
            <span style={{ fontSize: '24px', fontWeight: 800, color: '#18181B', marginRight: '6px' }}>₦</span>
            <input
              type="number"
              min="100"
              step="50"
              value={amountVal}
              onChange={(e) => setAmountVal(e.target.value)}
              placeholder="1000"
              style={{
                width: '100%',
                border: 'none',
                background: 'transparent',
                fontSize: '24px',
                fontWeight: 800,
                color: '#18181B',
                outline: 'none',
              }}
            />
          </div>
        </div>

        {/* Preset Amount Chips */}
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '18px' }}>
          {PRESET_AMOUNTS.map((amt) => {
            const isSelected = amountVal === amt;
            return (
              <button
                key={amt}
                type="button"
                onClick={() => setAmountVal(amt)}
                style={{
                  flex: '1 1 calc(20% - 6px)',
                  minWidth: '60px',
                  padding: '9px 4px',
                  borderRadius: '12px',
                  background: isSelected ? 'var(--dock-bg, #141417)' : '#F4F4F5',
                  color: isSelected ? '#FFFFFF' : '#3F3F46',
                  fontSize: '12px',
                  fontWeight: 700,
                  border: isSelected ? '1px solid #141417' : '1px solid #E4E4E7',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  textAlign: 'center',
                }}
              >
                ₦{Number(amt).toLocaleString()}
              </button>
            );
          })}
        </div>

        {/* Live Calculation Preview */}
        <div
          style={{
            background: '#FAFAFA',
            borderRadius: '14px',
            padding: '12px 14px',
            marginBottom: '18px',
            border: '1px dashed #D4D4D8',
            fontSize: '13px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', color: '#71717A' }}>
            <span>Current Balance:</span>
            <span>{formatPrice(walletBalance)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', color: '#035EC8', fontWeight: 700 }}>
            <span>+ Wallet Credit:</span>
            <span>{formatPrice(depositNum)}</span>
          </div>
          {flwDepositFeePreview > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', color: '#71717A', fontSize: '12px' }}>
              <span>Flutterwave Gateway Fee:</span>
              <span>+{formatPrice(flwDepositFeePreview)} (Total: {formatPrice(flwDepositTotalPreview)})</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #E4E4E7', paddingTop: '6px', fontWeight: 800, color: '#18181B' }}>
            <span>Projected Balance:</span>
            <span>{formatPrice(projectedBalance)}</span>
          </div>
        </div>

        {/* Payment Methods Info */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '18px',
            fontSize: '12px',
            color: '#71717A',
          }}
        >
          <ShieldIcon size={16} color="#0088FF" />
          <span>Secured by Flutterwave • Supports Cards, Bank Transfer &amp; USSD</span>
        </div>

        {/* Primary Deposit Button */}
        <button
          className="transfer-submit-btn"
          onClick={handleFundWallet}
          disabled={loading || depositNum < 100}
          style={{
            width: '100%',
            padding: '15px',
            borderRadius: '16px',
            background: loading || depositNum < 100 ? '#A1A1AA' : 'var(--dock-bg, #141417)',
            color: '#FFFFFF',
            fontSize: '15px',
            fontWeight: 800,
            border: 'none',
            cursor: loading || depositNum < 100 ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s ease',
            boxShadow: '0 4px 14px rgba(0, 0, 0, 0.15)',
          }}
        >
          {loading ? 'Opening Gateway...' : `Deposit ${formatPrice(depositNum)} via Flutterwave`}
        </button>
      </div>

      {/* ── Activity & Spending Visualizer ── */}
      <div className="chart-card" style={{ marginBottom: '22px' }}>
        <div className="chart-card-header">
          <div className="chart-header-info">
            <span className="chart-tag">Weekly Activity</span>
            <div className="chart-main-val">
              {activeSegment === 'deposits' ? formatPrice(totalDeposits) : formatPrice(totalSpending)}
            </div>
          </div>
          <span style={{ fontSize: '11px', color: '#71717A', fontWeight: 600 }}>Last 7 Days</span>
        </div>

        {/* Bar Chart Columns — Real Data */}
        <div className="chart-bars-wrap">
          {weeklyData.length > 0 ? weeklyData.map((w) => (
            <div key={w.day} className="bar-col">
              <div className="bar-track">
                {w.isToday && w.amount > 0 && (
                  <div className="bar-tooltip">{formatPrice(w.amount)}</div>
                )}
                <div
                  className={`bar-fill ${w.isToday ? 'active' : ''}`}
                  style={{ height: `${w.height}%` }}
                />
              </div>
              <span className="bar-day">{w.day}</span>
            </div>
          )) : (
            ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
              <div key={day} className="bar-col">
                <div className="bar-track">
                  <div className="bar-fill" style={{ height: '12%' }} />
                </div>
                <span className="bar-day">{day}</span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── Transaction History Section with Segment Toggle ── */}
      <div style={{ marginBottom: '90px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
          <div>
            <h2 style={{ fontSize: '16px', fontWeight: 800, margin: 0, color: '#141417' }}>
              Activity Ledger
            </h2>
            <span style={{ fontSize: '11px', color: '#71717A' }}>
              {depositList.length} Deposits • {voucherList.length} Purchases
            </span>
          </div>

          <button
            type="button"
            onClick={() => setShowStatementModal(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: '#FFFFFF',
              border: '1.5px solid #E4E4E7',
              padding: '6px 14px',
              borderRadius: '999px',
              fontSize: '12px',
              fontWeight: 700,
              color: '#18181B',
              cursor: 'pointer',
              boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
              transition: 'all 0.15s ease',
            }}
            title="Download full account transaction statement (PDF & Image)"
          >
            <FileTextIcon size={14} color="#7C3AED" />
            <span>Statement</span>
          </button>
        </div>


        {/* Capsule Segmented Toggle */}
        <div className="capsule-toggle-wrap" style={{ marginBottom: '16px' }}>
          <div className="capsule-toggle">
            <button
              type="button"
              className={`capsule-btn ${activeSegment === 'deposits' ? 'active' : ''}`}
              onClick={() => setActiveSegment('deposits')}
            >
              Deposits ({depositList.length})
            </button>
            <button
              type="button"
              className={`capsule-btn ${activeSegment === 'vouchers' ? 'active' : ''}`}
              onClick={() => setActiveSegment('vouchers')}
            >
              Pass Purchases ({voucherList.length})
            </button>
          </div>
        </div>

        {/* Segment 1: Deposits History */}
        {activeSegment === 'deposits' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {depositList.length === 0 ? (
              <div
                style={{
                  background: '#FFFFFF',
                  borderRadius: '18px',
                  padding: '36px 20px',
                  textAlign: 'center',
                  border: '1px dashed #E4E4E7',
                }}
              >
                <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#F4F4F5', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                  <ArrowDownLeftIcon size={24} color="#71717A" />
                </div>
                <div style={{ fontWeight: 700, fontSize: '14px', color: '#18181B' }}>No Deposits Yet</div>
                <p style={{ fontSize: '12px', color: '#71717A', margin: '4px 0 16px' }}>
                  Use the deposit form above to add funds to your wallet.
                </p>
                <button
                  type="button"
                  onClick={scrollToDeposit}
                  style={{
                    background: 'var(--dock-bg, #141417)',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: '12px',
                    padding: '8px 16px',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Deposit Now
                </button>
              </div>
            ) : (
              depositList.map((tx) => (
                <div
                  key={tx.id}
                  style={{
                    background: '#FFFFFF',
                    borderRadius: '16px',
                    padding: '14px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                    border: '1px solid #F4F4F5',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div
                      style={{
                        width: '38px',
                        height: '38px',
                        borderRadius: '12px',
                        background: '#EFF6FF',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <ArrowDownLeftIcon size={20} color="#0088FF" />
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '14px', color: '#18181B' }}>
                        Wallet Deposit
                      </div>
                      <div style={{ fontSize: '11px', color: '#71717A', marginTop: '2px' }}>
                        {formatDate(tx.created_at)}
                      </div>
                      {tx.flw_ref && (
                        <div style={{ fontSize: '10px', color: '#A1A1AA', marginTop: '1px', fontFamily: 'monospace' }}>
                          Ref: {tx.flw_ref.length > 20 ? tx.flw_ref.substring(0, 20) + '…' : tx.flw_ref}
                        </div>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 800, fontSize: '14px', color: '#035EC8' }}>
                        +{formatPrice(tx.amount)}
                      </div>
                      <span
                        style={{
                          fontSize: '10px',
                          fontWeight: 700,
                          background: '#E6F2FF',
                          color: '#035EC8',
                          padding: '2px 8px',
                          borderRadius: '8px',
                          display: 'inline-block',
                          marginTop: '2px',
                        }}
                      >
                        Successful
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => setSelectedReceiptTx(tx)}
                      style={{
                        padding: '6px 10px',
                        borderRadius: '10px',
                        background: '#F4F4F5',
                        border: '1px solid #E4E4E7',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        fontSize: '11px',
                        fontWeight: 700,
                        color: '#52525B',
                      }}
                      title="Download or Print Receipt (PDF & Image)"
                    >
                      <ReceiptIcon size={14} color="#71717A" />
                      <span>Receipt</span>
                    </button>
                  </div>

                </div>
              ))
            )}
          </div>
        )}

        {/* Segment 2: Voucher Purchases History */}
        {activeSegment === 'vouchers' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {voucherList.length === 0 ? (
              <div
                style={{
                  background: '#FFFFFF',
                  borderRadius: '18px',
                  padding: '36px 20px',
                  textAlign: 'center',
                  border: '1px dashed #E4E4E7',
                }}
              >
                <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#F4F4F5', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                  <WifiIcon size={24} color="#71717A" />
                </div>
                <div style={{ fontWeight: 700, fontSize: '14px', color: '#18181B' }}>No Wi-Fi Passes Purchased</div>
                <p style={{ fontSize: '12px', color: '#71717A', margin: '4px 0 16px' }}>
                  You haven&apos;t purchased any passes with your wallet balance yet.
                </p>
                <button
                  type="button"
                  onClick={() => router.push('/packages')}
                  style={{
                    background: 'var(--dock-bg, #141417)',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: '12px',
                    padding: '8px 16px',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Browse Wi-Fi Passes
                </button>
              </div>
            ) : (
              voucherList.map((tx) => (
                <div
                  key={tx.id}
                  style={{
                    background: '#FFFFFF',
                    borderRadius: '16px',
                    padding: '14px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                    border: '1px solid #F4F4F5',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div
                      style={{
                        width: '38px',
                        height: '38px',
                        borderRadius: '12px',
                        background: 'rgba(124, 58, 237, 0.12)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <TicketIcon size={20} color="#7C3AED" />
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '14px', color: '#18181B' }}>
                        {tx.metadata?.plan_name || 'Wi-Fi Pass'}
                      </div>
                      <div style={{ fontSize: '11px', color: '#71717A', marginTop: '2px' }}>
                        {tx.metadata?.voucher_code ? `PIN: ${tx.metadata.voucher_code} • ` : ''}
                        {formatDate(tx.created_at)}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 800, fontSize: '14px', color: '#18181B' }}>
                        -{formatPrice(tx.amount)}
                      </div>
                      <span
                        style={{
                          fontSize: '10px',
                          fontWeight: 700,
                          background: '#EDE9FE',
                          color: '#6D28D9',
                          padding: '2px 8px',
                          borderRadius: '8px',
                          display: 'inline-block',
                          marginTop: '2px',
                        }}
                      >
                        Voucher
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => setSelectedReceiptTx(tx)}
                      style={{
                        padding: '6px 10px',
                        borderRadius: '10px',
                        background: '#F4F4F5',
                        border: '1px solid #E4E4E7',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        fontSize: '11px',
                        fontWeight: 700,
                        color: '#52525B',
                      }}
                      title="Download or Print Receipt (PDF & Image)"
                    >
                      <ReceiptIcon size={14} color="#71717A" />
                      <span>Receipt</span>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Transaction Receipt Modal */}
      {selectedReceiptTx && (
        <ReceiptModal
          isOpen={!!selectedReceiptTx}
          onClose={() => setSelectedReceiptTx(null)}
          type="transaction"
          data={{
            ...selectedReceiptTx,
            user_email: user?.email,
          }}
          brandName={appName}
        />
      )}

      {/* Full Account Statement Modal */}
      {showStatementModal && (
        <ReceiptModal
          isOpen={showStatementModal}
          onClose={() => setShowStatementModal(false)}
          type="statement"
          data={{
            brandName: appName,
            userEmail: user?.email,
            walletBalance: wallet ? parseFloat(wallet.balance) : 0,
            totalDeposits: depositList.reduce((acc, t) => acc + (parseFloat(t.amount) || 0), 0),
            totalSpent: voucherList.reduce((acc, t) => acc + (parseFloat(t.amount) || 0), 0),
            transactions: transactions,
          }}
          brandName={appName}
        />
      )}

      {/* Wallet-to-Wallet Transfer Modal (Feature 4.6) */}
      <WalletTransferModal
        isOpen={showTransferModal}
        onClose={() => setShowTransferModal(false)}
        walletBalance={walletBalance}
        onSuccess={() => {
          refreshWallet();
          fetchTransactions();
          showToast('Transfer completed successfully!');
        }}
      />

      <BottomNav />
      {toast && <div className="toast show">{toast}</div>}
    </div>
  );
}

export default function WalletPage() {
  return (
    <Suspense fallback={
      <div className="app-shell" style={{ textAlign: 'center', padding: '100px 20px', color: '#8E8E93' }}>
        Loading Wallet...
      </div>
    }>
      <WalletContent />
    </Suspense>
  );
}
