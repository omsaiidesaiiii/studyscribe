import { z } from "zod";
import { CREDIT_PLANS } from "../shared/credit-plans.js";

const planIds = CREDIT_PLANS.map((plan) => plan.id);

export const paymentSchema = z.object({
  planId: z.enum(planIds).default("starter"),
});

export type PaymentInput = z.infer<typeof paymentSchema>;
