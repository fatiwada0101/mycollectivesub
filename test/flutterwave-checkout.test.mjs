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
