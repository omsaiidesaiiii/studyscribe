-- Migration 006: add the payments table so users can buy more credits
-- through Razorpay (test mode) and the balance is updated on completion.
--
-- Credit plan (fixed, offline): 50 INR -> 25 credits (2 credits / rupee),
-- plus 100 INR -> 50 credits and 200 INR -> 100 credits for add-ons.
-- Keeping the mapping here (not in the API) lets the web app render the
-- same plan list in both `GET /payments/plans` and `GET /payments/my`
-- without duplicating the mapping logic.

CREATE TABLE IF NOT EXISTS payments (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  razorpay_order_id TEXT NOT NULL UNIQUE,
  razorpay_payment_id TEXT,
  amount_paid INT NOT NULL CHECK (amount_paid > 0),
  currency TEXT NOT NULL DEFAULT 'INR',
  credits_added INT NOT NULL CHECK (credits_added > 0),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','completed','failed','cancelled')),
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- updated_at trigger (Postgres has no native `updated_at` column type).
CREATE OR REPLACE FUNCTION payments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS payments_updated_at_trigger ON payments;
CREATE TRIGGER payments_updated_at_trigger
BEFORE UPDATE ON payments
FOR EACH ROW
EXECUTE FUNCTION payments_updated_at();
