/**
 * Flutterwave Fee & Gross Payment Resolution Utilities
 *
 * Ensures that:
 * 1. When a guest or logged-in user pays for a plan (e.g. ₦100) or tops up their wallet (e.g. ₦100),
 *    Flutterwave's processing fee (~1.4%–2.0% + 7.5% Nigerian VAT ≈ ₦2.15–₦3 on ₦100) NEVER causes
 *    verification failure or leaves a wallet under-credited at ₦97.
 * 2. Super Admins can optionally toggle "Pass Flutterwave fee to customer" so checkout automatically
 *    adds the gateway fee on top of the plan/deposit price while still crediting the exact plan/deposit value.
 */

export const DEFAULT_FLUTTERWAVE_FEE_PERCENT = 2.15; // 2.0% + 7.5% VAT in Nigeria
export const FLUTTERWAVE_NGN_FEE_CAP = 2150;         // ₦2,000 cap + 7.5% VAT

/**
 * Standard gateway / bank-transfer charge allowance for a target NGN amount:
 * max(₦5, 3.5% of target), capped at ₦100.
 * Allows a ₦100 transaction that lands at ₦97 (after ₦3 charge) to pass verification,
 * while strictly rejecting real underpayments (e.g. ₦50 or ₦90 for a ₦100 plan).
 */
export function getFlutterwaveFeeAllowance(targetAmount) {
  const target = Number(targetAmount || 0);
  if (!Number.isFinite(target) || target <= 0) return 0;
  return Math.min(100, Math.max(5, Math.ceil(target * 0.035)));
}

/**
 * Tight upward fee tolerance for client-specified wallet top-ups (max ₦5).
 * Still restores ₦97 / ₦97.85 -> ₦100 when a ₦2-₦3 gateway fee is pre-deducted,
 * while preventing attackers from inflating large deposits via spoofed `amount` / `meta.intended_amount`.
 */
export function getFlutterwaveWalletFeeTolerance(targetAmount) {
  const target = Number(targetAmount || 0);
  if (!Number.isFinite(target) || target <= 0) return 0;
  return Math.min(5, Math.ceil(target * 0.035));
}

/**
 * Calculate checkout breakdown when charging a customer via Flutterwave.
 * By default (passFeeToCustomer = false), the customer pays the exact plan/deposit amount.
 * When passFeeToCustomer = true, the amount is grossed up to cover Flutterwave's fee.
 */
export function calculateFlutterwaveCheckoutAmounts(intendedAmount, config = {}) {
  const intended = Math.max(0, Math.round(Number(intendedAmount || 0) * 100) / 100);
  const passFee = !!(config?.passFeeToCustomer || config?.pass_fee_to_customer);
  const rawPct = Number(config?.feePercent ?? config?.fee_percent ?? DEFAULT_FLUTTERWAVE_FEE_PERCENT);
  const feePercent = Number.isFinite(rawPct) ? Math.min(10, Math.max(0, rawPct)) : DEFAULT_FLUTTERWAVE_FEE_PERCENT;

  if (!passFee || intended <= 0 || feePercent <= 0) {
    return {
      intendedAmount: intended,
      fee: 0,
      totalAmount: intended,
      feePercent: 0,
      passFeeToCustomer: false,
    };
  }

  const rate = feePercent / 100;
  const uncappedGross = Math.ceil(intended / (1 - rate));
  const fee = Math.min(Math.max(0, uncappedGross - intended), FLUTTERWAVE_NGN_FEE_CAP);
  return {
    intendedAmount: intended,
    fee,
    totalAmount: intended + fee,
    feePercent,
    passFeeToCustomer: true,
  };
}

/**
 * Resolve the authoritative gross amount paid by the customer from a Flutterwave
 * transaction verification/webhook payload, without trusting client-supplied meta.
 *
 * Handles:
 * - Standard merchant-absorbs-fee payloads: { amount: 100, charged_amount: 100, app_fee: 2, amount_settled: 97.85 } -> 100
 * - Fee-netted `amount` with gross `charged_amount`: { amount: 97, charged_amount: 100, app_fee: 3 } -> 100
 * - Fee-netted `amount` & `charged_amount` where `amount_settled` equals `amount` (or `amount` + `app_fee` matches):
 *   { amount: 97.85, charged_amount: 97.85, app_fee: 2, amount_settled: 97.85 } -> 100
 * - Customer-bears-fee payloads: { amount: 100, charged_amount: 103, app_fee: 3, amount_settled: 100 } -> 103
 * - Genuine underpayment (e.g. customer paid ₦50 for ₦100 plan): { amount: 50, charged_amount: 50, app_fee: 1, amount_settled: 48.92 } -> 50
 */
