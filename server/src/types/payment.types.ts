import type { PaymentStatus } from "../services/payments.service.js";

export type PaymentRow = {
  id: number;
  user_id: string;
  razorpay_order_id: string;
  razorpay_payment_id: string | null;
  amount_paid: number;
  currency: string;
  credits_added: number;
  status: PaymentStatus;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
};
