/**
 * Direct pipeline check — no Postgres and no Redis required.
 *
 * YouTube URL -> transcript -> Gemini (Interactions API, structured output)
 * -> notes JSON -> handwritten HTML -> PDF.
 *
 * Usage:
 *   npm run pipeline -- "https://www.youtube.com/watch?v=..." [language] [model]
 *
 * Artifacts land in ./generated/_pipeline/<timestamp>/ so the PDF and the
 * exact notes JSON can be inspected (and reused by the web preview).
 */
import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { PDFDocument } from "pdf-lib";

import { extractVideoId, fetchTranscript } from "../src/services/transcript.service.js";
import { generateStructuredNotes } from "../src/services/gemini.service.js";
import { generatePdf } from "../src/services/pdf.service.js";
import { renderNotesHtml } from "../src/services/renderer.service.js";
import type { NotesLanguage } from "../src/shared/types.js";

type Check = { name: string; ok: boolean; detail: string };

const checks: Check[] = [];

function record(name: string, ok: boolean, detail: string): void {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name} — ${detail}`);
}

async function main(): Promise<void> {
  const url = process.argv[2];
  const language = (process.argv[3] as NotesLanguage) || "english";
  const model = process.argv[4] || process.env.GEMINI_MODEL || "gemini-3.8-flash";

  if (!url) {
    throw new Error('Usage: npm run pipeline -- "<youtube url>" [language] [model]');
  }

  const outDir = path.join(
    process.cwd(),
    "generated",
    "_pipeline",
    new Date().toISOString().replace(/[:.]/g, "-"),
  );

  await fs.mkdir(outDir, { recursive: true });

  const videoId = extractVideoId(url);
  console.log(`\nVideo ${videoId} | language=${language} | model=${model}\n`);

  let started = Date.now();
  const { transcript, sourceLanguage } = await fetchTranscript(videoId);
  record("transcript", transcript.length > 200, `${transcript.length} chars, lang=${sourceLanguage ?? "unknown"} (${Date.now() - started}ms)`);

  started = Date.now();
  const generated = await generateStructuredNotes(transcript, language, model);
  const elapsed = Date.now() - started;

  record(
    "gemini notes",
    generated.data.pages.length > 0,
    `${generated.data.pages.length} pages via ${generated.model} in ${elapsed}ms`,
  );
  record(
    "notes structure",
    generated.data.pages.every((page) => page.blocks.length > 0),
    `${generated.data.pages.reduce((sum, p) => sum + p.blocks.length, 0)} blocks total`,
  );
  record(
    "sticky notes per page",
    generated.data.pages.every((page) => page.blocks.some((b) => b.type === "stickynote")),
    "at least one stickynote on every page",
  );

  const notesPath = path.join(outDir, "notes.json");
  await fs.writeFile(notesPath, JSON.stringify(generated.data, null, 2));

  started = Date.now();
  const pdf = await generatePdf(generated.data);
  const bytes = pdf.byteLength;
  record("pdf bytes", pdf.subarray(0, 5).toString() === "%PDF-", `${bytes} bytes, %PDF header (${Date.now() - started}ms)`);
  record("pdf size", bytes > 20_000, `${Math.round(bytes / 1024)} KB`);

  const parsed = await PDFDocument.load(pdf);
  const physicalPages = parsed.getPageCount();
  record("pdf pages", physicalPages >= generated.data.pages.length, `${physicalPages} physical A4 pages for ${generated.data.pages.length} logical pages`);

  await fs.writeFile(path.join(outDir, "notes.pdf"), pdf);

  const html = renderNotesHtml(generated.data);
  record(
    "preview html",
    html.includes("notebook-page") && html.includes("spiral-binder") && !html.includes("undefined"),
    `${html.length} chars`,
  );
  await fs.writeFile(path.join(outDir, "notes.html"), html);

  console.log(`\nArtifacts: ${outDir}`);

  const failed = checks.filter((check) => !check.ok);
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("\nPipeline failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
