import { pool } from "../lib/db.js";
import type { PaymentRow } from "../types/payment.types.js";

export async function createPayment(data: {
  userId: string;
  razorpayOrderId: string;
  amountPaid: number;
  creditsAdded: number;
  currency?: string;
  notes?: string | null;
}): Promise<PaymentRow> {
  const result = await pool.query<PaymentRow>(
    `INSERT INTO payments (user_id, razorpay_order_id, amount_paid, credits_added, currency, notes)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      data.userId,
      data.razorpayOrderId,
      data.amountPaid,
      data.creditsAdded,
      data.currency ?? "INR",
      data.notes ?? null,
    ],
  );

  return result.rows[0];
}

export async function findByRazorpayOrderId(
  razorpayOrderId: string,
): Promise<PaymentRow | null> {
  const result = await pool.query<PaymentRow>(
    "SELECT * FROM payments WHERE razorpay_order_id = $1",
    [razorpayOrderId],
  );

  return result.rows[0] ?? null;
}

export async function findByUserIdAndStatus(
  userId: string,
  status?: string,
  limit = 20,
  offset = 0,
): Promise<PaymentRow[]> {
  const conditions: string[] = ["user_id = $1"];
  const values: unknown[] = [userId];

  if (status) {
    values.push(status);
    conditions.push(`status = $${values.length}`);
  }

  // Placeholders are numbered from the values actually bound: passing a $2 the
  // query never mentions makes Postgres reject the statement ("could not
  // determine data type of parameter $2") and the route 500s.
  const sql = `
    SELECT *
    FROM payments
    WHERE ${conditions.join(" AND ")}
    ORDER BY created_at DESC
    LIMIT $${values.length + 1} OFFSET $${values.length + 2}
  `;
  const result = await pool.query<PaymentRow>(
    sql,
    [...values, limit, offset],
  );

  return result.rows;
}

export async function countByUser(userId: string): Promise<number> {
  const result = await pool.query<{ count: string }>(
    "SELECT COUNT(*)::text AS count FROM payments WHERE user_id = $1",
    [userId],
  );

  return Number(result.rows[0]?.count ?? 0);
}

export async function markCompleted(
  razorpayOrderId: string,
  razorpayPaymentId: string,
  status: "completed",
): Promise<void> {
  await pool.query(
    `UPDATE payments
     SET razorpay_payment_id = $2,
         status = $3,
         updated_at = NOW()
     WHERE razorpay_order_id = $1 AND status = 'pending'`,
    [razorpayOrderId, razorpayPaymentId, status],
  );
}

export async function countCompletedByUser(userId: string): Promise<number> {
  const result = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM payments
     WHERE user_id = $1 AND status = 'completed'`,
    [userId],
  );

  return Number(result.rows[0]?.count ?? 0);
}
