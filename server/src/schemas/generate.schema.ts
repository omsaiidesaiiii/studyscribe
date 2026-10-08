import { z } from "zod";
import { MODEL_OPTIONS } from "../shared/models.js";

const modelIds = MODEL_OPTIONS.map((option) => option.id) as [string, ...string[]];

export const generateSchema = z.object({
  url: z
    .string()
    .url()
    .refine(
      (val) => /youtube\.com|youtu\.be/.test(val),
      "Must be a YouTube URL",
    ),
  language: z.enum(["english", "hindi", "hinglish"]).default("hinglish"),
  // Optional: an unknown/older model id is rejected with a 400 rather than
  // silently producing notes from a different model than the UI advertised.
  model: z.enum(modelIds).optional(),
});

export const historyQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export type HistoryQuery = z.infer<typeof historyQuerySchema>;

export type GenerateInput = z.infer<typeof generateSchema>;
