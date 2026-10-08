import { GoogleGenAI } from "@google/genai";
import { AppError } from "../errors/AppError.js";
import { logger } from "../lib/logger.js";
import { notesSchema, type NotesData } from "../schemas/notes.schema.js";
import type { NotesLanguage } from "../shared/types.js";
import { DEFAULT_MODEL, modelFallbackChain } from "../shared/models.js";

// Talks to the Gemini *Interactions* API (ai.interactions.create), which is
// what the current Google AI Studio docs use for text generation with
// structured output. The legacy ai.models.generateContent path is no longer
// used here.
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  logger.warn("GEMINI_API_KEY is not set — note generation will fail.");
}

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY ?? "" });

// Transcripts above this size are split into batches; a single request with a
// multi-hour transcript tends to hit output-token limits.
const MAX_TRANSCRIPT_CHARS_PER_REQUEST = 120_000;

const MAX_BATCHES = 3;

// Plain JSON Schema (the Interactions API takes JSON Schema directly, unlike
// the legacy responseSchema which required the Type.* enum helpers).
const diagramNodeSchema = {
  type: "object",
  properties: {
    label: { type: "string" },
    fill: { type: "string" },
    stroke: { type: "string" },
  },
  required: ["label"],
} as const;

const blockSchemas = [
  {
    type: "object",
    properties: {
      type: { type: "string", enum: ["heading"] },
      number: { type: "string" },
      text: { type: "string" },
    },
    required: ["type", "text"],
  },
  {
    type: "object",
    properties: {
      type: { type: "string", enum: ["sectionhead"] },
      text: { type: "string" },
    },
    required: ["type", "text"],
  },
  {
    type: "object",
    properties: {
      type: { type: "string", enum: ["paragraph"] },
      html: { type: "string" },
    },
    required: ["type", "html"],
  },
  {
    type: "object",
    properties: {
      type: { type: "string", enum: ["bullets"] },
      items: { type: "array", items: { type: "string" } },
    },
    required: ["type", "items"],
  },
  {
    type: "object",
    properties: {
      type: { type: "string", enum: ["stickynote"] },
      variant: { type: "string", enum: ["yellow", "pink", "green"] },
      badge: { type: "string" },
      html: { type: "string" },
    },
    required: ["type", "html"],
  },
  {
    type: "object",
    properties: {
      type: { type: "string", enum: ["table"] },
      headers: { type: "array", items: { type: "string" } },
      rows: {
        type: "array",
        items: { type: "array", items: { type: "string" } },
      },
    },
    required: ["type", "headers", "rows"],
  },
  {
    type: "object",
    properties: {
      type: { type: "string", enum: ["codebox"] },
      code: { type: "string" },
    },
    required: ["type", "code"],
  },
  {
    type: "object",
    properties: {
      type: { type: "string", enum: ["diagram"] },
      kind: { type: "string", enum: ["flow"] },
      title: { type: "string" },
      nodes: { type: "array", items: diagramNodeSchema },
    },
    required: ["type", "kind", "nodes"],
  },
  {
    type: "object",
    properties: {
      type: { type: "string", enum: ["diagram"] },
      kind: { type: "string", enum: ["decision"] },
      title: { type: "string" },
      root: diagramNodeSchema,
      left: diagramNodeSchema,
      right: diagramNodeSchema,
    },
    required: ["type", "kind", "root", "left", "right"],
  },
];

export const notesJsonSchema = {
  type: "object",
  properties: {
    title: { type: "string" },
    subject: { type: "string" },
    pages: {
      type: "array",
      items: {
        type: "object",
        properties: {
          topic: { type: "string" },
          doodles: {
            type: "array",
            maxItems: 3,
            description:
              "Optional margin scribbles. Omit the key entirely if there is " +
              "nothing worth adding.",
            items: {
              type: "object",
              properties: {
                top: {
                  type: "number",
                  description:
                    "Vertical offset from the top of the page, in pixels, between 0 and 900.",
                },
                text: {
                  type: "string",
                  description: "One or two handwritten words, e.g. \"revise\".",
                },
              },
              required: ["top", "text"],
            },
          },
          blocks: { type: "array", items: { anyOf: blockSchemas } },
        },
        required: ["topic", "blocks"],
      },
    },
  },
  required: ["title", "subject", "pages"],
};

