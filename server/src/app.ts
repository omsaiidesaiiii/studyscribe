import express from "express";
import cors from "cors";
import authRouter from "./routes/auth.routes.js";
import generateRouter from "./routes/generate.routes.js";
import paymentsRouter from "./routes/payments.routes.js";
import paymentsWebhookRouter from "./routes/payments.webhook.js";
import { AppError } from "./errors/AppError.js";
import { pool } from "./lib/db.js";
import { redisConnection } from "./lib/queue.js";

export const app = express();

// The API is a pure JSON/token API (Bearer tokens, not cookies), so CORS only
// needs to allow the configured web origins — credentials stay off.
const allowedOrigins = (process.env.CORS_ORIGIN ?? "http://localhost:5273")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      // No Origin header: curl, the E2E script and server-to-server calls.
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new AppError(403, `Origin ${origin} is not allowed`));
    },
    // Browsers hide all but a handful of response headers on cross-origin
    // responses, which would leave the web app unable to read the sanitized PDF
    // filename the download endpoint sets.
    exposedHeaders: ["Content-Disposition"],
  }),
);

// Notes payloads are returned, not received, but a small cap keeps oversized
// bodies from being parsed in memory.
app.use(express.json({ limit: "1mb" }));

app.get("/", (_req, res) => {
  res.json({
    success: true,
    message: "YouTube Notes API is running",
    endpoints: ["GET /health", "POST /auth/*", "POST /generate", "GET /generate/history"],
  });
});

// Readiness probe used by the E2E script and by local development scripts.
app.get("/health", async (_req, res) => {
  const checks = { db: false, redis: false };

  try {
    await pool.query("SELECT 1");
    checks.db = true;
  } catch {
    checks.db = false;
  }

  try {
    checks.redis = (await redisConnection.ping()) === "PONG";
  } catch {
    checks.redis = false;
  }

  const healthy = checks.db && checks.redis;

  res.status(healthy ? 200 : 503).json({ success: healthy, checks });
});

app.use("/auth", authRouter);
app.use("/generate", generateRouter);

// Credit purchases.
app.use("/payments", paymentsRouter);

// Razorpay webhook: verifies the incoming signature and completes the order.
// Must not share the authenticated router — it accepts unauthenticated,
// unsigned POSTs from Razorpay's public IP ranges.
app.use("/payments/webhook", paymentsWebhookRouter);

// Centralized error handler — must be registered last, after all routes.
// Express recognizes this as an error handler specifically because it takes
// four arguments (err, req, res, next), not by any name/keyword.
app.use(
  (
    err: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    if (err instanceof AppError) {
      return res
        .status(err.statusCode)
        .json({ success: false, message: err.message });
    }

    console.error(err);
    res.status(500).json({ success: false, message: "Internal server error" });
  },
);