export function resolveFlutterwavePaidAmount(flwTx) {
  const amount = Number(flwTx?.amount || 0);
  const chargedAmount = Number(flwTx?.charged_amount || 0);
  const appFee = Math.max(0, Number(flwTx?.app_fee || 0));
  const merchantFee = Math.max(0, Number(flwTx?.merchant_fee || 0));
  const amountSettled = Number(flwTx?.amount_settled);

  let grossPaid = Math.max(
    Number.isFinite(amount) ? amount : 0,
    Number.isFinite(chargedAmount) ? chargedAmount : 0
  );

  if (appFee > 0 || merchantFee > 0) {
    // Only add fee back when `amount` is already net-of-fee:
    // Case A: `amount_settled` is present and matches `amount` (within 5 kobo).
    // Case B: `amount_settled` is omitted and `amount` + exact `app_fee` (or `app_fee * 1.075`)
    //         lands on a clean whole-Naira payment (e.g. amount=97, app_fee=3 -> 100) while
    //         `app_fee` is within standard gateway fee bounds (<= 5% of gross + ₦50).
    const feeNoVat = Math.round((appFee + merchantFee) * 100) / 100;
    const feeWithVat = Math.ceil((appFee * 1.075 + merchantFee) * 100) / 100;
    const maxReasonableFee = Math.max(10, grossPaid * 0.06);

    const settledMatchesAmount =
      Number.isFinite(amountSettled) &&
      amountSettled > 0 &&
      Math.abs(amountSettled - amount) <= 0.05;

    const noSettledField = !Number.isFinite(amountSettled) || amountSettled <= 0;
    const candidateNoVat = Math.round((amount + feeNoVat) * 100) / 100;
    const candidateWithVat = Math.round((amount + feeWithVat) * 100) / 100;

    if (settledMatchesAmount) {
      if (Math.abs(candidateWithVat - Math.round(candidateWithVat)) <= 0.05) {
        grossPaid = Math.max(grossPaid, Math.round(candidateWithVat));
      } else if (Math.abs(candidateNoVat - Math.round(candidateNoVat)) <= 0.05) {
        grossPaid = Math.max(grossPaid, Math.round(candidateNoVat));
      } else {
        grossPaid = Math.max(grossPaid, candidateNoVat, candidateWithVat);
      }
    } else if (noSettledField && feeNoVat <= maxReasonableFee) {
      if (Math.abs(candidateWithVat - Math.round(candidateWithVat)) <= 0.05) {
        grossPaid = Math.max(grossPaid, Math.round(candidateWithVat));
      } else if (Math.abs(candidateNoVat - Math.round(candidateNoVat)) <= 0.05) {
        grossPaid = Math.max(grossPaid, Math.round(candidateNoVat));
      }
    }
  }

  return grossPaid;
}

/**
 * Resolve the exact wallet credit amount for a Flutterwave wallet top-up.
 * - Never credits `amount_settled` (e.g. ₦97.85 on a ₦100 deposit).
 * - Never over-credits gateway fees when customer paid ₦103 for a ₦100 deposit.
 * - Never allows a spoofed `meta.intended_amount` to exceed what Flutterwave actually verified as paid.
 */
export function resolveFlutterwaveWalletCredit(flwTx, fallbackRequestedAmount = 0) {
  const grossPaid = resolveFlutterwavePaidAmount(flwTx);
  const amount = Number(flwTx?.amount || 0);
  const chargedAmount = Number(flwTx?.charged_amount || 0);
  const metaIntended = Number(
    flwTx?.meta?.intended_amount ??
    flwTx?.meta?.intendedAmount ??
    flwTx?.['meta.intended_amount'] ??
    fallbackRequestedAmount ??
    0
  );

  if (
    Number.isFinite(metaIntended) &&
    metaIntended > 0 &&
    grossPaid + getFlutterwaveWalletFeeTolerance(metaIntended) >= metaIntended
  ) {
    return Math.round(metaIntended * 100) / 100;
  }

  // Legacy top-up without meta.intended_amount:
  // 1. If Flutterwave added fee on top of a clean deposit (e.g. amount=100, charged_amount=102.15),
  //    credit the principal `amount` (100).
  if (
    amount > 0 &&
    chargedAmount > amount &&
    Number.isInteger(amount) &&
    !Number.isInteger(chargedAmount)
  ) {
    return amount;
  }

  // 2. If Flutterwave/bank deducted ~2%–3.5% fee from a small deposit tier (e.g. ₦97 or ₦97.85 from ₦100),
  //    restore the full intended tier so the wallet is never left at ₦97.
  const standardTiers = [100, 200, 250, 300, 500, 1000, 1500, 2000, 2500, 3000, 5000, 10000];
  for (const tier of standardTiers) {
    const tolerance = getFlutterwaveWalletFeeTolerance(tier);
    if (grossPaid < tier && grossPaid + tolerance >= tier) {
      return tier;
    }
  }

  return grossPaid;
}
