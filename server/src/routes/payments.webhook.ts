import express from "express";
import crypto from "crypto";
import { requireAuth } from "./../middlewares/requireAuth.js";
import { completePayment } from "./../services/payments.service.js";
import { AppError } from "../errors/AppError.js";
import type { NextFunction, Request, Response } from "express";
import { RAZORPAY_WEBHOOK_SECRET } from "../services/payments.service.js";

const router = express.Router();

/**
 * Razorpay webhook: mark a payment completed on a verified payment
 * notification and credit the user's balance.
 *
 * The `x-webhook-signature` header is a sha256 HMAC hex digest of the raw
 * request body over the webhook secret, which Razorpay signs with its
 * account's webhook key. Verifying it here is what stops a caller from
 * sending a fake `POST /payments/:id/verify` by themselves — a forged
 * signature is rejected with 401 before any credit is touched.
 *
 * Always verified before treating the event as live. It also doubles as the
 * idempotent path: a second notification for an already-completed order is
 * safely ignored by `markCompleted`'s `status = 'pending'` guard, and
 * `verifyOrFail` returns the already-credited balance.
 */
const rawJson = express.raw({ type: "application/json", limit: "1mb" });

/**
 * The router is mounted at `/payments/webhook`, so this handler answers that
 * public URL. The older `/payments/webhook/webhook` spelling is kept as an
 * alias: it is what the route path produced before, and a webhook already
 * configured in the Razorpay dashboard must keep working. Both paths run the
 * same signature check.
 */
async function handleWebhook(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
    try {
      const signature = (req.headers["x-webhook-signature"] as string) ?? "";

      if (!RAZORPAY_WEBHOOK_SECRET) {
        // No secret configured: refuse to process anything. Returning 503
        // here (rather than 200) makes the health of the webhook path visible
        // and prevents a misconfigured webhook from being silently accepted.
        res.status(503).json({
          success: false,
          message: "Razorpay webhook secret is not configured.",
        });
        return;
      }

      // The HMAC is computed over the exact bytes Razorpay sent. When the raw
      // middleware handled the request, req.body is a Buffer of those bytes —
      // re-stringifying a parsed object could reorder or reformat and break
      // the signature, so verify against the buffer whenever we have it.
      const raw = Buffer.isBuffer(req.body)
        ? req.body
        : Buffer.from(typeof req.body === "string" ? req.body : JSON.stringify(req.body), "utf8");

      const expected = crypto
        .createHmac("sha256", RAZORPAY_WEBHOOK_SECRET)
        .update(raw)
        .digest("hex");

      if (expected !== signature) {
        res.status(401).json({
          success: false,
          message: "Webhook signature verification failed.",
        });
        return;
      }

      // `data` is the event object Razorpay posts for `payment_intent.succeeded`
      // / `payment_link.completed` / `order.paid`.
      let parsed: { data?: Record<string, unknown> } | null = null;

      try {
        parsed = JSON.parse(raw.toString("utf8")) as {
          data?: Record<string, unknown>;
        } | null;
      } catch {
        // Not JSON — the shape check below rejects it.
      }

      const event = parsed?.data;
      if (!event || !event.payment_id) {
        res.status(400).json({ success: false, message: "Unexpected webhook payload." });
        return;
      }

      const paymentId = String(event.payment_id);
      const orderId = String(event.order_id ?? "");

      if (!orderId) {
        // Without the order id the event cannot be matched to a payment row.
        res.status(400).json({ success: false, message: "Unexpected webhook payload." });
        return;
      }

      // The signature is verified above, so this is a real payment: credit it.
      // `completePayment` is idempotent — it only credits rows still `pending`.
      const result = await completePayment(orderId, paymentId);

      res.status(200).json({
        success: true,
        verified: true,
        ...result,
        creditsAdded: result.creditsAdded,
        newBalance: result.newBalance,
      });
  } catch (error) {
    next(error);
  }
}

router.post("/", rawJson, handleWebhook);
router.post("/webhook", rawJson, handleWebhook);

export default router;
