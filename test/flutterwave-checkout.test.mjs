import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { z } from 'zod';

const root = new URL('../', import.meta.url);
const read = file => fs.readFile(new URL(file, root), 'utf8');

async function loadModule(file, dependencies, exports) {
  const source = (await read(file))
    .replace(/^import[\s\S]*?;\s*$/gm, '')
    .replace(/^export\s*\{[\s\S]*?\};\s*$/gm, '')
    .replace(/^export /gm, '');
  return vm.runInNewContext(`(function(){${source}\nreturn {${exports.join(',')}};})()`, {
    URL,
    AbortSignal,
    ...dependencies,
    z,
    process: { env: {} },
    console: { log() {}, warn() {}, error() {} },
  }, { filename: file });
}

async function extractHandler(file, name, nextMarker, context) {
  const source = await read(file);
  const start = source.indexOf(`const ${name} = async () => {`);
  const end = source.indexOf(nextMarker, start);
  assert.ok(start >= 0 && end > start, `handler ${name} not found in ${file}`);
  const expression = source.slice(start + `const ${name} = `.length, end).trim().replace(/;$/, '');
  return vm.runInNewContext(`(${expression})`, {
    console: { log() {}, warn() {}, error() {} },
    ...context,
  });
}

test('Flutterwave CheckoutModal callback sends CSRF header and onclose cannot clobber verification', async () => {
  const { createPaymentHeaders } = await loadModule('lib/payment-client.js', {
    document: { cookie: 'csrf_token=admin%2Dcsrf%2Dtoken' },
  }, ['createPaymentHeaders']);

  let flwOpts;
  let verifyHeaders;
  let releaseVerify;
  const verifyGate = new Promise(resolve => { releaseVerify = resolve; });
  const states = [];
  const savedOrders = {};
  const mutex = { current: false };

  const handler = await extractHandler(
    'app/components/CheckoutModal.js',
    'handleCardPayment',
    '  return (\n    <div className="checkout-overlay"',
    {
      processingRef: mutex,
      routerStatus: { loaded: false },
      canPurchase: true,
      activeGateway: 'flutterwave',
      flwConfig: { publicKey: 'FLWPUBK-test', enabled: true },
      monnifyConfig: {},
      pendingMonnifyOrder: null,
      user: { id: '00000000-0000-4000-8000-000000000001', email: 'buyer@example.com' },
      guestEmail: '',
      guestPhone: '08012345678',
      autoRenew: false,
      appName: 'My Collective Sub',
      plan: { id: 'plan-1hr', name: '1 Hour Fast Pass', price: 100, duration: '1h' },
      price: 100,
      setStep: s => states.push(s),
      setLoadingText() {},
      setErrorMessage() {},
      setVoucherData() {},
      onSuccess() {},
      createPaymentHeaders,
      sessionStorage: {
        setItem: (k, v) => { savedOrders[k] = v; },
        removeItem: k => { delete savedOrders[k]; },
      },
      localStorage: { setItem() {} },
      Event,
      supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'user-jwt' } } }) } },
      window: {
        location: { origin: 'https://www.mycollectivesub.si' },
        FlutterwaveCheckout: opts => { flwOpts = opts; },
        dispatchEvent() {},
      },
      fetch: async (_url, init) => {
        verifyHeaders = init.headers;
        await verifyGate;
        return Response.json({ success: true, voucher_code: '54321', plan: '1 Hour Fast Pass' });
      },
    }
  );

  await handler();
  assert.ok(flwOpts, 'FlutterwaveCheckout should be invoked');
  assert.equal(flwOpts.redirect_url, 'https://www.mycollectivesub.si/vouchers/status?payment=success&plan_id=plan-1hr');
  assert.equal(flwOpts.meta.plan_id, 'plan-1hr');
  assert.ok(savedOrders[`flw-order-${flwOpts.tx_ref}`], 'Order details persisted for redirect recovery');

  // Start callback verification, then simulate popup closing mid-flight
  const pendingCallback = flwOpts.callback({
    status: 'successful',
    transaction_id: 987654,
    tx_ref: flwOpts.tx_ref,
  });
  await new Promise(resolve => setImmediate(resolve));
  flwOpts.onclose();

  assert.equal(mutex.current, true, 'processing mutex must remain locked while verifying');
  assert.deepEqual(states, ['processing'], 'onclose must not reset step back to review');

  releaseVerify();
  await pendingCallback;

  assert.equal(verifyHeaders['X-CSRF-Token'], 'admin-csrf-token');
  assert.equal(verifyHeaders.Authorization, 'Bearer user-jwt');
  assert.equal(states[states.length - 1], 'success');
  assert.equal(savedOrders[`flw-order-${flwOpts.tx_ref}`], undefined, 'Saved order cleared after success');
});

test('verify-payment resolves Flutterwave redirect without price/plan_id via verified meta and keeps custom duration', async () => {
  const schemas = await loadModule('lib/schemas.js', {}, ['verifyPaymentSchema', 'validateBody']);
  const insertedVouchers = [];
  const routerCalls = [];

  const createQuery = (table) => {
    const filters = [];
    const q = {
      select() { return q; },
      eq(k, v) { filters.push([k, v]); return q; },
      insert(row) {
        if (table === 'vouchers') insertedVouchers.push(row);
        return {
          select() { return { single: async () => ({ data: { id: 'tx-1' } }) }; },
          then: resolve => resolve({ data: row, error: null }),
        };
      },
      async maybeSingle() {
        if (table === 'vouchers') {
          const txRef = filters.find(([k]) => k === 'tx_ref')?.[1];
          const found = insertedVouchers.find(v => v.tx_ref === txRef);
          return { data: found || null };
        }
        if (table === 'app_settings') {
          const key = filters.find(([k]) => k === 'key')?.[1];
          if (key === 'payment_gateway') return { data: { value: { active: 'flutterwave' } } };
          if (key === 'flutterwave') return { data: { value: { secret_key: 'FLWSECK-test', enabled: true } } };
          if (key === 'hotspot_settings') return { data: { value: { expiry_mode: 'elapsed', sharing_enabled: false } } };
        }
        if (table === 'plans') {
          const id = filters.find(([k]) => k === 'id')?.[1];
          if (id === 'plan-2days') {
            return { data: { id: 'plan-2days', name: '2 Days Pass', price: 250, duration: '48h', devices: 1, upload_speed: '12M', download_speed: '12M' } };
          }
        }
        return { data: null };
      },
    };
    return q;
  };

  const { POST } = await loadModule('app/api/purchase/verify-payment/route.js', {
    ...schemas,
    NextResponse: { json: (body, init) => Response.json(body, init) },
    supabaseAdmin: { from: createQuery, rpc: async () => ({ data: [] }) },
    fulfillMonnifyPayment: async () => ({}),
    validateUserAuth: async () => null,
    isMikroTikConfigured: async () => true,
    calculateExpiresAt: () => new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
    createOrQueueHotspotUser: async opts => {
      routerCalls.push(opts);
      return { routerId: '*99', profile: opts.profile };
    },
    generateUniqueCode: async () => '77889',
    logger: { financial() {}, getCorrelationId: () => 'cid-1' },
    sendVoucherSms: async () => {},
    fetch: async () => Response.json({
      status: 'success',
      data: {
        status: 'successful',
        amount: 250,
        currency: 'NGN',
        tx_ref: 'FLW_REDIRECT_TEST',
        customer: { email: 'mobile@example.com', phone_number: '08099999999' },
        meta: { plan_id: 'plan-2days', user_id: '00000000-0000-4000-8000-000000000009' },
      },
    }),
  }, ['POST']);

  // Redirect payload omits price & plan_id (derived via verified Flutterwave meta)
  const res1 = await POST(new Request('https://test.local/api/purchase/verify-payment', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      transaction_id: '11223344',
      tx_ref: 'FLW_REDIRECT_TEST',
      gateway: 'flutterwave',
    }),
  }));
  assert.equal(res1.status, 200);
  const body1 = await res1.json();
  assert.equal(body1.voucher_code, '77889');
  assert.equal(routerCalls[0].limitUptime, '48h');
  assert.equal(insertedVouchers[0].duration, '48h');
  assert.equal(insertedVouchers[0].user_id, '00000000-0000-4000-8000-000000000009');

  // Re-submitting same tx_ref stays idempotent
  const res2 = await POST(new Request('https://test.local/api/purchase/verify-payment', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      transaction_id: '11223344',
      tx_ref: 'FLW_REDIRECT_TEST',
      gateway: 'flutterwave',
    }),
  }));
  const body2 = await res2.json();
  assert.equal(res2.status, 200);
  assert.equal(body2.idempotent, true);
  assert.equal(body2.voucher_code, '77889');
  assert.equal(routerCalls.length, 1);
});

