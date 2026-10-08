// The Gemini models offered in the UI, and the fallback order used when a
// model is rate limited or temporarily unavailable.
//
// Verified against the live Gemini API models endpoint (AI Studio) — every id
// below is served by the Interactions API.

export type ModelOption = {
  id: string;
  label: string;
  blurb: string;
};

export const MODEL_OPTIONS: ModelOption[] = [
  {
    id: "gemini-3.8-flash",
    label: "Gemini 3.8 Flash",
    blurb: "Default. Best speed/quality balance for full lecture transcripts.",
  },
  {
    id: "gemini-3.7-flash",
    label: "Gemini 3.7 Flash",
    blurb: "Previous-generation flash. Good fallback for long transcripts.",
  },
  {
    id: "gemini-3.1-pro-preview",
    label: "Gemini 3.1 Pro",
    blurb: "Slower, strongest reasoning — best for dense technical lectures.",
  },
];

// No process.env here on purpose: this module is bundled into the browser.
// The server can override the default through the GEMINI_MODEL env var (see
// services/gemini.service.ts) while the web app always gets a concrete id.
// Deliberately no process.env here: this module is bundled into the browser.
// The server applies the GEMINI_MODEL env override when it picks a default.
export const DEFAULT_MODEL = MODEL_OPTIONS[0].id;

/**
 * Tried in order when the requested model fails with a retryable error
 * (rate limit / 5xx / timeout). The requested model is always tried first.
 *
 * Each model has its own free-tier quota (the newer ones allow only 20
 * requests/day), so the chain deliberately spans several generations: when one
 * pool is exhausted the next model can still answer instead of the whole run
 * failing.
 */
export const FALLBACK_MODELS = [
  "gemini-3.8-flash",
  "gemini-3.5-flash",
  "gemini-3.7-flash",
  "gemini-2.5-flash",
];

export function modelFallbackChain(requested: string): string[] {
  return [requested, ...FALLBACK_MODELS.filter((model) => model !== requested)];
}

export function isKnownModel(id: string): boolean {
  return MODEL_OPTIONS.some((option) => option.id === id);
}

/**
 * Models a generation can legitimately be recorded with: the ones a user can
 * pick, plus the fallbacks that may answer when those are overloaded or out of
 * quota.
 */
export function isSupportedModel(id: string): boolean {
  return isKnownModel(id) || FALLBACK_MODELS.includes(id);
}

/** The chain a request for `requested` can end up running on. */
export function modelsInPlay(requested: string): string[] {
  return [...new Set([requested, ...FALLBACK_MODELS])];
}
