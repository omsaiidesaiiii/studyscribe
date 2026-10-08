import { z } from "zod";
import type { Doodle, NotesData as SharedNotesData } from "../shared/types.js";

// Zod is the runtime gate on model output; shared/types.ts is the shape the
// API and web app consume. The parity assertions at the bottom of this file
// make the TypeScript build fail if the two drift apart.

const headingBlock = z.object({
  type: z.literal("heading"),
  number: z.string().optional(),
  text: z.string(),
});

const sectionHeadBlock = z.object({
  type: z.literal("sectionhead"),
  text: z.string(),
});

const paragraphBlock = z.object({
  type: z.literal("paragraph"),
  html: z.string(),
});

const bulletsBlock = z.object({
  type: z.literal("bullets"),
  items: z.array(z.string()),
});

const stickyNoteBlock = z.object({
  type: z.literal("stickynote"),
  variant: z.enum(["yellow", "pink", "green"]).optional(),
  badge: z.string().optional(),
  html: z.string(),
});

const tableBlock = z.object({
  type: z.literal("table"),
  headers: z.array(z.string()),
  rows: z.array(z.array(z.string())),
});

const codeBoxBlock = z.object({
  type: z.literal("codebox"),
  code: z.string(),
});

const diagramNode = z.object({
  label: z.string(),
  fill: z.string().optional(),
  stroke: z.string().optional(),
});

const flowDiagramBlock = z.object({
  type: z.literal("diagram"),
  kind: z.literal("flow"),
  title: z.string().optional(),
  nodes: z.array(diagramNode).min(1),
});

const decisionDiagramBlock = z.object({
  type: z.literal("diagram"),
  kind: z.literal("decision"),
  title: z.string().optional(),
  root: diagramNode,
  left: diagramNode.extend({ sub: z.string().optional() }),
  right: diagramNode.extend({ sub: z.string().optional() }),
});

const noteBlock = z.union([
  headingBlock,
  sectionHeadBlock,
  paragraphBlock,
  bulletsBlock,
  stickyNoteBlock,
  tableBlock,
  codeBoxBlock,
  flowDiagramBlock,
  decisionDiagramBlock,
]);

// --- Margin doodles: decoration, and never fatal -------------------------
// Doodles are absolute-positioned scribbles in the page margin. They carry no
// meaning, but a live model has been observed emitting garbage for them —
// `{"top": 1.2e+160}` (which JSON.parse turns into Infinity) with no `text` at
// all — and failing the whole notebook over that would waste a full generation
// and a multi-minute repair pass. Unusable entries are therefore dropped and a
// usable `top` is clamped to the printable band; the substantive content
// (`pages[].blocks`) is still validated strictly.
const MAX_DOODLES_PER_PAGE = 3;
const MAX_DOODLE_TOP_PX = 900;
const MAX_DOODLE_TEXT_LENGTH = 40;

function sanitizeDoodles(value: unknown): Doodle[] {
  if (!Array.isArray(value)) return [];

  const doodles: Doodle[] = [];

  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) continue;

    const { top, text } = entry as { top?: unknown; text?: unknown };
    if (typeof text !== "string" || text.trim() === "") continue;

    const topNumber = typeof top === "number" && Number.isFinite(top) ? top : 0;

    doodles.push({
      top: Math.min(Math.max(topNumber, 0), MAX_DOODLE_TOP_PX),
      text: text.trim().slice(0, MAX_DOODLE_TEXT_LENGTH),
    });

    if (doodles.length === MAX_DOODLES_PER_PAGE) break;
  }

  return doodles;
}

const doodlesSchema = z
  .unknown()
  .transform(sanitizeDoodles)
  .optional();

const pageSchema = z.object({
  topic: z.string(),
  doodles: doodlesSchema,
  blocks: z.array(noteBlock),
});

export const notesSchema = z.object({
  title: z.string(),
  subject: z.string(),
  pages: z.array(pageSchema).min(1),
});

export type NotesData = z.infer<typeof notesSchema>;

// --- Compile-time parity with the shared types -------------------------
// `Satisfies` fails the build if the Zod schema stops covering the shared
// shape, and the reverse assignment fails if the schema introduces fields the
// web app cannot render.
type ZodNotesData = z.infer<typeof notesSchema>;

const _schemaCoversShared = (value: ZodNotesData) => value satisfies SharedNotesData;
const _sharedCoversSchema = (value: SharedNotesData) => value satisfies ZodNotesData;

// Referenced so `noUnusedLocals`-style tooling does not flag them; erased at
// runtime and never called.
export const __parityChecks = [_schemaCoversShared, _sharedCoversSchema];