test('recoverMonnifyPurchase uses createPaymentHeaders and wallet topup includes Flutterwave amount redirect param', async () => {
  const checkoutSrc = await read('app/components/CheckoutModal.js');
  const recoverBlock = checkoutSrc.slice(
    checkoutSrc.indexOf('const recoverMonnifyPurchase'),
    checkoutSrc.indexOf('const handleCardPayment')
  );
  assert.ok(recoverBlock.includes('createPaymentHeaders('), 'recoverMonnifyPurchase must include CSRF headers');

  const walletSrc = await read('app/wallet/page.js');
  assert.ok(walletSrc.includes('/wallet?deposit=success&amount='), 'wallet redirect_url must carry amount parameter');
  assert.ok(walletSrc.includes('finalizeTopup(resolvedAmount, resolvedRef, redirectTxId'), 'wallet redirect return must verify transaction_id');
});

test('guest voucher storage persists multiple passes across refresh and enables dashboard guest session', async () => {
  const localMap = new Map();
  const sessionMap = new Map();
  let dispatchedEvents = 0;

  const mockStorage = (map) => ({
    getItem: k => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: k => map.delete(k),
  });

  const helper = await loadModule('lib/guest-vouchers.js', {
    localStorage: mockStorage(localMap),
    sessionStorage: mockStorage(sessionMap),
    Event: class MockEvent { constructor(type) { this.type = type; } },
    window: { dispatchEvent() { dispatchedEvents++; } },
  }, ['enableGuestSession', 'hasGuestOrVoucherSession', 'saveGuestVoucher', 'getGuestVouchers']);

  assert.equal(helper.hasGuestOrVoucherSession(), false);

  helper.saveGuestVoucher({ code: '11111', plan: '1GB', duration: '24h', price: 100, purchasedAt: 1000 });
  helper.saveGuestVoucher({ code: '22222', plan: '12 Hours', duration: '12h', price: 250, purchasedAt: 2000 });
  helper.saveGuestVoucher({ code: '11111', plan: '1GB Updated', duration: '24h', price: 100, purchasedAt: 3000 });

  assert.equal(helper.hasGuestOrVoucherSession(), true);
  assert.equal(localMap.get('asuk_guest_session'), 'true');
  assert.equal(sessionMap.get('asuk_dashboard_active'), '1');

  const list = helper.getGuestVouchers();
  assert.equal(list.length, 2, 'duplicate voucher codes should be deduplicated');
  assert.equal(list[0].code, '11111');
  assert.equal(list[1].code, '22222');
  assert.equal(dispatchedEvents, 3);
});

test('dashboard, vouchers, landing, and auth screens preserve guest persistence and Navy-Azure branding', async () => {
  const homeSrc = await read('app/page.js');
  assert.ok(homeSrc.includes('hasGuestOrVoucherSession'), 'Dashboard must preserve session when guest/voucher exists');
  assert.ok(homeSrc.includes("router.push('/vouchers')"), 'Dashboard My Passes button must open /vouchers directly');

  const vouchersSrc = await read('app/vouchers/page.js');
  assert.ok(!vouchersSrc.includes("router.replace('/auth')"), 'Vouchers page must stay accessible to guests');
  assert.ok(vouchersSrc.includes('getGuestVouchers'), 'Vouchers page must load guest vouchers from localStorage');

  const landingSrc = await read('app/landing/page.js');
  assert.ok(landingSrc.includes('Continue as Guest (Dashboard)'), 'Landing page must display prominent Guest Dashboard button');

  const authSrc = await read('app/auth/page.js');
  const loginSrc = await read('app/login/page.js');
  const resetSrc = await read('app/auth/reset-password/page.js');
  assert.ok(authSrc.includes('Continue as Guest — Open Dashboard'), 'Auth page must highlight Guest Dashboard button');

  for (const [name, src] of [['auth', authSrc], ['login', loginSrc], ['reset-password', resetSrc]]) {
    for (const green of ['#34A853', '#1E8E3E', '#2D9249', '#16A34A', '#15803D', '#DCFCE7', '#BBF7D0', '#10B981']) {
      assert.equal(src.includes(green), false, `${name} should not contain legacy green token ${green}`);
    }
  }
});

