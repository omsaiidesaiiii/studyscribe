import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { pool } from "../lib/db.js";
import { createPayment } from "../repositories/payments.repository.js";
import { findByRazorpayOrderId } from "../repositories/payments.repository.js";
import { addCredits } from "../repositories/user.repository.js";
import { decrementUserCredits } from "../repositories/user.repository.js";

let dbAvailable = false;

beforeAll(async () => {
  try {
    const client = await pool.connect();
    client.release();
    dbAvailable = true;
  } catch {
    console.warn("PostgreSQL not reachable; skipping payment repository integration tests.");
  }
});

function seedUser(email: string, name: string, credits = 5) {
  return pool.query<{ id: string }>(
    "INSERT INTO users (id, email, password_hash, name, credits) VALUES (gen_random_uuid(), $1, $2, $3, $4) RETURNING id",
    [email, null, name, credits],
  );
}

describe("payments repository", () => {
  it("creates a payment and can read it back by order id", async (ctx) => {
    if (!dbAvailable) {
      ctx.skip();
      return;
    }
    const { rows } = await pool.query<{ id: string }>(
      "INSERT INTO users (id, email, password_hash, name, credits) VALUES (gen_random_uuid(), $1, $2, $3, $4) RETURNING id",
      ["paytest" + Date.now() + "@example.com", "dummy-google-id", "Test User", 5],
    );
    const userId = rows[0].id;

    const orderId = `order_${Date.now()}`;
    const payment = await createPayment({
      userId,
      razorpayOrderId: orderId,
      amountPaid: 5000,
      creditsAdded: 25,
      currency: "INR",
      notes: "Credit purchase",
    });

    expect(payment.id).toBeGreaterThan(0);
    expect(payment.razorpay_order_id).toBe(orderId);
    expect(payment.amount_paid).toBe(5000);
    expect(payment.credits_added).toBe(25);
    expect(payment.status).toBe("pending");

    const found = await findByRazorpayOrderId(orderId);
    expect(found).toMatchObject({ status: "pending", credits_added: 25 });
  });

  it("findByRazorpayOrderId returns null for a missing order", async (ctx) => {
    if (!dbAvailable) {
      ctx.skip();
      return;
    }
    await expect(findByRazorpayOrderId(`nonexistent_${Date.now()}`)).resolves.toBeNull();
  });
});

describe("user credits (addCredits)", () => {
  it("adds credits to a user", async (ctx) => {
    if (!dbAvailable) {
      ctx.skip();
      return;
    }
    const { rows } = await pool.query<{ id: string }>(
      "INSERT INTO users (id, email, password_hash, name, credits) VALUES (gen_random_uuid(), $1, $2, $3, $4) RETURNING id",
      ["credit-add-user" + Date.now() + "@example.com", "dummy-google-id", "Credit User", 5],
    );
    const userId = rows[0].id;

    await addCredits(userId, 25);

    const updated = await pool.query<{ credits: number }>(
      "SELECT credits FROM users WHERE id = $1",
      [userId],
    );

    expect(updated.rows[0].credits).toBe(30);
  });

  it("decrements credits correctly", async (ctx) => {
    if (!dbAvailable) {
      ctx.skip();
      return;
    }
    const { rows } = await pool.query<{ id: string }>(
      "INSERT INTO users (id, email, password_hash, name, credits) VALUES (gen_random_uuid(), $1, $2, $3, $4) RETURNING id",
      ["dec-user" + Date.now() + "@example.com", "dummy-google-id", "Dec User", 10],
    );
    const userId = rows[0].id;

    await decrementUserCredits(userId);

    const updated = await pool.query<{ credits: number }>(
      "SELECT credits FROM users WHERE id = $1",
      [userId],
    );

    expect(updated.rows[0].credits).toBe(9);
  });
});

afterAll(async () => {
  if (dbAvailable) {
    await pool.end();
  }
});

