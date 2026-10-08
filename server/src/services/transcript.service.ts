import { YoutubeTranscript } from "youtube-transcript";
import { AppError } from "../errors/AppError.js";

export type TranscriptResult = {
  transcript: string;
  /** Best-effort language hint: "hi" (Hindi), "en" (English-ish), or undefined. */
  sourceLanguage?: string;
};

export function extractVideoId(url: string): string {
  const match = url.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);

  if (!match) {
    throw new AppError(400, "Could not extract a video ID from this URL");
  }

  return match[1];
}

/**
 * YouTube's auto-generated captions are frequently not English even for
 * English lectures, so the language of the first usable caption track is
 * reported alongside the text and the model is told to translate.
 */
function detectLanguage(
  segments: Array<{ text: string } & { lang?: string }>,
  transcript: string,
): string | undefined {
  const declared = segments.find((segment) => segment.lang)?.lang;

  if (declared) {
    return declared.slice(0, 2).toLowerCase();
  }

  if (/[\u0900-\u097F]/.test(transcript)) {
    return "hi";
  }

  return undefined;
}

export async function fetchTranscript(videoId: string): Promise<TranscriptResult> {
  let segments;

  try {
    segments = await YoutubeTranscript.fetchTranscript(videoId);
  } catch {
    throw new AppError(422, "This video does not have captions available");
  }

  const transcript = segments
    .map((segment) => segment.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  if (!transcript) {
    throw new AppError(422, "Transcript came back empty for this video");
  }

  return {
    transcript,
    sourceLanguage: detectLanguage(segments, transcript),
  };
}