test('Flutterwave fee deductions (₦100 plan -> ₦97 net after ₦3 charge) allow both guest and logged-in voucher purchase while blocking real underpayment', async () => {
  const schemas = await loadModule('lib/schemas.js', {}, ['verifyPaymentSchema', 'validateBody']);
  const feeHelper = await loadModule('lib/flutterwave-fees.js', {}, [
    'calculateFlutterwaveCheckoutAmounts',
    'resolveFlutterwavePaidAmount',
    'resolveFlutterwaveWalletCredit',
  ]);

  // 1. Unit check on fee helper across all real-world Flutterwave payload shapes
  assert.equal(feeHelper.resolveFlutterwavePaidAmount({ amount: 97, charged_amount: 100, app_fee: 3, amount_settled: 97 }), 100);
  assert.equal(feeHelper.resolveFlutterwavePaidAmount({ amount: 97, charged_amount: 97, app_fee: 3 }), 100);
  assert.equal(feeHelper.resolveFlutterwavePaidAmount({ amount: 97.85, charged_amount: 97.85, app_fee: 2, amount_settled: 97.85 }), 100);
  assert.equal(feeHelper.resolveFlutterwavePaidAmount({ amount: 100, charged_amount: 100, app_fee: 2, amount_settled: 97.85 }), 100);
  assert.equal(feeHelper.resolveFlutterwavePaidAmount({ amount: 50, charged_amount: 50, app_fee: 1, amount_settled: 48.92 }), 50);

  const grossUp = feeHelper.calculateFlutterwaveCheckoutAmounts(100, { passFeeToCustomer: true, feePercent: 2.15 });
  assert.equal(grossUp.intendedAmount, 100);
  assert.equal(grossUp.fee, 3);
  assert.equal(grossUp.totalAmount, 103);

  // 2. End-to-end verify-payment route test for Guest & Logged-in user with ₦3 Flutterwave fee deduction
  let flwMockPayload = null;
  const insertedVouchers = [];
  const insertedTransactions = [];

  const createQuery = (table) => {
    const filters = [];
    const q = {
      select() { return q; },
      eq(k, v) { filters.push([k, v]); return q; },
      insert(row) {
        if (table === 'vouchers') insertedVouchers.push(row);
        if (table === 'transactions') insertedTransactions.push(row);
        return {
          select() { return { single: async () => ({ data: { id: `tx-${insertedTransactions.length}` } }) }; },
          then: resolve => resolve({ data: row, error: null }),
        };
      },
      async maybeSingle() {
        if (table === 'vouchers') {
          const txRef = filters.find(([k]) => k === 'tx_ref')?.[1];
          return { data: insertedVouchers.find(v => v.tx_ref === txRef) || null };
        }
        if (table === 'app_settings') {
          const key = filters.find(([k]) => k === 'key')?.[1];
          if (key === 'payment_gateway') return { data: { value: { active: 'flutterwave' } } };
          if (key === 'flutterwave') return { data: { value: { secret_key: 'FLWSECK-test', enabled: true } } };
          if (key === 'hotspot_settings') return { data: { value: { expiry_mode: 'elapsed', sharing_enabled: false } } };
        }
        if (table === 'plans') {
          const id = filters.find(([k]) => k === 'id')?.[1];
          if (id === 'plan-1hr') {
            return { data: { id: 'plan-1hr', name: '3 Hour Fast Pass', price: 100, duration: '3h', devices: 1, upload_speed: '10M', download_speed: '10M' } };
          }
        }
        return { data: null };
      },
    };
    return q;
  };

  let codeCounter = 10000;
  const { POST } = await loadModule('app/api/purchase/verify-payment/route.js', {
    ...schemas,
    NextResponse: { json: (body, init) => Response.json(body, init) },
    supabaseAdmin: { from: createQuery, rpc: async () => ({ data: [] }) },
    fulfillMonnifyPayment: async () => ({}),
    validateUserAuth: async () => null,
    isMikroTikConfigured: async () => true,
    calculateExpiresAt: () => new Date().toISOString(),
    createOrQueueHotspotUser: async opts => ({ routerId: '*10', profile: opts.profile }),
    generateUniqueCode: async () => String(++codeCounter),
    logger: { financial() {}, getCorrelationId: () => 'cid-fee' },
    sendVoucherSms: async () => {},
    fetch: async () => Response.json({ status: 'success', data: flwMockPayload }),
  }, ['POST']);

  // Case A: Guest pays ₦100, Flutterwave removes ₦3 fee leaving amount=97
  flwMockPayload = {
    status: 'successful',
    amount: 97,
    charged_amount: 97,
    app_fee: 3,
    amount_settled: 97,
    currency: 'NGN',
    tx_ref: 'FLW_GUEST_100_FEE3',
    customer: { email: 'guest@example.com' },
    meta: { plan_id: 'plan-1hr' },
  };
  const guestRes = await POST(new Request('https://test.local/api/purchase/verify-payment', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ transaction_id: '9001', tx_ref: 'FLW_GUEST_100_FEE3', plan_id: 'plan-1hr', price: 100 }),
  }));
  assert.equal(guestRes.status, 200, 'Guest ₦100 purchase with ₦3 Flutterwave fee deduction must succeed');
  const guestBody = await guestRes.json();
  assert.equal(guestBody.voucher_code, '10001');
  assert.equal(insertedVouchers[0].user_id, null);
  assert.equal(insertedVouchers[0].price, 100);

  // Case B: Logged-in user pays for ₦100 plan, Flutterwave reports 2% + 7.5% VAT (₦2.15) fee-netted (97.85)
  const loggedInUserId = '00000000-0000-4000-8000-000000000077';
  flwMockPayload = {
    status: 'successful',
    amount: 97.85,
    charged_amount: 97.85,
    app_fee: 2,
    amount_settled: 97.85,
    currency: 'NGN',
    tx_ref: 'FLW_USER_100_VAT',
    customer: { email: 'member@example.com' },
    meta: { plan_id: 'plan-1hr', user_id: loggedInUserId },
  };
  const userRes = await POST(new Request('https://test.local/api/purchase/verify-payment', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ transaction_id: '9002', tx_ref: 'FLW_USER_100_VAT', plan_id: 'plan-1hr', user_id: loggedInUserId }),
  }));
  assert.equal(userRes.status, 200, 'Logged-in ₦100 purchase with ₦2.15 Flutterwave fee+VAT deduction must succeed');
  assert.equal(insertedVouchers[1].user_id, loggedInUserId);

  // Case B2: Pre-netted ₦97 payload where Flutterwave also took app_fee from 97 (amount: 97, amount_settled: 95.06)
  flwMockPayload = {
    status: 'successful',
    amount: 97,
    charged_amount: 97,
    app_fee: 1.94,
    amount_settled: 95.06,
    currency: 'NGN',
    tx_ref: 'FLW_GUEST_97_NETTED',
    customer: { email: 'guest2@example.com' },
    meta: { plan_id: 'plan-1hr' },
  };
  const preNettedRes = await POST(new Request('https://test.local/api/purchase/verify-payment', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ transaction_id: '90025', tx_ref: 'FLW_GUEST_97_NETTED', plan_id: 'plan-1hr' }),
  }));
  assert.equal(preNettedRes.status, 200, '₦97 payment after ₦3 charge must succeed even when amount_settled < amount');

  // Case C: Real underpayment (attacker pays ₦50 or ₦90 for ₦100 plan) MUST still be rejected with 400
  flwMockPayload = {
    status: 'successful',
    amount: 90,
    charged_amount: 90,
    app_fee: 1.8,
    amount_settled: 88.06,
    currency: 'NGN',
    tx_ref: 'FLW_UNDERPAY_50',
    customer: { email: 'attacker@example.com' },
    meta: { plan_id: 'plan-1hr' },
  };
  const underpayRes = await POST(new Request('https://test.local/api/purchase/verify-payment', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ transaction_id: '9003', tx_ref: 'FLW_UNDERPAY_50', plan_id: 'plan-1hr' }),
  }));
  assert.equal(underpayRes.status, 400, 'Genuine underpayment must be rejected');
});

test('Logged-in user wallet top-up and Flutterwave webhook credit full ₦100 (not ₦97) when Flutterwave deducts ₦3 fee', async () => {
  const schemas = await loadModule('lib/schemas.js', {}, ['walletTopupSchema', 'validateBody']);
  const userId = '00000000-0000-4000-8000-000000000055';
  let walletBalance = 0;
  const txRows = [];
  let flwVerifyPayload = null;

  const supabaseMock = {
    from(table) {
      const filters = [];
      const q = {
        select() { return q; },
        eq(k, v) { filters.push([k, v]); return q; },
        insert() { return Promise.resolve({ data: null, error: null }); },
        upsert(row) {
          const existing = txRows.find(t => t.flw_ref === row.flw_ref);
          const inserted = existing ? null : { id: `tx-${txRows.length + 1}`, ...row };
          if (inserted) txRows.push(inserted);
          return {
            select() {
              return {
                maybeSingle: async () => ({ data: inserted, error: null }),
              };
            },
          };
        },
        async maybeSingle() {
          if (table === 'transactions') {
            const ref = filters.find(([k]) => k === 'flw_ref')?.[1];
            return { data: txRows.find(t => t.flw_ref === ref) || null };
          }
          if (table === 'wallets') {
            return { data: { balance: walletBalance } };
          }
          if (table === 'profiles') {
            const id = filters.find(([k]) => k === 'id')?.[1];
            return { data: id === userId ? { id: userId } : null };
          }
          if (table === 'app_settings') {
            const key = filters.find(([k]) => k === 'key')?.[1];
            if (key === 'payment_gateway') return { data: { value: { active: 'flutterwave' } } };
            if (key === 'flutterwave') return { data: { value: { secret_key: 'FLWSECK-test', webhook_secret: 'wh-secret', enabled: true } } };
          }
          return { data: null };
        },
      };
      return q;
    },
    async rpc(fn, args) {
      if (fn === 'adjust_wallet_balance') {
        if (args.p_operation === 'add') walletBalance += Number(args.p_amount);
        if (args.p_operation === 'deduct') {
          if (walletBalance < Number(args.p_amount)) return { data: -1, error: null };
          walletBalance -= Number(args.p_amount);
        }
        return { data: walletBalance, error: null };
      }
      return { data: null, error: null };
    },
  };

  const topupRoute = await loadModule('app/api/wallet/topup/route.js', {
    ...schemas,
    NextResponse: { json: (body, init) => Response.json(body, init) },
    supabaseAdmin: supabaseMock,
    broadcastWalletUpdate: async () => {},
    fulfillMonnifyPayment: async () => ({}),
    validateUserAuth: async () => ({ id: userId, email: 'user@example.com' }),
    userUnauthorizedResponse: msg => Response.json({ error: msg }, { status: 401 }),
    logger: { financial() {}, getCorrelationId: () => 'cid-topup' },
    fetch: async () => Response.json({ status: 'success', data: flwVerifyPayload }),
  }, ['POST']);

  const webhookRoute = await loadModule('app/api/webhook/flutterwave/route.js', {
    NextResponse: { json: (body, init) => Response.json(body, init) },
    supabaseAdmin: supabaseMock,
    broadcastWalletUpdate: async () => {},
    rateLimitWebhook: () => null,
    fetch: async () => Response.json({ status: 'success', data: flwVerifyPayload }),
  }, ['POST']);

  // 1. Logged-in user deposits ₦100 via /api/wallet/topup; Flutterwave removes ₦3 fee (amount: 97)
  flwVerifyPayload = {
    id: 7001,
    tx_ref: 'FLW_TOPUP_100_FEE3',
    status: 'successful',
    currency: 'NGN',
    amount: 97,
    charged_amount: 97,
    app_fee: 3,
    amount_settled: 97,
    meta: { user_id: userId, type: 'wallet_topup', intended_amount: 100 },
  };
  const topupRes = await topupRoute.POST(new Request('https://test.local/api/wallet/topup', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ amount: 100, user_id: userId, flw_ref: 'FLW_TOPUP_100_FEE3', transaction_id: 7001, gateway: 'flutterwave' }),
  }));
  assert.equal(topupRes.status, 200, 'Wallet top-up of ₦100 with ₦3 Flutterwave fee deduction must succeed');
  const topupJson = await topupRes.json();
  assert.equal(topupJson.amount, 100);
  assert.equal(walletBalance, 100, 'Wallet must be credited full ₦100 (not ₦97) so user can buy ₦100 plan');

  // 2. Webhook arrives for a second ₦100 deposit where Flutterwave reports amount: 97, app_fee: 3
  flwVerifyPayload = {
    id: 7002,
    tx_ref: 'FLW_TOPUP_WEBHOOK_100',
    status: 'successful',
    currency: 'NGN',
    amount: 97,
    charged_amount: 97,
    app_fee: 3,
    amount_settled: 97,
    meta: { user_id: userId, type: 'wallet_topup', intended_amount: 100 },
  };
  const whRes = await webhookRoute.POST(new Request('https://test.local/api/webhook/flutterwave', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'verif-hash': 'wh-secret' },
    body: JSON.stringify({ data: flwVerifyPayload }),
  }));
  assert.equal(whRes.status, 200);
  const whJson = await whRes.json();
  assert.equal(whJson.amount, 100, 'Webhook must credit full ₦100 (not ₦97)');
  assert.equal(walletBalance, 200);

  // 3. Webhook with fee pass-through (customer paid ₦103 for a ₦100 deposit) credits exact ₦100 (no over-credit)
  flwVerifyPayload = {
    id: 7003,
    tx_ref: 'FLW_TOPUP_PASSTHROUGH_103',
    status: 'successful',
    currency: 'NGN',
    amount: 103,
    charged_amount: 103,
    app_fee: 2.21,
    amount_settled: 100.79,
    meta: { user_id: userId, type: 'wallet_topup', intended_amount: 100, gateway_fee: 3 },
  };
  const whPassRes = await webhookRoute.POST(new Request('https://test.local/api/webhook/flutterwave', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'verif-hash': 'wh-secret' },
    body: JSON.stringify({ data: flwVerifyPayload }),
  }));
  const whPassJson = await whPassRes.json();
  assert.equal(whPassJson.amount, 100, 'Webhook must credit intended ₦100 deposit, not over-credit the ₦3 gateway fee');
  assert.equal(walletBalance, 300);

  // 4. Default scheduler rules must be disabled by default so weekends/nights never cause unconfigured price mismatches
  const scheduler = await loadModule('lib/scheduler.js', {}, ['DEFAULT_SCHEDULER_RULES', 'getActiveRules', 'applyScheduledPricing']);
  assert.equal(scheduler.DEFAULT_SCHEDULER_RULES.every(r => r.enabled === false), true, 'Default scheduler rules must be opt-in (disabled by default)');
  assert.equal(scheduler.getActiveRules(scheduler.DEFAULT_SCHEDULER_RULES, new Date('2026-11-21T10:00:00Z')).length, 0, 'No default discount rule may activate on Saturday');
  assert.equal(scheduler.applyScheduledPricing({ price: 100 }).effective_price, 100, 'Default scheduled pricing must keep full ₦100 price');
});

