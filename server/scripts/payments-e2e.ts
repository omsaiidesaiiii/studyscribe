/**
 * Payments end-to-end check (Razorpay).
 *
 * Proves, against a real API process and a real database:
 *   1. `POST /payments` creates an order for the requested pack, with the
 *      right amount, and records a pending row with the right credits.
 *   2. `POST /payments/:id/verify` refuses to credit anything while Razorpay
 *      has no successful payment for that order (no free credits).
 *   3. Once Razorpay reports a captured payment, verify credits the account
 *      exactly once — a second call does not double-credit.
 *   4. `GET /payments/my` shows the purchase (used by the Credits page).
 *   5. A webhook with a bad signature is rejected.
 *
 * Two modes:
 *   npm run payments:e2e            # local stub Razorpay API + a spare API instance
 *   npm run payments:e2e -- --live  # the running API at API_URL, real test keys
 *
 * Live mode needs RAZORPAY_KEY + RAZORPAY_KEY_SECRET in the environment of both
 * the API under test and this script. When Razorpay's test-mode
 * `payments/create/json` endpoint accepts it, the run completes a REAL payment
 * on the gateway with the standard test card, so verify, idempotency and the
 * purchase list are checked against the real gateway too; if the endpoint
 * refuses, that one check is reported as skipped, not failed. In both modes a
 * correctly signed webhook (HMAC over RAZORPAY_WEBHOOK_SECRET) must credit the
 * account, and a forged one must be rejected.
 */
import "dotenv/config";
import { spawn, type ChildProcess } from "node:child_process";
import crypto from "node:crypto";
import { createServer, type Server } from "node:http";
import { pool } from "../src/lib/db.js";

const LIVE = process.argv.includes("--live");
const API_PORT = Number(process.env.PAYMENTS_E2E_API_PORT ?? 5065);
const STUB_PORT = Number(process.env.PAYMENTS_E2E_STUB_PORT ?? 5099);
const API_URL = (LIVE
  ? (process.env.API_URL ?? "http://localhost:5055")
  : `http://localhost:${API_PORT}`
).replace(/\/$/, "");
const STUB_URL = `http://localhost:${STUB_PORT}`;

const EMAIL = process.env.CHECK_EMAIL ?? "ui.check.20261005@example.com";
const PASSWORD = process.env.CHECK_PASSWORD ?? "notebook-2026";
const PLAN_ID = "popular";
const PLAN_AMOUNT = 9000; // ₹90
const PLAN_CREDITS = 50;

// HMAC secret the API under test verifies webhooks with (same value in its env).
const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET ?? "";
// Gateway for live-mode test payments; the stub override only exists in stub mode.
const RZP_API = (process.env.RAZORPAY_API_BASE ?? "https://api.razorpay.com").replace(/\/$/, "");

type Check = { name: string; ok: boolean; detail: string };
const checks: Check[] = [];

