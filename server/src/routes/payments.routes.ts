import express from "express";
import { requireAuth } from "../middlewares/requireAuth.js";
import { validate } from "../middlewares/validate.js";
import { createRazorpayOrder, verifyOrFail, PAYMENT_PLAN_ID } from "../services/payments.service.js";
import { paymentSchema } from "../schemas/payment.schema.js";
import { findByUserIdAndStatus, countByUser, createPayment } from "../repositories/payments.repository.js";
import { AppError } from "../errors/AppError.js";
import paymentsWebhookRouter from "./payments.webhook.js";
import { CREDIT_PLANS } from "../shared/credit-plans.js";
import type { PaymentStatus } from "../services/payments.service.js";
import { Request, Response, NextFunction } from "express";
import { AuthedRequest } from "../middlewares/requireAuth.js";

const router = express.Router();

/** Public: the list of credit plans a user can buy. */
router.get("/plans", (_req, res) => {
  res.status(200).json({
    success: true,
    plans: CREDIT_PLANS.map((plan) => ({
      ...plan,
      priceInRupees: plan.amountPaise / 100,
    })),
  });
});

/** List a user's payment attempts. */
router.get("/my", requireAuth, async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const limit = Math.min(req.query.limit ? Number(req.query.limit) : 20, 50);
    const offset = Math.min(req.query.offset ? Number(req.query.offset) : 0, 1000);

    const payments = await findByUserIdAndStatus(req.userId!, undefined, limit, offset);
    const total = await countByUser(req.userId!);

    res.status(200).json({
      success: true,
      payments,
      pagination: { limit, offset, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    next(error);
  }
});

/** Start a Razorpay checkout for a credit plan. */
router.post("/", requireAuth, validate(paymentSchema, "body"), async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.userId!;
    const planId = (req.body as { planId?: string }).planId ?? PAYMENT_PLAN_ID;

    const { orderId, key, amount, currency } = await createRazorpayOrder(planId);

    const payment = await createPayment({
      userId,
      razorpayOrderId: orderId,
      amountPaid: amount,
      creditsAdded: CREDIT_PLANS.find((p) => p.id === planId)!.credits,
      currency,
      notes: `Credit purchase via Razorpay (test mode)`,
    });

    res.status(201).json({
      success: true,
      paymentId: payment.id,
      order: { id: orderId, amount, currency, key },
      plan: CREDIT_PLANS.find((p) => p.id === planId),
      message: "Ready to pay — open Razorpay checkout to complete the purchase.",
    });
  } catch (error) {
    next(error);
  }
});

/** Verify a payment that already landed (e.g. after a webhook fires). */
router.post("/:id/verify", requireAuth, async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const paymentId = req.params.id;

    // Find the payment the caller owns.
    const payment = await findByUserIdAndStatus(req.userId!, undefined, 10, 0).then((rows) =>
      rows.find((p) => p.id === Number(paymentId)),
    );

    if (!payment) {
      throw new AppError(404, "Payment not found");
    }

    if (payment.status !== "pending") {
      return res.status(200).json({
        success: true,
        verified: false,
        payment: { ...payment, verified: payment.status === "completed" },
      });
    }

    const result = await verifyOrFail(payment.razorpay_order_id);

    res.status(200).json({
      success: true,
      verified: true,
      payment: {
        id: payment.id,
        status: "completed" as PaymentStatus,
        creditsAdded: result.creditsAdded,
        newBalance: result.newBalance,
        createdAt: payment.created_at,
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