test('Guest localStorage pending order recovery and server-side webhook voucher fulfillment work without browser callback', async () => {
  const localMap = new Map();
  const sessionMap = new Map();
  const mockStorage = (map) => ({
    getItem: k => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: k => map.delete(k),
  });

  // 1. Verify pending order persistence across app-switch / refresh in localStorage
  const guestLib = await loadModule('lib/guest-vouchers.js', {
    localStorage: mockStorage(localMap),
    sessionStorage: mockStorage(sessionMap),
    Event: class MockEvent { constructor(type) { this.type = type; } },
    window: { dispatchEvent() {} },
  }, ['savePendingOrder', 'getPendingOrders', 'removePendingOrder']);

  guestLib.savePendingOrder({ tx_ref: 'FLW_OPAY_GUEST_1', plan_id: 'plan-1hr', plan_name: '3 Hour Fast Pass', price: 100 });
  assert.equal(guestLib.getPendingOrders().length, 1);
  assert.equal(guestLib.getPendingOrders()[0].tx_ref, 'FLW_OPAY_GUEST_1');
  guestLib.removePendingOrder('FLW_OPAY_GUEST_1');
  assert.equal(guestLib.getPendingOrders().length, 0);

  // 2. Verify Flutterwave webhook automatically fulfills guest voucher_purchase on server
  let fulfilledRef = null;
  const webhookRoute = await loadModule('app/api/webhook/flutterwave/route.js', {
    NextResponse: { json: (body, init) => Response.json(body, init) },
    supabaseAdmin: {
      from() {
        return {
          select() { return this; },
          eq() { return this; },
          maybeSingle: async () => ({ data: { value: { secret_key: 'FLWSECK-test', webhook_secret: 'wh-secret' } } }),
        };
      },
    },
    broadcastWalletUpdate: async () => {},
    rateLimitWebhook: () => null,
    fulfillVerifiedFlutterwaveVoucher: async (flwTx, opts) => {
      fulfilledRef = opts.tx_ref;
      return { ok: true, idempotent: false, voucher_code: '88123', plan: '3 Hour Fast Pass', price: 100, tx_ref: opts.tx_ref };
    },
    fetch: async () => Response.json({
      status: 'success',
      data: {
        id: 2121176611,
        tx_ref: 'FLW_OPAY_GUEST_1',
        status: 'successful',
        currency: 'NGN',
        amount: 100,
        charged_amount: 100,
        app_fee: 2,
        amount_settled: 97.85,
        meta: { type: 'voucher_purchase', plan_id: 'plan-1hr', plan_name: '3 Hour Fast Pass' },
      },
    }),
  }, ['POST']);

  const res = await webhookRoute.POST(new Request('https://test.local/api/webhook/flutterwave', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'verif-hash': 'wh-secret' },
    body: JSON.stringify({ data: { id: 2121176611, tx_ref: 'FLW_OPAY_GUEST_1', status: 'successful', amount: 100, currency: 'NGN', meta: { type: 'voucher_purchase', plan_id: 'plan-1hr' } } }),
  }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.action, 'voucher_issued');
  assert.equal(body.voucher_code, '88123');
  assert.equal(fulfilledRef, 'FLW_OPAY_GUEST_1');
});