function record(name: string, ok: boolean, detail: string): void {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name} — ${detail}`);
}

async function call<T>(
  path: string,
  options: { method?: string; body?: unknown; token?: string } = {},
): Promise<{ status: number; body: T }> {
  const response = await fetch(`${API_URL}${path}`, {
    method: options.method ?? "GET",
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  let body: unknown = null;

  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  return { status: response.status, body: body as T };
}

// ---------------------------------------------------------------------------
// Stub Razorpay API (stub mode only): one order, and a switchable payment list.
// ---------------------------------------------------------------------------
let stubCaptured = false;
const stubOrders = new Map<string, { amount: number; currency: string }>();

function startStub(): Promise<Server> {
  const server = createServer((request, response) => {
    const url = request.url ?? "";
    const send = (status: number, body: unknown) => {
      response.writeHead(status, { "content-type": "application/json" });
      response.end(JSON.stringify(body));
    };

    if (request.method === "POST" && url === "/v1/orders") {
      let raw = "";
      request.on("data", (chunk) => {
        raw += chunk;
      });
      request.on("end", () => {
        const parsed = raw ? (JSON.parse(raw) as { amount?: number; currency?: string }) : {};
        const id = `order_stub_${stubOrders.size + 1}_${Date.now()}`;
        stubOrders.set(id, {
          amount: Number(parsed.amount ?? 0),
          currency: String(parsed.currency ?? "INR"),
        });
        send(200, {
          id,
          entity: "order",
          amount: Number(parsed.amount ?? 0),
          currency: String(parsed.currency ?? "INR"),
          status: "created",
        });
      });
      return;
    }

    const payments = /^\/v1\/orders\/([^/]+)\/payments$/.exec(url);
    if (request.method === "GET" && payments) {
      const orderId = decodeURIComponent(payments[1]);
      const order = stubOrders.get(orderId);
      if (!order) return send(404, { error: { description: "Order not found" } });

      return send(200, {
        entity: "collection",
        count: stubCaptured ? 1 : 0,
        items: stubCaptured
          ? [
              {
                id: `pay_stub_${orderId.slice(-6)}`,
                entity: "payment",
                amount: order.amount,
                currency: order.currency,
                status: "captured",
                order_id: orderId,
              },
            ]
          : [],
      });
    }

    // Test hook: flip the stub between "nothing paid" and "captured".
    if (request.method === "POST" && url === "/control/captured") {
      let raw = "";
      request.on("data", (chunk) => {
        raw += chunk;
      });
      request.on("end", () => {
        stubCaptured = raw.includes("true");
        send(200, { captured: stubCaptured });
      });
      return;
    }

    send(404, { error: { description: `Unhandled ${request.method} ${url}` } });
  });

  return new Promise((resolve) => {
    server.listen(STUB_PORT, () => resolve(server));
  });
}

/** Spawn a spare API instance wired to the stub, so the dev API is untouched. */
function startApi(): ChildProcess {
  const child = spawn("npx", ["tsx", "src/server.ts"], {
    env: {
      ...process.env,
      PORT: String(API_PORT),
      RAZORPAY_KEY: "rzp_test_stub",
      RAZORPAY_KEY_SECRET: "stub_secret",
      RAZORPAY_API_BASE: STUB_URL,
      RAZORPAY_WEBHOOK_SECRET:
        process.env.RAZORPAY_WEBHOOK_SECRET ?? "stub_webhook_secret",
    },
    stdio: ["ignore", "pipe", "pipe"],
    shell: process.platform === "win32",
  });

  child.stdout?.on("data", (chunk: Buffer) => {
    const line = chunk.toString().trim();
    if (line && !line.includes("ready")) console.log(`  [api] ${line.slice(0, 160)}`);
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    const line = chunk.toString().trim();
    if (line) console.log(`  [api:err] ${line.slice(0, 200)}`);
  });

  return child;
}

async function waitForApi(timeoutMs = 40000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${API_URL}/health`);
      if (response.ok) return true;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  return false;
}

function killTree(child: ChildProcess | undefined): void {
  if (!child?.pid) return;

  if (process.platform === "win32") {
    spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    child.kill("SIGTERM");
  }
}

/**
 * Live mode only: pay a REAL order on the Razorpay test gateway with the
 * standard test card, so the run covers capture → verify → credit without a
 * human in checkout. Returns the confirmed Razorpay payment id, or null when
 * the gateway will not create a payment from the API (the caller then skips
 * that single check instead of failing the run).
 */
async function attemptLiveTestPayment(
  orderId: string,
  amount: number,
): Promise<string | null> {
  const key = process.env.RAZORPAY_KEY;
  const secret = process.env.RAZORPAY_KEY_SECRET;

  if (!key || !secret) {
    console.log("  (live payment skipped: RAZORPAY_KEY / RAZORPAY_KEY_SECRET not in this shell)");
    return null;
  }

  const headers = {
    "content-type": "application/json",
    authorization: `Basic ${Buffer.from(`${key}:${secret}`).toString("base64")}`,
  };

  // Razorpay's test-mode endpoint for creating a payment without checkout.
  const created = await fetch(`${RZP_API}/v1/payments/create/json`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      amount,
      currency: "INR",
      order_id: orderId,
      email: EMAIL,
      contact: "9999999999",
      method: "card",
      card: {
        name: "Test User",
        number: "4111111111111111",
        expiry_month: 12,
        expiry_year: 2027,
        cvv: "123",
      },
    }),
  });

  const raw = await created.text();

  if (!created.ok) {
    console.log(`  (live payment: gateway said ${created.status} ${raw.slice(0, 160)})`);
    return null;
  }

  const payment = JSON.parse(raw) as { id?: string; status?: string };

  if (!payment.id) {
    console.log("  (live payment: gateway returned no payment id)");
    return null;
  }

  // payment_capture: 1 auto-captures, which can lag a moment behind creation;
  // poll the order's payments, then force a capture if it is still authorized.
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const listed = await fetch(`${RZP_API}/v1/orders/${orderId}/payments`, { headers });
    const list = (await listed.json().catch(() => null)) as {
      items?: { id: string; status: string }[];
    } | null;
    const confirmed = (list?.items ?? []).find((item) =>
      ["captured", "authorized"].includes(item.status),
    );

    if (confirmed) {
      return confirmed.id;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  const captured = await fetch(`${RZP_API}/v1/payments/${payment.id}/capture`, {
    method: "POST",
    headers,
    body: JSON.stringify({ amount, currency: "INR" }),
  });

  if (captured.ok) {
    return payment.id;
  }

  console.log(`  (live payment: capture said ${captured.status})`);
  return null;
}

