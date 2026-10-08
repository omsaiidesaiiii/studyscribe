import path from "node:path";
import fs from "node:fs";
import { Router } from "express";
import { validate, type ValidatedRequest } from "../middlewares/validate.js";
import { requireAuth, type AuthedRequest } from "../middlewares/requireAuth.js";
import {
  generateSchema,
  historyQuerySchema,
  type HistoryQuery,
} from "../schemas/generate.schema.js";
import { enqueueGeneration } from "../services/generate.service.js";
import {
  countGenerationsByUser,
  findGenerationById,
  listGenerationsByUser,
} from "../repositories/generations.repository.js";
import { renderNotesHtml } from "../services/renderer.service.js";
import { MODEL_OPTIONS } from "../shared/models.js";
import { AppError } from "../errors/AppError.js";

const router = Router();

/** Strips characters that would break a Content-Disposition header. */
function safeFilename(title: string | null): string {
  const cleaned = (title || "notes")
    .replace(/[\/:*?"<>|\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);

  return cleaned || "notes";
}

router.post(
  "/",
  requireAuth,
  validate(generateSchema),
  async (req: AuthedRequest, res, next) => {
    try {
      const { generationId } = await enqueueGeneration(req.userId!, req.body);

      res.status(202).json({
        success: true,
        generationId,
        message: "Generation queued. Poll GET /generate/:id for status.",
      });
    } catch (error) {
      next(error);
    }
  },
);

// Public: the web app renders its model picker from this so the list can never
// drift from what the API actually accepts.
router.get("/models", (_req, res) => {
  res.status(200).json({ success: true, models: MODEL_OPTIONS });
});

router.get(
  "/history",
  requireAuth,
  validate(historyQuerySchema, "query"),
  async (req: AuthedRequest, res, next) => {
    try {
      // Read the *validated* query, never req.query (see middlewares/validate.ts).
      const { page, limit } =
        (req as ValidatedRequest<HistoryQuery>).validatedQuery ?? {
          page: 1,
          limit: 10,
        };

      const offset = (page - 1) * limit;

      const [rows, total] = await Promise.all([
        listGenerationsByUser(req.userId!, limit, offset),
        countGenerationsByUser(req.userId!),
      ]);

      res.status(200).json({
        success: true,
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        generations: rows.map((row) => ({
          id: row.id,
          videoUrl: row.video_url,
          title: row.title,
          language: row.language,
          model: row.model,
          status: row.status,
          createdAt: row.created_at,
          completedAt: row.completed_at,
        })),
      });
    } catch (error) {
      next(error);
    }
  },
);

// Single-generation status — this is what a client polls after getting a
// generationId back from POST /generate, to check whether it is still
// pending/processing, or has finished (done/failed).
router.get("/:id", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const generationId = req.params.id as string;
    const generation = await findGenerationById(generationId);

    if (!generation || generation.user_id !== req.userId) {
      throw new AppError(404, "Generation not found");
    }

    res.status(200).json({
      success: true,
      generation: {
        id: generation.id,
        videoUrl: generation.video_url,
        title: generation.title,
        language: generation.language,
        model: generation.model,
        sourceLanguage: generation.source_language,
        status: generation.status,
        errorMessage: generation.error_message,
        createdAt: generation.created_at,
        completedAt: generation.completed_at,
        hasPdf: Boolean(generation.pdf_path),
        pageCount: generation.notes?.pages?.length ?? 0,
        // 0 means the run was served from the Redis cache and cost nothing.
        creditsUsed: generation.credits_used,
        wasCached: generation.credits_used === 0 && generation.status === "done",
        // The structured notes power the in-browser notebook viewer; they are
        // the exact data the PDF was rendered from.
        notes: generation.status === "done" ? generation.notes : null,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Standalone handwritten-style HTML view of the notebook, for printing or
// embedding. Same template the PDF is built from.
router.get("/:id/preview", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const generation = await findGenerationById(req.params.id as string);

    if (!generation || generation.user_id !== req.userId) {
      throw new AppError(404, "Generation not found");
    }

    if (!generation.notes) {
      throw new AppError(409, "This generation has no notes to preview yet");
    }

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(renderNotesHtml(generation.notes));
  } catch (error) {
    next(error);
  }
});

router.get("/:id/download", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const generationId = req.params.id as string;
    const generation = await findGenerationById(generationId);

    if (!generation || generation.user_id !== req.userId) {
      throw new AppError(404, "Generation not found");
    }

    if (generation.status !== "done" || !generation.pdf_path) {
      throw new AppError(409, "This generation is not ready for download");
    }

    const absolutePath = path.resolve(generation.pdf_path);

    if (!fs.existsSync(absolutePath)) {
      throw new AppError(410, "The PDF for this generation is no longer stored");
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${safeFilename(generation.title)}.pdf"`,
    );

    res.sendFile(absolutePath);
  } catch (error) {
    next(error);
  }
});

export default router;
