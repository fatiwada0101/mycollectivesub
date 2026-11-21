export const GUEST_SESSION_KEY = 'asuk_guest_session';
export const ACTIVE_VOUCHER_KEY = 'asuk_active_voucher';
export const GUEST_VOUCHERS_KEY = 'mycollectivesub_guest_vouchers';
export const PENDING_ORDERS_KEY = 'mycollectivesub_pending_flw_orders';
export const DASHBOARD_ACTIVE_KEY = 'asuk_dashboard_active';

/**
 * Mark that the visitor has entered the dashboard / guest flow so refreshes keep them there.
 */
export function enableGuestSession() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(GUEST_SESSION_KEY, 'true');
  } catch {}
  try {
    sessionStorage.setItem(DASHBOARD_ACTIVE_KEY, '1');
  } catch {}
}

/**
 * Check whether this browser has an active guest session, active dashboard visit, or saved vouchers.
 */
export function hasGuestOrVoucherSession() {
  if (typeof window === 'undefined') return false;
  try {
    if (localStorage.getItem(GUEST_SESSION_KEY)) return true;
    if (localStorage.getItem(ACTIVE_VOUCHER_KEY)) return true;
    const rawList = localStorage.getItem(GUEST_VOUCHERS_KEY);
    if (rawList) {
      const parsed = JSON.parse(rawList);
      if (Array.isArray(parsed) && parsed.length > 0) return true;
    }
  } catch {}
  try {
    if (sessionStorage.getItem(DASHBOARD_ACTIVE_KEY)) return true;
  } catch {}
  return false;
}

/**
 * Persist a purchased voucher locally for both guests and signed-in users across page refreshes.
 */
export function saveGuestVoucher(voucher) {
  if (typeof window === 'undefined' || !voucher?.code) return;
  const code = String(voucher.code).trim();
  if (!code) return;

  const entry = {
    code,
    plan: voucher.plan || voucher.profile_name || 'Wi-Fi Pass',
    duration: voucher.duration || '24h',
    price: Number(voucher.price || 0),
    purchasedAt: voucher.purchasedAt || Date.now(),
    isUsed: !!voucher.isUsed,
    isFallback: !!voucher.isFallback,
  };

  enableGuestSession();

  try {
    localStorage.setItem(ACTIVE_VOUCHER_KEY, JSON.stringify(entry));
  } catch {}

  try {
    const existingRaw = localStorage.getItem(GUEST_VOUCHERS_KEY);
    const existing = existingRaw ? JSON.parse(existingRaw) : [];
    const list = Array.isArray(existing) ? existing : [];
    const deduped = [entry, ...list.filter(item => String(item?.code || '').trim().toUpperCase() !== code.toUpperCase())].slice(0, 25);
    localStorage.setItem(GUEST_VOUCHERS_KEY, JSON.stringify(deduped));
  } catch {}

  try {
    window.dispatchEvent(new Event('active_voucher_updated'));
  } catch {}
}

/**
 * Retrieve all locally saved vouchers (newest first), migrating legacy single-voucher storage cleanly.
 */
export function getGuestVouchers() {
  if (typeof window === 'undefined') return [];
  const items = [];
  const seen = new Set();

  const pushUnique = (raw) => {
    if (!raw?.code) return;
    const code = String(raw.code).trim();
    if (!code) return;
    const key = code.toUpperCase();
    if (seen.has(key)) return;
    seen.add(key);
    items.push({
      code,
      plan: raw.plan || raw.profile_name || 'Wi-Fi Pass',
      duration: raw.duration || '24h',
      price: Number(raw.price || 0),
      purchasedAt: raw.purchasedAt || Date.now(),
      isUsed: !!raw.isUsed,
      isFallback: !!raw.isFallback,
    });
  };

  try {
    const rawList = localStorage.getItem(GUEST_VOUCHERS_KEY);
    if (rawList) {
      const parsed = JSON.parse(rawList);
      if (Array.isArray(parsed)) parsed.forEach(pushUnique);
    }
  } catch {}

  try {
    const legacyRaw = localStorage.getItem(ACTIVE_VOUCHER_KEY);
    if (legacyRaw) {
      pushUnique(JSON.parse(legacyRaw));
    }
  } catch {}

  items.sort((a, b) => Number(b.purchasedAt || 0) - Number(a.purchasedAt || 0));
  return items;
}

const PENDING_ORDER_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Save a pending Flutterwave checkout reference to localStorage BEFORE opening the
 * Flutterwave popup so that if the user switches to OPay / PalmPay / Moniepoint on
 * mobile and the browser reloads or closes the popup, the voucher is automatically recovered.
 */
export function savePendingOrder(order) {
  if (typeof window === 'undefined' || !order?.tx_ref) return;
  const txRef = String(order.tx_ref).trim();
  if (!txRef) return;

  enableGuestSession();

  const entry = {
    tx_ref: txRef,
    plan_id: order.plan_id || '',
    plan_name: order.plan_name || 'Wi-Fi Pass',
    price: Number(order.price || 0),
    duration: order.duration || '24h',
    email: order.email || '',
    phone: order.phone || '',
    user_id: order.user_id || null,
    auto_renew: !!order.auto_renew,
    createdAt: Number(order.createdAt || Date.now()),
  };

  try {
    const existing = getPendingOrders();
    const next = [entry, ...existing.filter((item) => item.tx_ref !== txRef)].slice(0, 6);
    localStorage.setItem(PENDING_ORDERS_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event('pending_orders_updated'));
  } catch {}
}

/**
 * Return unexpired pending Flutterwave orders saved in localStorage (last 24 hours).
 */
export function getPendingOrders() {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(PENDING_ORDERS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const cutoff = Date.now() - PENDING_ORDER_TTL_MS;
    const valid = parsed.filter((o) => o?.tx_ref && Number(o.createdAt || 0) >= cutoff);
    if (valid.length !== parsed.length) {
      localStorage.setItem(PENDING_ORDERS_KEY, JSON.stringify(valid));
    }
    return valid;
  } catch {
    return [];
  }
}

/**
 * Remove a pending Flutterwave order once fulfilled or dismissed.
 */
export function removePendingOrder(txRef) {
  if (typeof window === 'undefined' || !txRef) return;
  try {
    const existing = getPendingOrders();
    const next = existing.filter((o) => o.tx_ref !== txRef);
    localStorage.setItem(PENDING_ORDERS_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event('pending_orders_updated'));
  } catch {}
}
