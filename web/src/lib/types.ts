// API-facing types. The notes structure itself is imported from the shared
// module that the server/PDF renderer uses, so the viewer can never expect a
// different shape than the API sends.
export type { NotesData, NotesPage, NoteBlock, DiagramBlock, NotesLanguage, GenerationStatus } from "@shared/types";
export { NOTES_LANGUAGES, LANGUAGE_LABELS } from "@shared/types";
export type { ModelOption } from "@shared/models";
export { MODEL_OPTIONS, DEFAULT_MODEL } from "@shared/models";

import type { NotesData, NotesLanguage, GenerationStatus } from "@shared/types";
import { MODEL_OPTIONS } from "@shared/models";

/**
 * Display name for a stored model id ("gemini-3.8-flash" → "Gemini 3.8 Flash").
 * Falls back to the raw id so an unknown model still renders something.
 */
export function modelLabel(id: string): string {
  return MODEL_OPTIONS.find((model) => model.id === id)?.label ?? id;
}

export type User = {
  id: string;
  email: string;
  name: string;
  credits: number;
};

export type AuthResponse = {
  user: User;
  accessToken: string;
  refreshToken: string;
};

export type Generation = {
  id: string;
  videoUrl: string;
  title: string | null;
  language: NotesLanguage;
  model: string;
  sourceLanguage: string | null;
  status: GenerationStatus;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
  hasPdf: boolean;
  pageCount: number;
  notes: NotesData | null;
};

export type GenerationSummary = {
  id: string;
  videoUrl: string;
  title: string | null;
  language: NotesLanguage;
  model: string;
  status: GenerationStatus;
  createdAt: string;
  completedAt: string | null;
};

export type HistoryResponse = {
  success: boolean;
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  generations: GenerationSummary[];
};