const LANGUAGE_INSTRUCTIONS: Record<NotesLanguage, string> = {
  english: `Write ALL explanations in clear, plain English only. Do NOT use
any Hindi or Hinglish words anywhere in the notes.`,

  hindi: `Write ALL explanations in Hindi, using proper Devanagari script
(e.g. "यह एक उदाहरण है"). Do not romanize Hindi into Latin letters.`,

  hinglish: `Write explanations in Hinglish: Hindi words spelled phonetically
using the English/Latin alphabet, mixed naturally with English technical
terms — e.g. "kya kar rahe ho", NOT Devanagari script.`,
};

export function buildSystemInstruction(language: NotesLanguage): string {
  return `
You are creating structured revision notes from a YouTube video transcript.

${LANGUAGE_INSTRUCTIONS[language]}

The transcript may be in ANY language (auto-generated captions are often not
English). First understand it, then write the notes in the language requested
above — translate the ideas when the transcript is in another language. Never
copy transcript text verbatim in a foreign language.

Each page's "blocks" array must contain ONLY objects using these exact
"type" values, each with its required fields:

- {"type":"heading","number":"01","text":"..."}
- {"type":"sectionhead","text":"..."}
- {"type":"paragraph","html":"..."}
- {"type":"bullets","items":["...","..."]}
- {"type":"stickynote","variant":"yellow","badge":"...","html":"..."}
- {"type":"table","headers":["...","..."],"rows":[["...","..."]]}
- {"type":"codebox","code":"..."}
- {"type":"diagram","kind":"flow","title":"...","nodes":[{"label":"...","fill":"#hex","stroke":"#hex"}]}
- {"type":"diagram","kind":"decision","title":"...","root":{"label":"...","fill":"#hex","stroke":"#hex"},"left":{"label":"...","sub":"...","fill":"#hex","stroke":"#hex"},"right":{"label":"...","sub":"...","fill":"#hex","stroke":"#hex"}}

Inline formatting inside "html" fields: use only <hl>text</hl> for highlights,
<circle>text</circle> for circling and <under>text</under> for underlining.
Never use any other HTML tag.

Every stickynote MUST include actual "html" content — never emit a stickynote
with only "type" and "variant". Every diagram MUST include its nodes (for
"flow") or root/left/right (for "decision") — never emit an empty diagram.

Diagram "label" values (in nodes, root, left, right) MUST be SHORT — 2-4 words
maximum, e.g. "Human Text", "LLM Engine". NEVER write a full sentence as a
diagram label — long labels visually overlap and break the diagram. Put any
longer explanation in "title" or a separate paragraph block instead.

For "codebox" blocks, the "code" field MUST include real newline characters
(\n) between lines to preserve formatting and indentation — never return code
as one unbroken line.

Do not invent any other "type" value. Do not omit the required fields listed
above for whichever type you use.

Other rules:
- Size the notebook to the content — the page count must follow how much
  material the transcript actually contains, not a fixed number. As a guide:
  a short video (under ~15 minutes) fits in 4-8 pages; a 15-45 minute video
  needs 8-14 pages; a long lecture can need 15-25 pages. Never squeeze an
  hour of material into a few pages — if the transcript covers its topic in
  depth, keep going and add pages until EVERYTHING in the video is covered.
- Keep every paragraph short (2-4 sentences max) — this should look like
  handwritten notebook pages, not an essay.
- Include at least one sticky note per page for a key definition or exam tip.
- Give each page a short "topic" (2-6 words) for the page header.
- Use "doodles" (0-3 per page) only for tiny margin scribbles like "imp!" or
  "revise". Each doodle is {"top": <pixels from the top of the page, 0-900>,
  "text": "..."} — never a huge number, and never without "text".
`.trim();
}

export type GeneratedNotes = {
  data: NotesData;
  model: string;
  batches: number;
};

