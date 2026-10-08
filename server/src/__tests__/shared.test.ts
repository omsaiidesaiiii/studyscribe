import { describe, expect, it } from "vitest";
import {
  escapeHtml,
  inlineFormat,
  layoutDecisionDiagram,
  layoutFlowDiagram,
  truncateLabel,
} from "../shared/geometry.js";
import { modelFallbackChain, MODEL_OPTIONS, DEFAULT_MODEL } from "../shared/models.js";

describe("escapeHtml", () => {
  it("neutralises every HTML-significant character", () => {
    expect(escapeHtml('<script>alert("x")</script>')).toBe(
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;",
    );
  });

  it("escapes quotes so model data cannot break out of an attribute", () => {
    expect(escapeHtml('red\" onload=\"alert(1)')).toBe(
      'red&quot; onload=&quot;alert(1)',
    );
    expect(escapeHtml("it's")).toBe("it&#39;s");
  });

  it("escapes ampersands before angle brackets", () => {
    expect(escapeHtml("a & b < c")).toBe("a &amp; b &lt; c");
  });
});

describe("inlineFormat", () => {
  it("keeps the three whitelisted markup tags", () => {
    expect(inlineFormat("<hl>key idea</hl>")).toBe(
      '<span class="highlight">key idea</span>',
    );
    expect(inlineFormat("<circle>x</circle>")).toContain('class="rough-circle"');
    expect(inlineFormat("<under>y</under>")).toContain('class="hand-underline"');
  });

  it("escapes anything else the model tries to inject", () => {
    const formatted = inlineFormat('<img src=x onerror="alert(1)">bold');
    expect(formatted).not.toContain("<img");
    expect(formatted).toContain("&lt;img");
  });
});

describe("truncateLabel", () => {
  it("leaves short labels alone", () => {
    expect(truncateLabel("Human Text", 24)).toBe("Human Text");
  });

  it("cuts at a word boundary and appends an ellipsis", () => {
    const result = truncateLabel("A very long diagram label that would overlap", 20);
    expect(result.endsWith("…")).toBe(true);
    expect(result.length).toBeLessThanOrEqual(21);
    expect(result).not.toContain("  ");
  });
});

describe("diagram layout", () => {
  it("lays flow nodes out left to right with connector arrows", () => {
    const layout = layoutFlowDiagram([
      { label: "Input" },
      { label: "Model" },
      { label: "Notes" },
    ]);

    expect(layout.boxes).toHaveLength(3);
    expect(layout.lines).toHaveLength(2);
    expect(layout.boxes[1].x).toBeGreaterThan(layout.boxes[0].x);
    expect(layout.lines[0].x2).toBeGreaterThan(layout.lines[0].x1);
    expect(layout.height).toBeGreaterThan(0);
  });

  it("gives every decision box a fill and stroke", () => {
    const layout = layoutDecisionDiagram(
      { label: "Decision" },
      { label: "Yes", sub: "do it" },
      { label: "No" },
    );

    for (const box of [layout.root, layout.left, layout.right]) {
      expect(box.fill).toMatch(/^#/);
      expect(box.stroke).toMatch(/^#/);
    }

    expect(layout.leftSub).toBe("do it");
    expect(layout.lines).toHaveLength(2);
  });
});

describe("model fallback", () => {
  it("puts the requested model first and never repeats it", () => {
    const chain = modelFallbackChain("gemini-3.7-flash");

    expect(chain[0]).toBe("gemini-3.7-flash");
    expect(new Set(chain).size).toBe(chain.length);
    expect(chain.length).toBeGreaterThan(1);
  });

  it("defaults to a model the UI offers", () => {
    expect(MODEL_OPTIONS.some((option) => option.id === DEFAULT_MODEL)).toBe(true);
  });
});