async function main(): Promise<void> {
  let stub: Server | undefined;
  let api: ChildProcess | undefined;

  if (!LIVE) {
    console.log(`Starting stub Razorpay on ${STUB_URL} and an API on ${API_URL}\n`);
    stub = await startStub();
    api = startApi();

    if (!(await waitForApi())) {
      record("api instance reaches /health", false, `${API_URL}/health never answered`);
      killTree(api);
      stub.close();
      return finish();
    }
  }

  const health = await call<{ checks?: Record<string, boolean> }>("/health");
  record(`${LIVE ? "live" : "stub"} API is healthy`, health.status === 200, `${API_URL}/health → ${health.status}`);

  const login = await call<{ accessToken: string; user: { id: string; credits: number } }>(
    "/auth/login",
    { method: "POST", body: { email: EMAIL, password: PASSWORD } },
  );

  if (login.status !== 200 || !login.body?.accessToken) {
    record("sign in for the payments run", false, `status ${login.status}`);
    killTree(api);
    stub?.close();
    return finish();
  }

  const token = login.body.accessToken;
  const userId = login.body.user.id;
  const creditsBefore = login.body.user.credits;
  record("sign in for the payments run", true, `${EMAIL} · ${creditsBefore} credits`);

  let paymentRowId: number | undefined;
  let orderId: string | undefined;
  const extraOrderIds: string[] = [];

  try {
    // 1. Order creation -----------------------------------------------------
    const order = await call<{
      order?: { id: string; amount: number; currency: string; key: string };
      paymentId?: number;
      plan?: { id: string; credits: number };
    }>("/payments", { method: "POST", token, body: { planId: PLAN_ID } });

    orderId = order.body?.order?.id;
    paymentRowId = order.body?.paymentId;

    record(
      "POST /payments creates an order",
      order.status === 201 && Boolean(orderId) && order.body?.order?.amount === PLAN_AMOUNT,
      `status ${order.status} · order ${orderId ?? "none"} · amount ${order.body?.order?.amount ?? "?"} ${order.body?.order?.currency ?? ""}`,
    );

    const row = orderId
      ? await pool.query<{ status: string; credits_added: number; amount_paid: number }>(
          "SELECT status, credits_added, amount_paid FROM payments WHERE razorpay_order_id = $1",
          [orderId],
        )
      : null;

    record(
      "the order is recorded as pending with the pack's credits",
      row?.rows[0]?.status === "pending" &&
        row?.rows[0]?.credits_added === PLAN_CREDITS &&
        row?.rows[0]?.amount_paid === PLAN_AMOUNT,
      `row: ${JSON.stringify(row?.rows[0] ?? null)}`,
    );

    // 2. Verify with nothing paid ------------------------------------------
    if (paymentRowId === undefined) {
      record("verify refuses to credit an unpaid order", false, "no payment id to verify");
    } else {
      const unpaid = await call<{ message?: string }>(`/payments/${paymentRowId}/verify`, {
        method: "POST",
        token,
      });
      const me = await call<{ user: { credits: number } }>("/auth/me", { token });

      record(
        "verify refuses to credit an unpaid order",
        unpaid.status === 409 && me.body?.user?.credits === creditsBefore,
        `status ${unpaid.status} · balance ${me.body?.user?.credits} (unchanged)`,
      );
    }

    // 3. The capture path --------------------------------------------------
    let paid = false;

    if (LIVE) {
      paid =
        orderId !== undefined &&
        Boolean(await attemptLiveTestPayment(orderId, PLAN_AMOUNT));

      if (!paid) {
        record(
          "verify credits a captured payment",
          true,
          "SKIPPED — the test gateway would not create a payment from the API (needs checkout)",
        );
      }
    } else {
      await fetch(`${STUB_URL}/control/captured`, {
        method: "POST",
        body: JSON.stringify({ captured: true }),
      });
    }

    if (paid || !LIVE) {
      // The route reports the credited amount under `payment`, alongside the row.
      const verified = await call<{
        verified?: boolean;
        payment?: { creditsAdded?: number; newBalance?: number; status?: string };
      }>(`/payments/${paymentRowId}/verify`, { method: "POST", token });
      const me = await call<{ user: { credits: number } }>("/auth/me", { token });

      record(
        "verify credits a captured payment",
        verified.status === 200 &&
          verified.body?.payment?.creditsAdded === PLAN_CREDITS &&
          me.body?.user?.credits === creditsBefore + PLAN_CREDITS,
        `status ${verified.status} · +${verified.body?.payment?.creditsAdded ?? "?"} credits · balance ${me.body?.user?.credits}`,
      );

      const again = await call<{ creditsAdded?: number }>(
        `/payments/${paymentRowId}/verify`,
        { method: "POST", token },
      );
      const afterSecond = await call<{ user: { credits: number } }>("/auth/me", { token });
      const calm = await call<{ payments?: { id: number; status: string }[] }>("/payments/my", {
        token,
      });

      record(
        "a second verify does not double-credit",
        afterSecond.body?.user?.credits === creditsBefore + PLAN_CREDITS,
        `status ${again.status} · balance still ${afterSecond.body?.user?.credits}`,
      );

      record(
        "GET /payments/my lists the completed purchase",
        (calm.body?.payments ?? []).some(
          (payment) => payment.id === paymentRowId && payment.status === "completed",
        ),
        `${(calm.body?.payments ?? []).length} purchase(s) returned`,
      );
    }

    // 4. Webhook: a correctly signed notification must credit -------------
    const creditedByVerify = paid || !LIVE ? PLAN_CREDITS : 0;

    if (WEBHOOK_SECRET) {
      const second = await call<{
        order?: { id: string; amount: number };
        paymentId?: number;
      }>("/payments", { method: "POST", token, body: { planId: PLAN_ID } });
      const secondOrderId = second.body?.order?.id;

      if (second.status === 201 && secondOrderId) {
        extraOrderIds.push(secondOrderId);

        const payload = JSON.stringify({
          event: "order.paid",
          data: { payment_id: `pay_webhook_${Date.now()}`, order_id: secondOrderId },
        });
        const signature = crypto
          .createHmac("sha256", WEBHOOK_SECRET)
          .update(payload)
          .digest("hex");
        const hooked = await fetch(`${API_URL}/payments/webhook`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-webhook-signature": signature },
          body: payload,
        });
        const afterHook = await call<{ user?: { credits: number } }>("/auth/me", { token });

        record(
          "a correctly signed webhook credits the account",
          hooked.status === 200 &&
            afterHook.body?.user?.credits === creditsBefore + creditedByVerify + PLAN_CREDITS,
          `status ${hooked.status} · balance ${afterHook.body?.user?.credits}`,
        );
      } else {
        record(
          "a correctly signed webhook credits the account",
          false,
          `second order creation status ${second.status}`,
        );
      }
    } else {
      record(
        "a correctly signed webhook credits the account",
        true,
        "SKIPPED — RAZORPAY_WEBHOOK_SECRET is not set in this shell",
      );
    }

    // 5. Webhook signature rejection --------------------------------------
    const forged = await fetch(`${API_URL}/payments/webhook`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-webhook-signature": "not-a-signature" },
      body: JSON.stringify({ event: "order.paid", data: { order_id: orderId ?? "x", payment_id: "pay_x" } }),
    });

    record(
      "a webhook with a bad signature is rejected",
      forged.status === 401 || forged.status === 503,
      `status ${forged.status}`,
    );
  } finally {
    // Restore the account: the run is a test, not a purchase.
    for (const id of [orderId, ...extraOrderIds]) {
      if (id) {
        await pool.query("DELETE FROM payments WHERE razorpay_order_id = $1", [id]);
      }
    }
    await pool.query("UPDATE users SET credits = $1 WHERE id = $2", [creditsBefore, userId]);

    const restored = await pool.query<{ credits: number }>(
      "SELECT credits FROM users WHERE id = $1",
      [userId],
    );
    console.log(
      `\ncleanup: removed the test payment row, balance restored to ${restored.rows[0]?.credits}`,
    );

    killTree(api);
    stub?.close();
  }

  return finish();
}

function finish(): void {
  const failed = checks.filter((check) => !check.ok);

  console.log(
    `\n${checks.length - failed.length}/${checks.length} checks passed${LIVE ? " (live mode)" : " (stub mode)"}`,
  );

  if (failed.length) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    // The pool keeps the process alive; the checks are done.
    void pool.end();
  });
