// Credit plans for buying more notes credits through Razorpay.
//
// PRICING (per pack, not per credit): the bigger the pack, the cheaper each
// credit. A credit buys one new video; re-running a video you already
// generated is free.
//
//   Starter  25 credits  ₹50   ₹2.00 per credit
//   Popular  50 credits  ₹90   ₹1.80 per credit
//   Pro     100 credits  ₹160  ₹1.60 per credit
//
// The web app renders these from `GET /payments/plans`, so this list, the API
// order and the DB credits can never drift apart. Per-credit pricing is
// derived (`amountPaise / credits`), never stored twice.

export type CreditPlan = {
  id: string;
  label: string;
  amountPaise: number;
  credits: number;
  description: string;
};

/** Valid buying options — one line per pack. */
export const CREDIT_PLANS: CreditPlan[] = [
  {
    id: "starter",
    label: "Starter",
    amountPaise: 5000,
    credits: 25,
    description: "₹50 → 25 credits",
  },
  {
    id: "popular",
    label: "Popular",
    amountPaise: 9000,
    credits: 50,
    description: "₹90 → 50 credits",
  },
  {
    id: "pro",
    label: "Pro",
    amountPaise: 16000,
    credits: 100,
    description: "₹160 → 100 credits",
  },
];

/** What one credit costs in this pack, in rupees (for display). */
export function pricePerCredit(plan: CreditPlan): number {
  return plan.amountPaise / 100 / plan.credits;
}

/** µs to live for a one-time Razorpay order (10 minutes, standard). */
export const RAZORPAY_ORDER_LIFE_TIME_MS = 10 * 60 * 1000;

/** Live currency for a new Razorpay order (test-mode keys use "INR"). */
export const RAZORPAY_CURRENCY = "INR";

/** The plan a whole-basket settlement (e.g. "all-in") maps to. */
export const DEFAULT_PLAN_ID = "starter";
