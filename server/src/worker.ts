import "dotenv/config";
import { UnrecoverableError, Worker, type Job } from "bullmq";
import fs from "node:fs/promises";
import path from "node:path";
import {
  redisConnection,
  GENERATE_NOTES_QUEUE,
  type GenerateNotesJobData,
} from "./lib/queue.js";
import { logger } from "./lib/logger.js";
import {
  findGenerationById,
  markGenerationProcessing,
  markGenerationDone,
  markGenerationFailed,
} from "./repositories/generations.repository.js";
import { decrementUserCredits } from "./repositories/user.repository.js";
import { setCachedGenerationForModels } from "./lib/cache.js";
import { fetchTranscript } from "./services/transcript.service.js";
import {
  generateStructuredNotes,
  isQuotaExhaustedError,
  isRetryableError,
} from "./services/gemini.service.js";
import { AppError } from "./errors/AppError.js";
import { generatePdf } from "./services/pdf.service.js";
import { DEFAULT_MODEL } from "./shared/models.js";
import type { NotesLanguage } from "./shared/types.js";

const OUTPUT_DIR = path.join(process.cwd(), "generated");

async function processGeneration(job: Job<GenerateNotesJobData>): Promise<void> {
  const { generationId } = job.data;

  const generation = await findGenerationById(generationId);

  if (!generation) {
    logger.error(`Generation ${generationId} not found — skipping job`);
    return;
  }

  await markGenerationProcessing(generationId);

  try {
    const language = generation.language as NotesLanguage;
    const model = generation.model || DEFAULT_MODEL;

    const { transcript, sourceLanguage } = await fetchTranscript(
      generation.video_id,
    );

    const generated = await generateStructuredNotes(transcript, language, model);

    const pdfBuffer = await generatePdf(generated.data);

    const userDir = path.join(OUTPUT_DIR, generation.user_id);
    await fs.mkdir(userDir, { recursive: true });

    const pdfPath = path.join(userDir, `${generationId}.pdf`);
    await fs.writeFile(pdfPath, pdfBuffer);

    await markGenerationDone(generationId, {
      title: generated.data.title,
      pdfPath,
      notes: generated.data,
      model: generated.model,
      sourceLanguage,
      creditsUsed: 1,
    });

    // Cached under the requested model *and* the one that answered, so a repeat
    // run stays free even when this one fell back (see setCachedGenerationForModels).
    await setCachedGenerationForModels(
      generation.video_id,
      language,
      [model, generated.model],
      {
        title: generated.data.title,
        pdfPath,
        notes: generated.data,
        model: generated.model,
      },
    );

    await decrementUserCredits(generation.user_id);

    logger.info(
      `Generation ${generationId} completed with ${generated.model} ` +
        `(${generated.data.pages.length} pages, ${generated.batches} batch(es))` +
        `${sourceLanguage ? `, transcript language: ${sourceLanguage}` : ""}`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await markGenerationFailed(generationId, message);
    logger.error(`Generation ${generationId} failed: ${message}`);

    // A structural failure (the model could not produce valid notes, or the
    // video has no usable transcript) will not fix itself on a retry, and every
    // attempt can cost several Gemini calls. Failing the job immediately keeps
    // a broken video from burning the whole retry budget; transient errors
    // (503s that outlived the in-process fallback chain, DB blips, ...) still
    // get the queue's second attempt.
    if (
      error instanceof AppError &&
      (!isRetryableError(error) || isQuotaExhaustedError(error))
    ) {
      throw new UnrecoverableError(message);
    }

    throw error;
  }
}

const worker = new Worker<GenerateNotesJobData>(
  GENERATE_NOTES_QUEUE,
  processGeneration,
  {
    connection: redisConnection,
    concurrency: 2,
  },
);

worker.on("completed", (job) => {
  logger.info(`Job ${job.id} completed`);
});

worker.on("failed", (job, err) => {
  logger.error(`Job ${job?.id} failed: ${err.message}`);
});

logger.info("Worker started, listening for generate-notes jobs...");
