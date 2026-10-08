import { describe, expect, it } from "vitest";
import { renderNotesHtml, renderSinglePageHtml } from "../services/renderer.service.js";
import type { NotesData } from "../shared/types.js";

const host = "<script>alert('pwned')</script>";
const image = '<img src=x onerror="alert(1)">';

/** Injection attempts are placed in every field the model controls. */
const notes: NotesData = {
  title: "Photosynthesis <b>basics</b>",
  subject: "Biology",
  pages: [
    {
      topic: "Light <script>topic()</script>",
      doodles: [{ top: 40, text: "imp!" }],
      blocks: [
        { type: "heading", number: "01", text: `Overview ${host}` },
        { type: "sectionhead", text: `Details ${image}` },
        { type: "paragraph", html: `Plants use <hl>light</hl> ${host}` },
        { type: "bullets", items: [`Chlorophyll ${host}`, "Stomata"] },
        {
          type: "stickynote",
          variant: "pink",
          badge: "Exam tip",
          html: `Remember <under>ATP</under>. ${image}`,
        },
        {
          type: "table",
          headers: [`Input ${host}`, "Output"],
          rows: [[`Light ${image}`, "Glucose"]],
        },
        { type: "codebox", code: "def f(x):\n    return x * 2" },
        {
          type: "diagram",
          kind: "flow",
          title: `Pipeline ${host}`,
          nodes: [{ label: `Sun ${host}` }, { label: "Leaf" }],
        },
        {
          type: "diagram",
          kind: "decision",
          title: "Is it sunny?",
          root: { label: `Check sky ${image}` },
          left: { label: "Go out", sub: "picnic" },
          right: { label: "Stay in" },
        },
      ],
    },
  ],
};

describe("renderSinglePageHtml", () => {
  const html = renderSinglePageHtml(notes.pages[0], notes.subject, 0, 1);

  it("never emits raw markup from model output", () => {
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
  });

  it("cannot break out of SVG attributes with diagram colours", () => {
    // fill/stroke are model-supplied and land inside double-quoted attributes,
    // so an unescaped quote there would end the attribute and inject a new one.
    const malicious = renderSinglePageHtml(
      {
        topic: "T",
        blocks: [
          {
            type: "diagram",
            kind: "flow",
            title: "T",
            nodes: [{ label: "L", fill: 'red" onload="alert(1)', stroke: "#000" }],
          },
        ],
      },
      "S",
      0,
      1,
    );

    expect(malicious).not.toContain('fill="red"');
    expect(malicious).not.toContain('onload="alert(1)"');
    expect(malicious).toContain("red&quot; onload=&quot;alert(1)");
  });

  it("escapes injected text in every block field", () => {
    expect(html).toContain("&lt;script&gt;alert(&#39;pwned&#39;)&lt;/script&gt;");
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  });

  it("keeps the whitelisted inline markup", () => {
    expect(html).toContain('class="highlight"');
    expect(html).toContain('class="hand-underline"');
  });

  it("renders every block type into the notebook template", () => {
    expect(html).toContain("sticky-pink");
    expect(html).toContain("exam-tip-badge");
    expect(html).toContain("notes-table");
    expect(html).toContain("code-box");
    expect(html).toContain("diagram-box");
    expect(html).toContain("margin-doodle");
    expect(html).toContain("spiral-binder");
  });

  it("preserves real newlines inside code boxes", () => {
    expect(html).toContain("return x * 2");
  });

  it("inlines the shared stylesheet and A4 print rules", () => {
    expect(html).toContain("--paper-bg");
    expect(html).toContain("size: A4 portrait");
    expect(html).not.toContain("undefined");
  });

  it("writes the subject and page number into the header", () => {
    expect(html).toContain("SUBJECT:");
    expect(html).toContain("Biology");
    expect(html).toContain("PAGE:");
    expect(html).toContain("01 / 01");
  });
});

describe("renderNotesHtml", () => {
  const html = renderNotesHtml(notes);

  it("is a standalone page with navigation", () => {
    expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(html).toContain('data-page="1"');
    expect(html).toContain("View All");
  });

  it("escapes the title", () => {
    expect(html).toContain("&lt;b&gt;basics&lt;/b&gt;");
    expect(html).not.toContain("<b>basics</b>");
  });
});
