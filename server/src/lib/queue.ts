import "dotenv/config";
import { Redis } from "ioredis";
import { Queue, type JobsOptions } from "bullmq";

export const redisConnection = new Redis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: null,
});

export const GENERATE_NOTES_QUEUE = "generate-notes";

// The worker looks up everything else (video URL, language, model, user) from
// the generations row itself — the payload only carries the ID, so the
// database stays the single source of truth instead of two copies of the same
// data drifting apart.
export type GenerateNotesJobData = {
  generationId: string;
};

/**
 * One retry, because most failures are transient Gemini rate limits. Redis
 * keeps only the last 100 finished jobs of each kind.
 */
export const generateNotesJobOptions: JobsOptions = {
  attempts: 2,
  backoff: { type: "exponential", delay: 5_000 },
  removeOnComplete: { count: 100 },
  removeOnFail: { count: 100 },
};

export const generateNotesQueue = new Queue<GenerateNotesJobData>(
  GENERATE_NOTES_QUEUE,
  { connection: redisConnection },
);
