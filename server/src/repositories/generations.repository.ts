import { pool } from "../lib/db.js";
import type { GenerationStatus, NotesData } from "../shared/types.js";

export type { GenerationStatus };

export type GenerationRow = {
  id: string;
  user_id: string;
  video_url: string;
  video_id: string;
  title: string | null;
  language: string;
  model: string;
  notes: NotesData | null;
  source_language: string | null;
  status: GenerationStatus;
  pdf_path: string | null;
  credits_used: number;
  error_message: string | null;
  created_at: Date;
  completed_at: Date | null;
};

export async function createGeneration(data: {
  userId: string;
  videoUrl: string;
  videoId: string;
  language: string;
  model: string;
}): Promise<GenerationRow> {
  const result = await pool.query<GenerationRow>(
    `INSERT INTO generations (user_id, video_url, video_id, language, model)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [data.userId, data.videoUrl, data.videoId, data.language, data.model],
  );

  return result.rows[0];
}

export async function markGenerationProcessing(id: string): Promise<void> {
  await pool.query("UPDATE generations SET status = 'processing' WHERE id = $1", [id]);
}

export async function markGenerationDone(
  id: string,
  data: {
    title: string;
    pdfPath: string;
    notes: NotesData;
    model: string;
    sourceLanguage?: string | null;
    creditsUsed?: number;
  },
): Promise<void> {
  await pool.query(
    `UPDATE generations
     SET status = 'done',
         title = $2,
         pdf_path = $3,
         notes = $4,
         model = $5,
         source_language = $6,
         credits_used = $7,
         error_message = NULL,
         completed_at = NOW()
     WHERE id = $1`,
    [
      id,
      data.title,
      data.pdfPath,
      JSON.stringify(data.notes),
      data.model,
      data.sourceLanguage ?? null,
      data.creditsUsed ?? 1,
    ],
  );
}

export async function markGenerationFailed(
  id: string,
  errorMessage: string,
): Promise<void> {
  await pool.query(
    `UPDATE generations
     SET status = 'failed', error_message = $2, completed_at = NOW()
     WHERE id = $1`,
    [id, errorMessage],
  );
}

export async function findGenerationById(id: string): Promise<GenerationRow | null> {
  // The route passes req.params.id as a plain string (React Router). If it is
  // not a valid UUID, Postgres throws "invalid input syntax for type uuid".
  // Treat those as "not found" instead of 500: the route's 404 check already
  // covers the real case (generation exists but belongs to another user).
  try {
    const result = await pool.query<GenerationRow>(
      "SELECT * FROM generations WHERE id = $1",
      [id],
    );
    return result.rows[0] ?? null;
  } catch (error) {
    // pg throws on a type mismatch (invalid UUID) — propagate as null so the
    // caller gets a 404 rather than a 500.
    if (error instanceof Error && String(error.message).startsWith("invalid input syntax for type uuid")) {
      return null;
    }
    throw error;
  }
}

export async function listGenerationsByUser(
  userId: string,
  limit: number,
  offset: number,
): Promise<GenerationRow[]> {
  const result = await pool.query<GenerationRow>(
    `SELECT * FROM generations
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset],
  );

  return result.rows;
}

export async function countGenerationsByUser(userId: string): Promise<number> {
  const result = await pool.query<{ count: string }>(
    "SELECT COUNT(*)::text AS count FROM generations WHERE user_id = $1",
    [userId],
  );

  return Number(result.rows[0]?.count ?? 0);
}
