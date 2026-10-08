import Razorpay from "razorpay";
import { AppError } from "../errors/AppError.js";
import { createPayment } from "../repositories/payments.repository.js";
import { findByRazorpayOrderId, markCompleted } from "../repositories/payments.repository.js";
import { addCredits, findUserById } from "../repositories/user.repository.js";
import { CREDIT_PLANS } from "../shared/credit-plans.js";
import { logger } from "../lib/logger.js";

// Plan used when a caller does not name one (Starter: 50 INR -> 25 credits).
export const PAYMENT_PLAN_ID = "starter";

export type PaymentStatus = "pending" | "completed" | "failed" | "cancelled";

// µs to live for a one-time Razorpay order (10 minutes).
export const RAZORPAY_ORDER_LIFE_TIME_MS = 10 * 60 * 1000;

// Live currency for a new Razorpay order (test-mode keys use "INR").
export const RAZORPAY_CURRENCY = "INR";

export const RAZORPAY_KEY = process.env.RAZORPAY_KEY;
// The SDK authenticates every request with key_id + key_secret as basic auth.
export const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
export const RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET;

/**
 * Test-only escape hatch: point the SDK at a local stub instead of
 * api.razorpay.com, used by `scripts/payments-e2e.ts`. The SDK hard-codes its
 * host and ignores a constructor `hostUrl`, so the axios instance it creates is
 * re-pointed here. Without the variable set, nothing is touched.
 */
const RAZORPAY_API_BASE = process.env.RAZORPAY_API_BASE;

// Set up the Razorpay SDK. No-op when either credential is missing — a
// key_id without its secret cannot authenticate, so an order request would
// fail with a confusing 401 instead of a clear "not configured".
export const razorpayClient =
  RAZORPAY_KEY && RAZORPAY_KEY_SECRET
    ? new Razorpay({ key_id: RAZORPAY_KEY, key_secret: RAZORPAY_KEY_SECRET })
    : null;

if (razorpayClient && RAZORPAY_API_BASE) {
  const client = razorpayClient.api as unknown as {
    rq?: { defaults?: { baseURL?: string } };
  };

  if (client.rq?.defaults) {
    client.rq.defaults.baseURL = RAZORPAY_API_BASE;
    logger.warn("Razorpay API base overridden — test stub in use", {
      base: RAZORPAY_API_BASE,
    });
  }
}

if (RAZORPAY_KEY && !RAZORPAY_KEY_SECRET) {
  logger.warn(
    "RAZORPAY_KEY is set but RAZORPAY_KEY_SECRET is missing — payments are disabled until both are present.",
  );
}

/** Seed a Razorpay order for a plan so the UI can open checkout. */
export async function createRazorpayOrder(planId: string) {
  if (!razorpayClient) {
    throw new AppError(
      503,
      "Razorpay is not configured — set RAZORPAY_KEY and RAZORPAY_KEY_SECRET.",
    );
  }

  const plan = CREDIT_PLANS.find((p) => p.id === planId);

  if (!plan) {
    throw new AppError(404, `Unknown plan "${planId}"`);
  }

  const options = {
    amount: plan.amountPaise,
    currency: RAZORPAY_CURRENCY,
    receipt: `notewise-${planId}-${Date.now()}`,
    payment_capture: 1, // auto-capture the payment
  };

  const response = await razorpayClient.orders.create(options);

  if (!response?.id) {
    logger.error("Razorpay order creation returned no id", { response, planId });
    throw new AppError(502, "Razorpay order creation failed");
  }

  return {
    orderId: response.id,
    key: (RAZORPAY_KEY as string)!,
    amount: parseInt(String(response.amount), 10),
    currency: response.currency,
  };
}

/**
 * Mark a payment as completed and add the plan's credits to the user's
 * balance.
 *
 * Two callers, both of which know a real payment happened first:
 * - the webhook, whose HMAC signature has already been verified; and
 * - `verifyOrFail`, which asks Razorpay about the order before calling this.
 *
 * Idempotent: `markCompleted` only touches rows that are still `pending`, so a
 * duplicate webhook or a second verify credits the account exactly once.
 */
export async function completePayment(
  razorpayOrderId: string,
  razorpayPaymentId: string,
) {
  const row = await findByRazorpayOrderId(razorpayOrderId);

  if (!row) {
    throw new AppError(404, "Payment not found");
  }

  if (row.status === "completed") {
    const user = await findUserById(row.user_id);
    return {
      creditsAdded: row.credits_added,
      newBalance: user?.credits ?? 0,
      alreadyCompleted: true,
    };
  }

  if (row.status !== "pending") {
    throw new AppError(
      409,
      `Payment already ${row.status === "cancelled" ? "cancelled" : row.status}`,
    );
  }

  await markCompleted(razorpayOrderId, razorpayPaymentId, "completed");
  await addCredits(row.user_id, row.credits_added);

  const user = await findUserById(row.user_id);

  return {
    creditsAdded: row.credits_added,
    newBalance: user?.credits ?? row.credits_added,
    alreadyCompleted: false,
  };
}

/** Payment states Razorpay reports for money that actually arrived. */
const CONFIRMED_PAYMENT_STATUSES = new Set(["captured", "authorized"]);

/**
 * Ask Razorpay whether the order has a successful payment, and return its id.
 * Returns null when the order exists but nothing has been paid yet.
 */
async function findConfirmedPaymentId(
  razorpayOrderId: string,
): Promise<string | null> {
  if (!razorpayClient) {
    throw new AppError(
      503,
      "Razorpay is not configured — set RAZORPAY_KEY and RAZORPAY_KEY_SECRET.",
    );
  }

  const response = await razorpayClient.orders.fetchPayments(razorpayOrderId);
  const items = Array.isArray(response?.items) ? response.items : [];
  const confirmed = items.find((item) =>
    CONFIRMED_PAYMENT_STATUSES.has(String(item.status)),
  );

  return confirmed ? String(confirmed.id) : null;
}

/**
 * Credit the account for a payment Razorpay confirms.
 *
 * The payment is looked up at Razorpay — the caller cannot vouch for it — so a
 * `POST /payments/:id/verify` from a browser cannot mint credits on its own.
 */
export async function verifyOrFail(razorpayOrderId: string) {
  const paymentId = await findConfirmedPaymentId(razorpayOrderId);

  if (!paymentId) {
    throw new AppError(
      409,
      "Razorpay has not confirmed a payment for this order yet.",
    );
  }

  return completePayment(razorpayOrderId, paymentId);
}
