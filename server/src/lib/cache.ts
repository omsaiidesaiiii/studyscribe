import { redisConnection } from "./queue.js";
import type { NotesData } from "../shared/types.js";

const CACHE_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

// The model is part of the key: the same video generated with 3.8 Flash and
// with 3.1 Pro produces different notes, so they must not share an entry.
function cacheKey(videoId: string, language: string, model: string): string {
  return `notes:${videoId}:${language}:${model}`;
}

export type CachedGeneration = {
  title: string;
  pdfPath: string;
  /** Stored so a cache hit can still be rendered in the browser. */
  notes: NotesData;
  /**
   * The model that actually produced these notes, which after a fallback is not
   * necessarily the model the key belongs to. Kept so a cache hit can report
   * the truth instead of the requested name.
   */
  model?: string;
};

export async function getCachedGeneration(
  videoId: string,
  language: string,
  model: string,
): Promise<CachedGeneration | null> {
  const raw = await redisConnection.get(cacheKey(videoId, language, model));

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as CachedGeneration;

    if (!parsed?.pdfPath || !parsed?.notes) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

/**
 * Stores a finished notebook under every model the request can be repeated
 * with.
 *
 * A single run can legitimately involve two models: when the requested one is
 * overloaded the fallback chain produces the notes instead. Caching only under
 * the model that answered would make the next request — for the model the user
 * actually picked — miss the cache and burn another Gemini call, so the
 * "re-running the same video is free" promise would break exactly when Gemini
 * is under load and the cache is needed most.
 */
export async function setCachedGenerationForModels(
  videoId: string,
  language: string,
  models: string[],
  data: CachedGeneration,
): Promise<void> {
  await Promise.all(
    [...new Set(models)].map((model) =>
      setCachedGeneration(videoId, language, model, data),
    ),
  );
}

/**
 * Drops a cached notebook. Used by the e2e script to force a genuinely cold
 * generation (and by operators who want to re-render a video on demand).
 */
export async function clearCachedGeneration(
  videoId: string,
  language: string,
  model: string,
): Promise<void> {
  await redisConnection.del(cacheKey(videoId, language, model));
}

export async function setCachedGeneration(
  videoId: string,
  language: string,
  model: string,
  data: CachedGeneration,
): Promise<void> {
  await redisConnection.set(
    cacheKey(videoId, language, model),
    JSON.stringify(data),
    "EX",
    CACHE_TTL_SECONDS,
  );
}
