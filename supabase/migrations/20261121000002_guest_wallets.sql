-- ==============================================================================
-- Tamper-Proof Guest Wallets (localStorage device token + atomic server ledger)
-- Enables guest users to deposit funds via Flutterwave and buy Wi-Fi vouchers
-- without creating an account, while keeping all balance operations 100% atomic
-- and server-enforced via RLS + SECURITY DEFINER RPC.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.guest_wallets (
  guest_token TEXT PRIMARY KEY,
  balance NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (balance >= 0),
  email TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_guest_wallets_email ON public.guest_wallets(LOWER(email));
CREATE INDEX IF NOT EXISTS idx_guest_wallets_updated ON public.guest_wallets(updated_at DESC);

-- Enable Row Level Security (service_role only — clients cannot query or tamper directly)
ALTER TABLE public.guest_wallets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all_guest_wallets" ON public.guest_wallets;
CREATE POLICY "service_role_all_guest_wallets"
  ON public.guest_wallets
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON TABLE public.guest_wallets FROM PUBLIC, anon, authenticated;

-- Atomic race-condition-protected guest wallet adjustment RPC
CREATE OR REPLACE FUNCTION public.adjust_guest_wallet_balance(
  p_guest_token TEXT,
  p_amount NUMERIC,
  p_operation TEXT DEFAULT 'add',
  p_email TEXT DEFAULT NULL
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_balance NUMERIC;
BEGIN
  IF p_guest_token IS NULL OR LENGTH(TRIM(p_guest_token)) < 16 THEN
    RAISE EXCEPTION 'Invalid guest_token';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;

  IF p_operation = 'deduct' THEN
    UPDATE public.guest_wallets
    SET balance = balance - p_amount,
        updated_at = NOW()
    WHERE guest_token = p_guest_token
      AND balance >= p_amount
    RETURNING balance INTO v_new_balance;

    IF v_new_balance IS NULL THEN
      RETURN -1; -- Insufficient funds or wallet not found
    END IF;
  ELSIF p_operation = 'add' THEN
    INSERT INTO public.guest_wallets (guest_token, balance, email, updated_at)
    VALUES (p_guest_token, p_amount, NULLIF(LOWER(TRIM(COALESCE(p_email, ''))), ''), NOW())
    ON CONFLICT (guest_token) DO UPDATE
      SET balance = public.guest_wallets.balance + EXCLUDED.balance,
          email = COALESCE(EXCLUDED.email, public.guest_wallets.email),
          updated_at = NOW()
    RETURNING balance INTO v_new_balance;
  ELSE
    RAISE EXCEPTION 'Invalid operation: %', p_operation;
  END IF;

  RETURN v_new_balance;
END;
$$;

REVOKE ALL ON FUNCTION public.adjust_guest_wallet_balance(TEXT, NUMERIC, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.adjust_guest_wallet_balance(TEXT, NUMERIC, TEXT, TEXT) TO service_role;