test('Super Admin direct wallet funding uses exact 3-arg adjust_wallet_balance RPC, logs ledger, broadcasts update, and supports email lookup', async () => {
  const targetId = '00000000-0000-4000-8000-000000000088';
  let walletBalance = 250;
  const rpcCalls = [];
  const insertedTxs = [];
  const broadcasts = [];

  const usersRoute = await loadModule('app/api/super-admin/users/route.js', {
    NextResponse: { json: (body, init) => Response.json(body, init) },
    validateAdminAuth: async () => true,
    unauthorizedResponse: () => Response.json({ error: 'Unauthorized' }, { status: 401 }),
    broadcastWalletUpdate: async (uid, bal) => broadcasts.push({ uid, bal }),
    logChange: async () => {},
    supabaseAdmin: {
      auth: { admin: { listUsers: async () => ({ data: { users: [{ id: targetId, email: 'customer@example.com' }] } }) } },
      async rpc(fn, args) {
        rpcCalls.push({ fn, args });
        assert.deepEqual(Object.keys(args).sort(), ['p_amount', 'p_operation', 'p_user_id'], 'adjust_wallet_balance must only receive exact 3 RPC parameters');
        if (args.p_operation === 'add') {
          walletBalance += args.p_amount;
          return { data: walletBalance, error: null };
        }
        if (args.p_operation === 'deduct') {
          if (walletBalance < args.p_amount) return { data: -1, error: null };
          walletBalance -= args.p_amount;
          return { data: walletBalance, error: null };
        }
        throw new Error(`Invalid operation: ${args.p_operation}`);
      },
      from(table) {
        return {
          insert(row) {
            if (table === 'transactions') insertedTxs.push(row);
            return {
              select() { return { single: async () => ({ data: { id: 'tx-admin-1', ...row } }) }; },
              then: resolve => resolve({ data: row, error: null }),
            };
          },
        };
      },
    },
  }, ['POST']);

  // 1. Direct funding by email
  const fundRes = await usersRoute.POST(new Request('https://test.local/api/super-admin/users', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'customer@example.com', amount: 500, operation: 'add', note: 'Cash deposit' }),
  }));
  assert.equal(fundRes.status, 200);
  const fundJson = await fundRes.json();
  assert.equal(fundJson.new_balance, 750);
  assert.equal(insertedTxs[0].type, 'wallet_topup');
  assert.equal(insertedTxs[0].amount, 500);
  assert.equal(broadcasts[0].bal, 750);

  // 2. Debit uses 'deduct' (not broken 'subtract') and rejects overdraft cleanly
  const debitRes = await usersRoute.POST(new Request('https://test.local/api/super-admin/users', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ user_id: targetId, amount: 200, operation: 'subtract', note: 'Reversal' }),
  }));
  assert.equal(debitRes.status, 200);
  assert.equal((await debitRes.json()).new_balance, 550);
  assert.equal(rpcCalls[1].args.p_operation, 'deduct');

  const overdraftRes = await usersRoute.POST(new Request('https://test.local/api/super-admin/users', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ user_id: targetId, amount: 9999, operation: 'subtract' }),
  }));
  assert.equal(overdraftRes.status, 400);

  // 3. Verify OPay, Moniepoint, and PalmPay mobile API domains (wildcards, CNAME double-wildcards, and exact hostnames for RouterOS active CNAME->IP resolution) are in WalledGardenTab and auto-setup
  const wgSrc = await read('app/super-admin/components/WalledGardenTab.js');
  const autoSetupSrc = await read('app/api/mikrotik/auto-setup/route.js');
  for (const domain of [
    '*opaycheckout.com',
    '*opay-inc.com',
    '*opayweb.com*',
    'api.opayweb.com',
    'gw-ng.opayweb.com',
    'wallet-transaction.opayweb.com',
    'liveapi.opaycheckout.com',
    '*palmpay-inc.com',
    '*palmpay-inc.com*',
    '*transsnet.com',
    '*transspay.net*',
    'open-gw-prod.palmpay-inc.com',
    'ms.palmpay-inc.com',
    'riskopsfinger.transspay.net',
    '*moniepoint.com',
    '*moniepoint.ng',
    'api-gateway.moniepoint.com',
  ]) {
    assert.ok(wgSrc.includes(domain), `WalledGardenTab must include ${domain}`);
    assert.ok(autoSetupSrc.includes(domain), `auto-setup must include ${domain}`);
  }
  assert.ok(!wgSrc.includes("{ domain: 'www.gstatic.com'"), 'WalledGardenTab must not whitelist www.gstatic.com (breaks Android captive portal probe)');
  assert.ok(autoSetupSrc.includes("'dst-port': '853'"), 'auto-setup must allow TCP port 853 for Android Private DNS');
  assert.ok(autoSetupSrc.includes("chain: 'pre-hotspot'") && autoSetupSrc.includes("'to-ports': '64874'"), 'auto-setup must redirect unauthenticated port-80 probes in pre-hotspot');
});

test('Guest Wallet: localStorage token + Flutterwave webhook & topup credit full ₦100 (even after ₦3 fee) and purchase deducts atomically with router-failure refund', async () => {
  const localMap = new Map();
  const sessionMap = new Map();
  const mockStorage = (map) => ({
    getItem: k => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: k => map.delete(k),
  });

  const guestLib = await loadModule('lib/guest-vouchers.js', {
    localStorage: mockStorage(localMap),
    sessionStorage: mockStorage(sessionMap),
    crypto: globalThis.crypto,
    Event: class MockEvent { constructor(type) { this.type = type; } },
    window: { dispatchEvent() {} },
  }, ['getOrCreateGuestToken', 'setCachedGuestBalance', 'getCachedGuestBalance', 'savePendingGuestTopup', 'getPendingGuestTopups', 'removePendingGuestTopup']);

  const gToken = guestLib.getOrCreateGuestToken();
  assert.match(gToken, /^gw_[a-f0-9]{48}$/, 'guest token must be cryptographically formatted');
  assert.equal(guestLib.getOrCreateGuestToken(), gToken, 'guest token must persist across calls');

  guestLib.savePendingGuestTopup({ tx_ref: 'FLW_GTOPUP_100_TEST', amount: 100, guest_token: gToken });
  assert.equal(guestLib.getPendingGuestTopups().length, 1);

  // Mock DB for guest_wallets, transactions, vouchers, plans, app_settings
  let guestBalance = 0;
  const txRows = [];
  const voucherRows = [];
  let routerShouldFail = false;

  const feeHelper = await loadModule('lib/flutterwave-fees.js', {}, [
    'resolveFlutterwavePaidAmount',
    'getFlutterwaveFeeAllowance',
    'getFlutterwaveWalletFeeTolerance',
    'resolveFlutterwaveWalletCredit',
  ]);

  const supabaseMock = {
    from(table) {
      const filters = [];
      const q = {
        select() { return q; },
        eq(k, v) { filters.push([k, v]); return q; },
        insert(row) {
          if (table === 'vouchers') voucherRows.push(row);
          if (table === 'transactions') txRows.push({ id: `tx-${txRows.length + 1}`, ...row });
          return {
            select() { return { single: async () => ({ data: { id: `tx-${txRows.length}` } }) }; },
            then: resolve => resolve({ data: row, error: null }),
          };
        },
        upsert(row) {
          const exists = txRows.find(t => t.flw_ref === row.flw_ref);
          const inserted = exists ? null : { id: `tx-${txRows.length + 1}`, ...row };
          if (inserted) txRows.push(inserted);
          return {
            select() { return { maybeSingle: async () => ({ data: inserted, error: null }) }; },
          };
        },
        async maybeSingle() {
          if (table === 'transactions') {
            const ref = filters.find(([k]) => k === 'flw_ref')?.[1];
            return { data: txRows.find(t => t.flw_ref === ref) || null };
          }
          if (table === 'guest_wallets') {
            return { data: { guest_token: gToken, balance: guestBalance } };
          }
          if (table === 'plans') {
            const id = filters.find(([k]) => k === 'id')?.[1];
            if (id === 'plan-1hr') return { data: { id: 'plan-1hr', name: '3 Hour Fast Pass', price: 100, duration: '3h', devices: 1, upload_speed: '10M', download_speed: '10M' } };
          }
          if (table === 'app_settings') {
            const key = filters.find(([k]) => k === 'key')?.[1];
            if (key === 'flutterwave') return { data: { value: { secret_key: 'FLWSECK-test', webhook_secret: 'wh-secret' } } };
            if (key === 'hotspot_settings') return { data: { value: { sharing_enabled: false, expiry_mode: 'elapsed' } } };
          }
          return { data: null };
        },
      };
      return q;
    },
    async rpc(fn, args) {
      if (fn === 'adjust_guest_wallet_balance') {
        assert.equal(args.p_guest_token, gToken);
        if (args.p_operation === 'add') {
          guestBalance += Number(args.p_amount);
          return { data: guestBalance, error: null };
        }
        if (args.p_operation === 'deduct') {
          if (guestBalance < Number(args.p_amount)) return { data: -1, error: null };
          guestBalance -= Number(args.p_amount);
          return { data: guestBalance, error: null };
        }
      }
      if (fn === 'claim_fallback_voucher') return { data: [], error: null };
      return { data: null, error: null };
    },
  };

  // 1. Webhook credits Guest Wallet full ₦100 when Flutterwave deducts ₦3 fee (amount: 97, app_fee: 3)
  const flwGuestPayload = {
    id: 8801,
    tx_ref: 'FLW_GTOPUP_100_TEST',
    status: 'successful',
    currency: 'NGN',
    amount: 97,
    charged_amount: 97,
    app_fee: 3,
    amount_settled: 97,
    meta: { type: 'guest_wallet_topup', guest_token: gToken, intended_amount: 100 },
  };
  const webhookRoute = await loadModule('app/api/webhook/flutterwave/route.js', {
    NextResponse: { json: (body, init) => Response.json(body, init) },
    supabaseAdmin: supabaseMock,
    broadcastWalletUpdate: async () => {},
    rateLimitWebhook: () => null,
    fulfillVerifiedFlutterwaveVoucher: async () => ({ ok: false }),
    fetch: async () => Response.json({ status: 'success', data: flwGuestPayload }),
  }, ['POST']);

  const whRes = await webhookRoute.POST(new Request('https://test.local/api/webhook/flutterwave', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'verif-hash': 'wh-secret' },
    body: JSON.stringify({ data: flwGuestPayload }),
  }));
  assert.equal(whRes.status, 200);
  const whJson = await whRes.json();
  assert.equal(whJson.action, 'guest_wallet_credit');
  assert.equal(whJson.balance, 100);
  assert.equal(guestBalance, 100);

  // 2. Subsequent browser /api/guest-wallet/topup call stays idempotent (no double-credit!)
  const topupRoute = await loadModule('app/api/guest-wallet/topup/route.js', {
    ...feeHelper,
    NextResponse: { json: (body, init) => Response.json(body, init) },
    supabaseAdmin: supabaseMock,
    getFlutterwaveSecretKey: async () => 'FLWSECK-test',
    logger: { financial() {}, getCorrelationId: () => 'cid-gw' },
    fetch: async () => Response.json({ status: 'success', data: flwGuestPayload }),
  }, ['POST']);
  const dupRes = await topupRoute.POST(new Request('https://test.local/api/guest-wallet/topup', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ guest_token: gToken, flw_ref: 'FLW_GTOPUP_100_TEST', amount: 100 }),
  }));
  assert.equal(dupRes.status, 200);
  assert.equal((await dupRes.json()).duplicate, true);
  assert.equal(guestBalance, 100);

  // 3. Guest purchases ₦100 plan from Guest Wallet — router failure refunds automatically, then retry succeeds!
  const purchaseRoute = await loadModule('app/api/guest-wallet/purchase/route.js', {
    NextResponse: { json: (body, init) => Response.json(body, init) },
    supabaseAdmin: supabaseMock,
    isMikroTikConfigured: async () => true,
    createOrQueueHotspotUser: async opts => {
      if (routerShouldFail) throw new Error('Router timeout');
      return { routerId: '*42', profile: opts.profile };
    },
    generateUniqueCode: async () => '99441',
    logger: { financial() {}, getCorrelationId: () => 'cid-gwp' },
  }, ['POST']);

  routerShouldFail = true;
  const failPurchase = await purchaseRoute.POST(new Request('https://test.local/api/guest-wallet/purchase', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ guest_token: gToken, plan_id: 'plan-1hr' }),
  }));
  assert.equal(failPurchase.status, 502);
  assert.equal(guestBalance, 100, 'Guest wallet must be refunded automatically on router failure');

  routerShouldFail = false;
  const okPurchase = await purchaseRoute.POST(new Request('https://test.local/api/guest-wallet/purchase', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ guest_token: gToken, plan_id: 'plan-1hr' }),
  }));
  assert.equal(okPurchase.status, 200);
  const okJson = await okPurchase.json();
  assert.equal(okJson.voucher_code, '99441');
  assert.equal(okJson.new_balance, 0);
  assert.equal(guestBalance, 0);

  // 4. Attempting a second purchase with ₦0 balance is rejected cleanly
  const emptyPurchase = await purchaseRoute.POST(new Request('https://test.local/api/guest-wallet/purchase', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ guest_token: gToken, plan_id: 'plan-1hr' }),
  }));
  assert.equal(emptyPurchase.status, 400);
});