export function splitTranscript(transcript: string): string[] {
  const text = transcript.trim();

  if (text.length <= MAX_TRANSCRIPT_CHARS_PER_REQUEST) {
    return [text];
  }

  const needed = Math.ceil(text.length / MAX_TRANSCRIPT_CHARS_PER_REQUEST);
  const batches = Math.min(needed, MAX_BATCHES);

  // A transcript longer than MAX_BATCHES windows is sampled across the WHOLE
  // video rather than truncated from the start: each batch is a full-size
  // window and the windows are spread evenly from the first minute to the
  // last, so a two-hour lecture still produces notes that cover its ending.
  const windowSize = MAX_TRANSCRIPT_CHARS_PER_REQUEST;
  const lastStart = Math.max(0, text.length - windowSize);
  const out: string[] = [];

  for (let index = 0; index < batches; index++) {
    const offset =
      batches === 1 ? 0 : Math.round((lastStart * index) / (batches - 1));

    out.push(text.slice(offset, offset + windowSize).trim());
  }

  if (needed > MAX_BATCHES) {
    const skipped = text.length - batches * windowSize;
    logger.warn(
      `Transcript is very long (${text.length} chars): sampling ${batches} windows spread across the video, skipping ${skipped} chars of detail.`,
    );
  }

  return out.filter(Boolean);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Rate limits, transient 5xx and network timeouts are worth retrying on a
 * different model; auth/validation problems are not.
 */
/**
 * True when the error is a quota that will not clear for hours — Gemini's
 * free tier answers with "limit: 20 requests per day ... retry in 15h56m".
 * Retrying that on the next model in the chain is right, but re-queueing the
 * whole job a second later is not, so the worker fails it immediately.
 */
export function isQuotaExhaustedError(error: unknown): boolean {
  const message = errorMessage(error).toLowerCase();

  if (!message.includes("rate limit") && !message.includes("429")) {
    return false;
  }

  return message.includes("per day") || /retry in \d+[hm]/.test(message);
}

export function isRetryableError(error: unknown): boolean {
  if (error instanceof AppError && error.statusCode < 500) {
    return false;
  }

  const message = errorMessage(error).toLowerCase();

  return [
    "429",
    "500",
    "502",
    "503",
    "504",
    "resource_exhausted",
    "overloaded",
    "unavailable",
    "deadline",
    "timeout",
    "etimedout",
    "econnreset",
    "fetch failed",
  ].some((token) => message.includes(token));
}

type Validated = { ok: true; data: NotesData } | { ok: false; issues: string };

/**
 * Pulls the JSON payload out of a model response.
 *
 * Structured output is *mostly* clean JSON, but weaker models in the fallback
 * chain wrap it in markdown fences (```json ... ```) or answer with the object
 * embedded in prose. Throwing those at JSON.parse turns a formatting quirk into
 * a wasted generation plus a multi-minute repair pass, so the payload is
 * unwrapped first. Returns null when there is nothing object-shaped to parse —
 * e.g. a YAML-ish or prose-only answer, which is a genuine failure.
 */
export function extractJsonPayload(raw: string): string | null {
  let text = raw.trim();

  // ```json ... ``` (also ``` ... ```), optionally with a language tag.
  const fenced = /^```[a-zA-Z]*\s*([\s\S]*?)\s*```$/.exec(text);
  if (fenced) {
    text = fenced[1].trim();
  }

  if (text.startsWith("{") || text.startsWith("[")) {
    return text;
  }

  // Prose before/after the payload: keep the outermost object or array. The
  // last `}` is used so trailing commentary does not truncate the JSON.
  const start = text.search(/[[{]/);
  if (start === -1) {
    return null;
  }

  const open = text[start];
  const end = text.lastIndexOf(open === "{" ? "}" : "]");

  return end > start ? text.slice(start, end + 1) : null;
}

function validate(raw: string): Validated {
  const payload = extractJsonPayload(raw);

  if (payload === null) {
    return {
      ok: false,
      issues: `Response did not contain JSON. Start of response: ${JSON.stringify(raw.slice(0, 200))}`,
    };
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(payload);
  } catch (error) {
    // A response that stops mid-object almost always means the model ran into
    // its output limit, so the tail is the useful part of the message.
    return {
      ok: false,
      issues:
        `Response was not valid JSON (${errorMessage(error)}). ` +
        `End of response: ${JSON.stringify(raw.slice(-200))}`,
    };
  }

  const result = notesSchema.safeParse(parsed);

  if (!result.success) {
    return {
      ok: false,
      issues: JSON.stringify(result.error.issues.slice(0, 20), null, 2),
    };
  }

  return { ok: true, data: result.data };
}

async function requestRawNotes(options: {
  model: string;
  transcript: string;
  language: NotesLanguage;
  repair?: { previous: string; issues: string };
  part?: { index: number; total: number };
}): Promise<string> {
  const { model, transcript, language, repair, part } = options;

  const partLine = !repair && part
    ? `This transcript is part ${part.index + 1} of ${part.total} of one video. ` +
      `Cover ONLY the material in this part, in 5-8 notebook pages; separate ` +
      `requests handle the rest of the video.\n\n`
    : "";

  const input = repair
    ? [
        "Your previous response did not match the required JSON structure.",
        "",
        "VALIDATION ERRORS:",
        repair.issues,
        "",
        "PREVIOUS RESPONSE (truncated):",
        repair.previous.slice(0, 20_000),
        "",
        "Return the corrected notes as JSON only — a single JSON object with the",
        'top-level keys "title", "subject" and "pages". No markdown code fences,',
        "no commentary, no array as the top-level value.",
      ].join("\n")
    : `${partLine}TRANSCRIPT:\n${transcript}`;

  const started = Date.now();

  const interaction = await ai.interactions.create({
    model,
    input,
    store: false,
    system_instruction: buildSystemInstruction(language),
    response_format: {
      type: "text",
      mime_type: "application/json",
      schema: notesJsonSchema,
    },
  });

  const text = interaction.output_text;

  if (!text) {
    throw new AppError(502, "Gemini returned an empty response");
  }

  logger.info(
    `Gemini ${model} responded in ${Date.now() - started}ms (${text.length} chars` +
      `${repair ? ", repair pass" : ""})`,
  );

  return text;
}

async function generateBatch(options: {
  transcript: string;
  language: NotesLanguage;
  models: string[];
  part?: { index: number; total: number };
}): Promise<{ data: NotesData; model: string }> {
  const { transcript, language, models, part } = options;

  let lastError: unknown;
  let quotaExhausted = false;

  for (const model of models) {
    try {
      const raw = await requestRawNotes({ model, transcript, language, part });
      const first = validate(raw);

      if (first.ok) {
        return { data: first.data, model };
      }

      logger.warn(
        `Gemini ${model} output failed validation; asking for a corrected version.\n` +
          first.issues.slice(0, 1_500),
      );

      const repairedRaw = await requestRawNotes({
        model,
        transcript,
        language,
        repair: { previous: raw, issues: first.issues },
      });

      const repaired = validate(repairedRaw);

      if (repaired.ok) {
        return { data: repaired.data, model };
      }

      logger.error("Repair pass still failed validation:");
      logger.error(repaired.issues);

      lastError = new AppError(
        502,
        "Gemini's response did not match the expected notes structure",
      );
    } catch (error) {
      lastError = error;

      logger.error(`Gemini model ${model} failed: ${errorMessage(error)}`);

      if (isQuotaExhaustedError(error)) {
        quotaExhausted = true;
      }

      // Every model in the fallback chain gets one attempt. A non-retryable
      // error (e.g. the model returned 400 "invalid argument") is transient
      // overhead for that model, and the next model in the chain may answer
      // instead. Only a 5xx genuinely ends the chain for good, so treat a
      // non-retryable error as "try the next model".
      if (error instanceof AppError && error.statusCode >= 500) {
        break;
      }
    }
  }

  if (lastError instanceof AppError) {
    throw lastError;
  }

  // Every model in the chain refused because its daily allowance is gone.
  // Saying so is far more useful than repeating whichever 429 came last.
  if (quotaExhausted) {
    throw new AppError(
      503,
      "Gemini's free-tier quota is used up for every model we tried. The quota " +
        "resets daily, so try again later or pick a different model in the form.",
    );
  }

  throw new AppError(
    502,
    `Failed to generate notes from Gemini: ${errorMessage(lastError)}`,
  );
}

/**
 * Generates the full notebook for a transcript, walking the model fallback
 * chain on retryable failures and merging batches for long transcripts.
 */
export async function generateStructuredNotes(
  transcript: string,
  language: NotesLanguage,
  requestedModel: string = DEFAULT_MODEL,
): Promise<GeneratedNotes> {
  const batches = splitTranscript(transcript);
  const chain = modelFallbackChain(requestedModel);

  const mergedPages: NotesData["pages"] = [];

  let title = "";
  let subject = "";
  let resolvedModel = requestedModel;

  for (let index = 0; index < batches.length; index++) {
    // The first batch walks the whole fallback chain; once a model has proven
    // it works, the remaining batches stay on it for stylistic consistency.
    const models = index === 0 ? chain : [resolvedModel];

    const result = await generateBatch({
      transcript: batches[index],
      language,
      models,
      part: batches.length > 1 ? { index, total: batches.length } : undefined,
    });

    resolvedModel = result.model;

    if (index === 0) {
      title = result.data.title;
      subject = result.data.subject;
    }

    mergedPages.push(...result.data.pages);
  }

  return {
    data: {
      title: title || "Study Notes",
      subject: subject || "General",
      // Safety net only — the prompt sizes the page count to the content, so
      // this should never bind; 40 A4 pages is far past any sane notebook.
      pages: mergedPages.slice(0, 40),
    },
    model: resolvedModel,
    batches: batches.length,
  };
}
