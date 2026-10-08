import { AppError } from "../errors/AppError.js";
import { findUserById } from "../repositories/user.repository.js";
import { createGeneration } from "../repositories/generations.repository.js";
import { extractVideoId } from "./transcript.service.js";
import { DEFAULT_MODEL, isKnownModel } from "../shared/models.js";
import {
  generateNotesQueue,
  GENERATE_NOTES_QUEUE,
  generateNotesJobOptions,
} from "../lib/queue.js";
import { getCachedGeneration } from "../lib/cache.js";
import { markGenerationDone } from "../repositories/generations.repository.js";
import type { GenerateInput } from "../schemas/generate.schema.js";

/**
 * Queues a generation job and returns immediately — the API never blocks on
 * Gemini or the PDF renderer. The client polls GET /generate/:id.
 */
export async function enqueueGeneration(
  userId: string,
  input: GenerateInput,
): Promise<{ generationId: string }> {
  const user = await findUserById(userId);

  if (!user) {
    throw new AppError(404, "User not found");
  }

  if (user.credits <= 0) {
    throw new AppError(402, "Insufficient credits");
  }

  const videoId = extractVideoId(input.url);

  const model = input.model && isKnownModel(input.model) ? input.model : DEFAULT_MODEL;

  const generation = await createGeneration({
    userId,
    videoUrl: input.url,
    videoId,
    language: input.language,
    model,
  });

  const cached = await getCachedGeneration(videoId, input.language, model);

  if (cached) {
    // Re-using a stored notebook is free: no Gemini call, no PDF render. The
    // cached payload records which model produced it, which may differ from the
    // requested one when that run had to fall back.
    await markGenerationDone(generation.id, {
      title: cached.title,
      pdfPath: cached.pdfPath,
      notes: cached.notes,
      model: cached.model ?? model,
      creditsUsed: 0,
    });

    return { generationId: generation.id };
  }

  await generateNotesQueue.add(
    GENERATE_NOTES_QUEUE,
    { generationId: generation.id },
    generateNotesJobOptions,
  );

  return { generationId: generation.id };
}