test('Security: cross-purpose Flutterwave payment replay is blocked across verify-payment, check-tx, guest-wallet/topup, and wallet/topup', async () => {
  const schemas = await loadModule('lib/schemas.js', {}, ['verifyPaymentSchema', 'walletTopupSchema', 'validateBody']);
  const feeHelper = await loadModule('lib/flutterwave-fees.js', {}, [
    'resolveFlutterwavePaidAmount',
    'getFlutterwaveFeeAllowance',
    'getFlutterwaveWalletFeeTolerance',
    'resolveFlutterwaveWalletCredit',
  ]);
  const userA = '00000000-0000-4000-8000-0000000000aa';
  const userB = '00000000-0000-4000-8000-0000000000bb';
  const guestTokenA = 'gw_' + 'a'.repeat(48);
  const guestTokenB = 'gw_' + 'b'.repeat(48);
  let routerCalls = 0;
  let flwPayload = null;
  const existingTxs = [
    { id: 'tx-user-topup', flw_ref: 'FLW_TOPUP_EXISTING', type: 'wallet_topup', user_id: userA, amount: 500, metadata: {} },
  ];

  const baseFrom = (table) => {
    const filters = [];
    const q = {
      select() { return q; },
      eq(k, v) { filters.push([k, v]); return q; },
      delete() { return { eq: async () => ({ error: null }) }; },
      async maybeSingle() {
        if (table === 'transactions') {
          const ref = filters.find(([k]) => k === 'flw_ref')?.[1];
          return { data: existingTxs.find(t => t.flw_ref === ref) || null };
        }
        if (table === 'app_settings') {
          const key = filters.find(([k]) => k === 'key')?.[1];
          if (key === 'payment_gateway') return { data: { value: { active: 'flutterwave' } } };
          if (key === 'flutterwave') return { data: { value: { secret_key: 'FLWSECK-test', webhook_secret: 'wh-sec' } } };
        }
        if (table === 'plans') {
          return { data: { id: 'plan-1hr', name: '3 Hour Fast Pass', price: 100, duration: '3h' } };
        }
        return { data: null };
      },
    };
    return q;
  };

  // 1. verify-payment must reject FLW_TOPUP_ and FLW_GTOPUP_ with 400 and never provision router
  const verifyRoute = await loadModule('app/api/purchase/verify-payment/route.js', {
    ...schemas,
    NextResponse: { json: (body, init) => Response.json(body, init) },
    supabaseAdmin: { from: baseFrom, rpc: async () => ({ data: [] }) },
    fulfillMonnifyPayment: async () => ({}),
    validateUserAuth: async () => null,
    isMikroTikConfigured: async () => true,
    calculateExpiresAt: () => new Date().toISOString(),
    createOrQueueHotspotUser: async () => { routerCalls++; return { routerId: '*1' }; },
    generateUniqueCode: async () => '11223',
    logger: { financial() {}, getCorrelationId: () => 'cid-sec1' },
    sendVoucherSms: async () => {},
    fetch: async () => Response.json({ status: 'success', data: flwPayload }),
  }, ['POST']);

  for (const replayPayload of [
    { status: 'successful', amount: 100, currency: 'NGN', tx_ref: 'FLW_TOPUP_REPLAY_1', meta: { type: 'wallet_topup', user_id: userA } },
    { status: 'successful', amount: 100, currency: 'NGN', tx_ref: 'FLW_GTOPUP_REPLAY_1', meta: { type: 'guest_wallet_topup', guest_token: guestTokenA } },
  ]) {
    flwPayload = replayPayload;
    const res = await verifyRoute.POST(new Request('https://test.local/api/purchase/verify-payment', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ transaction_id: '5001', tx_ref: replayPayload.tx_ref, plan_id: 'plan-1hr' }),
    }));
    assert.equal(res.status, 400, `verify-payment must reject ${replayPayload.tx_ref}`);
  }
  assert.equal(routerCalls, 0, 'Router must never be called for replayed wallet deposit refs');

  // 2. check-tx must reject FLW_TOPUP_, FLW_GTOPUP_, and placeholder guest_*@mycollectivesub.si emails
  const checkTxRoute = await loadModule('app/api/purchase/check-tx/route.js', {
    NextResponse: { json: (body, init) => Response.json(body, init) },
    supabaseAdmin: { from: baseFrom },
    fulfillVerifiedFlutterwaveVoucher: async () => { throw new Error('must not be called'); },
    getFlutterwaveSecretKey: async () => 'FLWSECK-test',
  }, ['GET', 'POST']);

  assert.equal((await checkTxRoute.GET(new Request('https://test.local/api/purchase/check-tx?tx_ref=FLW_GTOPUP_99'))).status, 400);
  assert.equal((await checkTxRoute.GET(new Request('https://test.local/api/purchase/check-tx?tx_ref=FLW_TOPUP_99'))).status, 400);
  assert.equal((await checkTxRoute.POST(new Request('https://test.local/api/purchase/check-tx', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tx_ref: 'FLW_GTOPUP_99' }),
  }))).status, 400);
  assert.equal((await checkTxRoute.POST(new Request('https://test.local/api/purchase/check-tx', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'guest_deadbeef@mycollectivesub.si' }),
  }))).status, 400);

  // 3. guest-wallet/topup must reject voucher_purchase, missing guest_token, wrong guest_token, and registered user tx_ref
  const guestTopupRoute = await loadModule('app/api/guest-wallet/topup/route.js', {
    ...feeHelper,
    NextResponse: { json: (body, init) => Response.json(body, init) },
    supabaseAdmin: { from: baseFrom, rpc: async () => ({ data: 0, error: null }) },
    getFlutterwaveSecretKey: async () => 'FLWSECK-test',
    logger: { financial() {}, getCorrelationId: () => 'cid-sec2' },
    fetch: async () => Response.json({ status: 'success', data: flwPayload }),
  }, ['POST']);

  // Existing registered user topup ref submitted to guest wallet -> 403
  assert.equal((await guestTopupRoute.POST(new Request('https://test.local/api/guest-wallet/topup', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ guest_token: guestTokenA, flw_ref: 'FLW_TOPUP_EXISTING', amount: 500 }),
  }))).status, 403);

  // Direct voucher purchase transaction_id replayed into guest wallet -> 400
  flwPayload = { id: 6001, tx_ref: 'FLW_VOUCHER_123', status: 'successful', currency: 'NGN', amount: 100, meta: { type: 'voucher_purchase', plan_id: 'plan-1hr' } };
  assert.equal((await guestTopupRoute.POST(new Request('https://test.local/api/guest-wallet/topup', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ guest_token: guestTokenA, transaction_id: '6001', amount: 100 }),
  }))).status, 400);

  // Guest topup missing meta.guest_token -> 403
  flwPayload = { id: 6002, tx_ref: 'FLW_GTOPUP_NOTOKEN', status: 'successful', currency: 'NGN', amount: 100, meta: { type: 'guest_wallet_topup' } };
  assert.equal((await guestTopupRoute.POST(new Request('https://test.local/api/guest-wallet/topup', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ guest_token: guestTokenA, flw_ref: 'FLW_GTOPUP_NOTOKEN', transaction_id: '6002', amount: 100 }),
  }))).status, 403);

  // Guest topup belonging to another guest token -> 403
  flwPayload = { id: 6003, tx_ref: 'FLW_GTOPUP_OTHER', status: 'successful', currency: 'NGN', amount: 100, meta: { type: 'guest_wallet_topup', guest_token: guestTokenB } };
  assert.equal((await guestTopupRoute.POST(new Request('https://test.local/api/guest-wallet/topup', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ guest_token: guestTokenA, flw_ref: 'FLW_GTOPUP_OTHER', transaction_id: '6003', amount: 100 }),
  }))).status, 403);

  // 4. wallet/topup must reject voucher_purchase, guest_wallet_topup, and another user's meta.user_id
  const userTopupRoute = await loadModule('app/api/wallet/topup/route.js', {
    ...schemas,
    NextResponse: { json: (body, init) => Response.json(body, init) },
    supabaseAdmin: { from: baseFrom, rpc: async () => ({ data: 0, error: null }) },
    broadcastWalletUpdate: async () => {},
    fulfillMonnifyPayment: async () => ({}),
    validateUserAuth: async () => ({ id: userA, email: 'a@example.com' }),
    userUnauthorizedResponse: msg => Response.json({ error: msg }, { status: 401 }),
    logger: { financial() {}, getCorrelationId: () => 'cid-sec3' },
    fetch: async () => Response.json({ status: 'success', data: flwPayload }),
  }, ['POST']);

  flwPayload = { id: 7001, tx_ref: 'FLW_VOUCHER_777', status: 'successful', currency: 'NGN', amount: 100, meta: { type: 'voucher_purchase', plan_id: 'plan-1hr' } };
  assert.equal((await userTopupRoute.POST(new Request('https://test.local/api/wallet/topup', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ amount: 100, user_id: userA, flw_ref: 'FLW_VOUCHER_777', transaction_id: 7001, gateway: 'flutterwave' }),
  }))).status, 400);

  flwPayload = { id: 7002, tx_ref: 'FLW_GTOPUP_777', status: 'successful', currency: 'NGN', amount: 100, meta: { type: 'guest_wallet_topup', guest_token: guestTokenA } };
  assert.equal((await userTopupRoute.POST(new Request('https://test.local/api/wallet/topup', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ amount: 100, user_id: userA, flw_ref: 'FLW_GTOPUP_777', transaction_id: 7002, gateway: 'flutterwave' }),
  }))).status, 400);

  flwPayload = { id: 7003, tx_ref: 'FLW_TOPUP_USERB', status: 'successful', currency: 'NGN', amount: 100, meta: { type: 'wallet_topup', user_id: userB } };
  assert.equal((await userTopupRoute.POST(new Request('https://test.local/api/wallet/topup', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ amount: 100, user_id: userA, flw_ref: 'FLW_TOPUP_USERB', transaction_id: 7003, gateway: 'flutterwave' }),
  }))).status, 403);

  // Deposit inflation attack: paying ₦1,000 while claiming amount=1035 or meta.intended_amount=1035 MUST be blocked
  flwPayload = { id: 7004, tx_ref: 'FLW_TOPUP_INFLATE', status: 'successful', currency: 'NGN', amount: 1000, charged_amount: 1000, app_fee: 14, amount_settled: 986, meta: { type: 'wallet_topup', user_id: userA, intended_amount: 1035 } };
  assert.equal((await userTopupRoute.POST(new Request('https://test.local/api/wallet/topup', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ amount: 1035, user_id: userA, flw_ref: 'FLW_TOPUP_INFLATE', transaction_id: 7004, gateway: 'flutterwave' }),
  }))).status, 400);
  assert.equal(feeHelper.resolveFlutterwaveWalletCredit(flwPayload, 1035), 1000, 'Spoofed meta.intended_amount must never inflate ₦1,000 deposit to ₦1,035');
});

