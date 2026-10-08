/**
 * Full-stack end-to-end check against a running API + worker + Postgres + Redis.
 *
 * Covers: health, auth (register/login/me/refresh), generation queueing,
 * polling to completion, persisted notes JSON, the Express 5 history/pagination
 * path, credit accounting, the Redis cache hit path and the PDF download.
 *
 * Usage: npm run e2e   (API_URL defaults to http://localhost:5055)
 */
import "dotenv/config";
import { PDFDocument } from "pdf-lib";
import { clearCachedGeneration } from "../src/lib/cache.js";
import { extractVideoId } from "../src/services/transcript.service.js";
import { isSupportedModel } from "../src/shared/models.js";

const API_URL = (process.env.API_URL ?? "http://localhost:5055").replace(/\/$/, "");
const VIDEO_URL =
  process.env.E2E_VIDEO_URL ?? "https://www.youtube.com/watch?v=aircAruvnKk";
const RUN_VIDEO_ID = extractVideoId(VIDEO_URL);
const RUN_MODEL = "gemini-3.8-flash";
const RUN_LANGUAGE = "english";

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

async function main(): Promise<void> {
  const health = await call<{ success: boolean; checks: Record<string, boolean> }>(
    "/health",
  );
  record(
    "health",
    health.status === 200 && health.body.checks.db && health.body.checks.redis,
    `status ${health.status}, db=${health.body.checks?.db}, redis=${health.body.checks?.redis}`,
  );

  if (health.status !== 200) {
    throw new Error("Infrastructure is not ready — run `npm run dev:infra` and `npm run migrate` first.");
  }

  const email = `e2e_${Date.now()}@example.com`;
  const password = "e2e-password-123";

  const register = await call<{
    user: { id: string; credits: number };
    accessToken: string;
    refreshToken: string;
  }>("/auth/register", {
    method: "POST",
    body: { name: "E2E Runner", email, password },
  });

  record(
    "register",
    register.status === 201 && Boolean(register.body.accessToken),
    `status ${register.status}, credits=${register.body.user?.credits}`,
  );

  const token = register.body.accessToken;

  const login = await call<{ accessToken: string }>("/auth/login", {
    method: "POST",
    body: { email, password },
  });
  record("login", login.status === 200 && Boolean(login.body.accessToken), `status ${login.status}`);

  const me = await call<{ user: { credits: number } }>("/auth/me", { token });
  const creditsBefore = me.body.user?.credits ?? -1;
  record("me", me.status === 200, `credits before=${creditsBefore}`);

  const refresh = await call<{ accessToken: string }>("/auth/refresh", {
    method: "POST",
    body: { refreshToken: register.body.refreshToken },
  });
  record("refresh", refresh.status === 200 && Boolean(refresh.body.accessToken), `status ${refresh.status}`);

  const models = await call<{ models: { id: string }[] }>("/generate/models");
  record("models endpoint", models.status === 200 && models.body.models.length > 0, `${models.body.models?.length} models`);

  const badUrl = await call("/generate", { method: "POST", body: { url: "https://vimeo.com/1" }, token });
  record("rejects non-YouTube urls", badUrl.status === 400, `status ${badUrl.status}`);

  // Clear the notebook cache first: the cold path (Gemini + PDF render + one
  // credit charged) is what this run is here to verify, and a warm cache from a
  // previous run would silently turn it into a free cache hit instead.
  await clearCachedGeneration(RUN_VIDEO_ID, RUN_LANGUAGE, RUN_MODEL);

  const queued = await call<{ generationId: string }>("/generate", {
    method: "POST",
    body: { url: VIDEO_URL, language: RUN_LANGUAGE, model: RUN_MODEL },
    token,
  });

  record("queue generation", queued.status === 202 && Boolean(queued.body.generationId), `status ${queued.status}`);

  const id = queued.body.generationId;
  const started = Date.now();
  let generation: {
    status: string;
    notes: { pages: { blocks: unknown[] }[] } | null;
    pageCount: number;
    model: string;
    errorMessage: string | null;
    wasCached: boolean;
  } | null = null;

  // A cold generation can legitimately take minutes: a 503 on the preferred
  // model pushes the work onto a fallback model, and a validation failure adds
  // a repair pass on top of that.
  const pollBudgetMs = 10 * 60 * 1000;
  let lastLoggedStatus = "";

  while (Date.now() - started < pollBudgetMs) {
    const poll = await call<{ generation: typeof generation }>(`/generate/${id}`, { token });
    generation = poll.body.generation;

    if (generation?.status !== lastLoggedStatus) {
      lastLoggedStatus = generation?.status ?? "unknown";
      console.log(
        `      ... status=${lastLoggedStatus} after ${Math.round((Date.now() - started) / 1000)}s`,
      );
    }

    if (generation?.status === "done" || generation?.status === "failed") break;

    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  const seconds = Math.round((Date.now() - started) / 1000);
  record(
    "generation completes",
    generation?.status === "done",
    `status=${generation?.status} in ${seconds}s${generation?.errorMessage ? ` (${generation.errorMessage})` : ""}`,
  );

  record(
    "notes persisted",
    Boolean(generation?.notes?.pages?.length) &&
      generation!.notes!.pages.every((page) => page.blocks.length > 0),
    `${generation?.notes?.pages?.length ?? 0} pages, ${generation?.pageCount ?? 0} reported`,
  );

  // The preferred model is frequently overloaded, in which case the fallback
  // chain answers instead and that model is what gets recorded.
  record(
    "model recorded",
    Boolean(generation?.model) && isSupportedModel(generation!.model),
    `model=${generation?.model}` +
      (generation?.model === RUN_MODEL ? "" : ` (fell back from ${RUN_MODEL})`),
  );

  record(
    "cold run was charged",
    generation?.wasCached === false,
    `wasCached=${generation?.wasCached}`,
  );

  const history = await call<{ total: number; totalPages: number; generations: { id: string }[] }>(
    "/generate/history?page=1&limit=5",
    { token },
  );
  record(
    "history + pagination",
    history.status === 200 &&
      history.body.total >= 1 &&
      history.body.generations.some((item) => item.id === id),
    `status ${history.status}, total=${history.body.total}, totalPages=${history.body.totalPages}`,
  );

  const pdfResponse = await fetch(`${API_URL}/generate/${id}/download`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const pdfBuffer = Buffer.from(await pdfResponse.arrayBuffer());
  const isPdf = pdfBuffer.subarray(0, 5).toString() === "%PDF-";

  record(
    "pdf download",
    pdfResponse.status === 200 && isPdf && pdfBuffer.byteLength > 20_000,
    `status ${pdfResponse.status}, ${Math.round(pdfBuffer.byteLength / 1024)} KB, header=${isPdf}`,
  );

  const disposition = pdfResponse.headers.get("content-disposition") ?? "";
  record("pdf filename header", /filename="[^"]+\.pdf"/.test(disposition), disposition || "(missing)");

  // Never let a missing PDF abort the run: report it as a failed check and keep
  // going so the remaining checks still produce a verdict.
  if (pdfResponse.status === 200 && isPdf) {
    const parsed = await PDFDocument.load(pdfBuffer);
    record("pdf page count", parsed.getPageCount() >= 1, `${parsed.getPageCount()} A4 pages`);
  } else {
    record("pdf page count", false, "skipped — no PDF returned (see 'pdf download')");
  }

  const after = await call<{ user: { credits: number } }>("/auth/me", { token });
  const creditsAfter = after.body.user?.credits ?? -1;
  record("credits decremented once", creditsAfter === creditsBefore - 1, `${creditsBefore} -> ${creditsAfter}`);

  // Same video + language + model must be served from Redis, for free.
  const cached = await call<{ generationId: string }>("/generate", {
    method: "POST",
    body: { url: VIDEO_URL, language: RUN_LANGUAGE, model: RUN_MODEL },
    token,
  });

  const cachedGeneration = await call<{ generation: { status: string; wasCached: boolean } }>(
    `/generate/${cached.body.generationId}`,
    { token },
  );

  record(
    "redis cache hit is instant",
    cachedGeneration.body.generation?.status === "done" &&
      cachedGeneration.body.generation?.wasCached === true,
    `status=${cachedGeneration.body.generation?.status}, ` +
      `wasCached=${cachedGeneration.body.generation?.wasCached}`,
  );

  const afterCached = await call<{ user: { credits: number } }>("/auth/me", { token });
  record(
    "cache hit is free",
    (afterCached.body.user?.credits ?? -1) === creditsAfter,
    `${creditsAfter} -> ${afterCached.body.user?.credits}`,
  );

  const unauthorized = await call(`/generate/${id}`);
  record("auth is enforced", unauthorized.status === 401, `status ${unauthorized.status}`);

  const failed = checks.filter((check) => !check.ok);
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);

  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("\nE2E run failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