test('Reliability: concurrent flutterwave-fulfill returns 409 without double-provisioning, RPC failures roll back orphaned tx rows, DB insert errors refund guest wallet, and webhook fails closed', async () => {
  const feeHelper = await loadModule('lib/flutterwave-fees.js', {}, [
    'resolveFlutterwavePaidAmount',
    'getFlutterwaveFeeAllowance',
    'getFlutterwaveWalletFeeTolerance',
    'resolveFlutterwaveWalletCredit',
  ]);
  const gToken = 'gw_' + 'c'.repeat(48);

  // 1. lib/flutterwave-fulfill.js: when transactions.upsert returns null (already reserved), MUST return 409 and NOT call MikroTik
  let mikrotikCalls = 0;
  const fulfillMod = await loadModule('lib/flutterwave-fulfill.js', {
    ...feeHelper,
    setTimeout: (fn) => { fn(); return 0; }, // skip 350ms sleep in unit test
    isMikroTikConfigured: async () => true,
    createOrQueueHotspotUser: async () => { mikrotikCalls++; return { routerId: '*1' }; },
    generateUniqueCode: async () => '55667',
    sendVoucherSms: async () => {},
    supabaseAdmin: {
      from(table) {
        const q = {
          select() { return q; },
          eq() { return q; },
          upsert() { return { select() { return { maybeSingle: async () => ({ data: null, error: null }) }; } }; },
          async maybeSingle() {
            if (table === 'plans') return { data: { id: 'plan-1hr', name: '3 Hour Fast Pass', price: 100, duration: '3h' } };
            if (table === 'transactions') return { data: { id: 'already-reserved-by-other-worker' } };
            return { data: null };
          },
        };
        return q;
      },
    },
  }, ['fulfillVerifiedFlutterwaveVoucher']);

  const raceRes = await fulfillMod.fulfillVerifiedFlutterwaveVoucher({
    status: 'successful', currency: 'NGN', amount: 100, tx_ref: 'FLW_RACE_1',
    meta: { type: 'voucher_purchase', plan_id: 'plan-1hr' },
  });
  assert.equal(raceRes.ok, false);
  assert.equal(raceRes.status, 409, 'Concurrent fulfillment must return 409 instead of falling through');
  assert.equal(mikrotikCalls, 0, 'MikroTik must NOT be provisioned a second time when lock is held');

  // 2. guest-wallet/topup deletes orphaned transactions row on RPC failure so retry succeeds
  let txStore = [];
  let rpcFailOnce = true;
  let guestBal = 0;
  const topupRollbackDb = {
    from(table) {
      const filters = [];
      const q = {
        select() { return q; },
        eq(k, v) { filters.push([k, v]); return q; },
        delete() {
          return {
            eq: async (k, v) => {
              if (table === 'transactions') txStore = txStore.filter(r => r[k] !== v);
              return { error: null };
            },
          };
        },
        upsert(row) {
          const exists = txStore.find(t => t.flw_ref === row.flw_ref);
          const inserted = exists ? null : { id: `tx-${txStore.length + 1}`, ...row };
          if (inserted) txStore.push(inserted);
          return { select() { return { maybeSingle: async () => ({ data: inserted, error: null }) }; } };
        },
        async maybeSingle() {
          if (table === 'transactions') {
            const ref = filters.find(([k]) => k === 'flw_ref')?.[1];
            return { data: txStore.find(t => t.flw_ref === ref) || null };
          }
          if (table === 'guest_wallets') return { data: { balance: guestBal } };
          return { data: null };
        },
      };
      return q;
    },
    async rpc(fn, args) {
      if (fn === 'adjust_guest_wallet_balance') {
        if (rpcFailOnce) {
          rpcFailOnce = false;
          return { data: null, error: { message: 'Temporary DB timeout' } };
        }
        guestBal += Number(args.p_amount);
        return { data: guestBal, error: null };
      }
      return { data: null, error: null };
    },
  };

  const gwTopupMod = await loadModule('app/api/guest-wallet/topup/route.js', {
    ...feeHelper,
    NextResponse: { json: (body, init) => Response.json(body, init) },
    supabaseAdmin: topupRollbackDb,
    getFlutterwaveSecretKey: async () => 'FLWSECK-test',
    logger: { financial() {}, getCorrelationId: () => 'cid-rb' },
    fetch: async () => Response.json({
      status: 'success',
      data: { id: 9901, tx_ref: 'FLW_GTOPUP_ROLLBACK', status: 'successful', currency: 'NGN', amount: 100, meta: { type: 'guest_wallet_topup', guest_token: gToken } },
    }),
  }, ['POST']);

  const firstAttempt = await gwTopupMod.POST(new Request('https://test.local/api/guest-wallet/topup', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ guest_token: gToken, flw_ref: 'FLW_GTOPUP_ROLLBACK', transaction_id: '9901', amount: 100 }),
  }));
  assert.equal(firstAttempt.status, 500);
  assert.equal(txStore.length, 0, 'Orphaned transaction row must be deleted when balance RPC fails');

  const retryAttempt = await gwTopupMod.POST(new Request('https://test.local/api/guest-wallet/topup', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ guest_token: gToken, flw_ref: 'FLW_GTOPUP_ROLLBACK', transaction_id: '9901', amount: 100 }),
  }));
  assert.equal(retryAttempt.status, 200);
  assert.equal(guestBal, 100, 'Retry after rollback must credit full ₦100');

  // 3. guest-wallet/purchase refunds balance when Supabase vouchers.insert returns { error } (without throwing!)
  let deletedTxIds = [];
  const purchaseMod = await loadModule('app/api/guest-wallet/purchase/route.js', {
    NextResponse: { json: (body, init) => Response.json(body, init) },
    isMikroTikConfigured: async () => true,
    createOrQueueHotspotUser: async opts => ({ routerId: '*8', profile: opts.profile }),
    generateUniqueCode: async () => '44556',
    logger: { financial() {}, getCorrelationId: () => 'cid-refund' },
    supabaseAdmin: {
      from(table) {
        const q = {
          select() { return q; },
          eq() { return q; },
          delete() { return { eq: async (_k, v) => { deletedTxIds.push(v); return { error: null }; } }; },
          insert() {
            if (table === 'transactions') {
              return { select() { return { single: async () => ({ data: { id: 'tx-orphaned-1' }, error: null }) }; } };
            }
            if (table === 'vouchers') {
              return Promise.resolve({ data: null, error: { message: 'vouchers insert failure' } });
            }
            return Promise.resolve({ data: null, error: null });
          },
          async maybeSingle() {
            if (table === 'plans') return { data: { id: 'plan-1hr', name: '3 Hour Fast Pass', price: 100, duration: '3h' } };
            return { data: null };
          },
        };
        return q;
      },
      async rpc(fn, args) {
        if (fn === 'adjust_guest_wallet_balance') {
          if (args.p_operation === 'deduct') { guestBal -= Number(args.p_amount); return { data: guestBal, error: null }; }
          if (args.p_operation === 'add') { guestBal += Number(args.p_amount); return { data: guestBal, error: null }; }
        }
        return { data: null, error: null };
      },
    },
  }, ['POST']);

  const dbFailPurchase = await purchaseMod.POST(new Request('https://test.local/api/guest-wallet/purchase', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ guest_token: gToken, plan_id: 'plan-1hr' }),
  }));
  assert.equal(dbFailPurchase.status, 500);
  assert.equal(guestBal, 100, 'Guest wallet must be refunded when vouchers.insert returns { error }');
  assert.deepEqual(deletedTxIds, ['tx-orphaned-1'], 'Orphaned purchase transaction must be cleaned up on voucher insert failure');

  // 4. Webhook fails closed when Flutterwave /verify rejects transaction, and rejects unconfigured auth
  let flwSettingVal = { secret_key: '', webhook_secret: '' };
  let verifyStatus = 400;
  const webhookMod = await loadModule('app/api/webhook/flutterwave/route.js', {
    NextResponse: { json: (body, init) => Response.json(body, init) },
    supabaseAdmin: {
      from() {
        return {
          select() { return this; },
          eq() { return this; },
          maybeSingle: async () => ({ data: { value: flwSettingVal } }),
        };
      },
    },
    broadcastWalletUpdate: async () => {},
    rateLimitWebhook: () => null,
    fulfillVerifiedFlutterwaveVoucher: async () => { throw new Error('must not be called'); },
    fetch: async () => new Response(JSON.stringify({ status: 'error', message: 'Invalid tx' }), { status: verifyStatus }),
  }, ['POST']);

  const unconfiguredRes = await webhookMod.POST(new Request('https://test.local/api/webhook/flutterwave', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ data: { id: 123, tx_ref: 'FLW_TOPUP_FAKE', status: 'successful', amount: 1000 } }),
  }));
  assert.equal(unconfiguredRes.status, 503, 'Webhook must fail closed when neither secret is configured');

  flwSettingVal = { secret_key: 'FLWSECK-test', webhook_secret: 'wh-sec' };
  const verifyFailRes = await webhookMod.POST(new Request('https://test.local/api/webhook/flutterwave', {
    method: 'POST', headers: { 'content-type': 'application/json', 'verif-hash': 'wh-sec' },
    body: JSON.stringify({ data: { id: 123, tx_ref: 'FLW_TOPUP_FAKE', status: 'successful', amount: 1000 } }),
  }));
  assert.equal(verifyFailRes.status, 400, 'Webhook must fail closed when Flutterwave API verification returns non-OK');

  // 5. Frontend & middleware structural regression checks
  const checkoutSrc = await read('app/components/CheckoutModal.js');
  assert.equal(checkoutSrc.includes('[isOpen, plan, user, hasSufficientWallet]'), false, 'CheckoutModal reset effect must not depend on hasSufficientWallet');
  const walletSrc = await read('app/wallet/page.js');
  assert.equal(walletSrc.includes('[user, guestEmail, computeTxSummary]'), false, 'fetchGuestWalletData must not re-fire on every guestEmail keystroke');
  const homeSrc = await read('app/page.js');
  assert.ok(homeSrc.includes('createPaymentHeaders()'), 'HomePage guest wallet sync must send CSRF headers');
  const statusSrc = await read('app/vouchers/status/page.js');
  assert.ok(statusSrc.includes('removePendingOrder(redirectTxRef)'), 'Status redirect handler must clear localStorage pending order');
  const mwSrc = await read('middleware.js');
  assert.ok(mwSrc.includes("'/api/guest-wallet'"), 'Middleware must rate-limit /api/guest-wallet');

  // Service worker must never intercept /api/, /super-admin, or authenticated requests
  const swSrc = await read('public/sw.js');
  assert.ok(swSrc.includes("url.pathname.startsWith('/api/')"), 'Service worker must bypass all /api/ routes');
  assert.ok(swSrc.includes("url.pathname.startsWith('/super-admin')"), 'Service worker must bypass /super-admin');
  assert.ok(swSrc.includes("request.headers.has('authorization')"), 'Service worker must bypass authenticated requests');
  const nextCfgSrc = await read('next.config.mjs');
  assert.ok(nextCfgSrc.includes("source: '/sw.js'"), 'next.config.mjs must prevent HTTP caching of /sw.js');
});
