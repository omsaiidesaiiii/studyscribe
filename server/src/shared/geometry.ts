// Geometry + escaping helpers shared by the server PDF renderer and the React
// notebook viewer, so the same notes data lays out identically in the browser
// preview and in the printed PDF.

import type { DiagramNode } from "./types.js";

export type Box = {
  x: number;
  y: number;
  width: number;
  height: number;
  rx: number;
  label: string;
  fill: string;
  stroke: string;
};

export type Line = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

export type FlowLayout = {
  kind: "flow";
  width: number;
  height: number;
  boxes: Box[];
  lines: Line[];
};

export type DecisionLayout = {
  kind: "decision";
  width: number;
  height: number;
  root: Box;
  left: Box;
  right: Box;
  leftSub?: string;
  rightSub?: string;
  lines: Line[];
};

export const FLOW_GAP = 30;
export const FLOW_BOX_HEIGHT = 50;
export const FLOW_BOX_Y = 25;
export const ARROW_STROKE = "#cc0000";
export const FONT_STACK_HAND = "Kalam, cursive";

/**
 * Escapes every HTML-significant character before model output is
 * interpolated into markup — model output is never treated as trusted HTML.
 *
 * Quotes are escaped too: diagram `fill`/`stroke` values from the model are
 * interpolated into double-quoted SVG attributes, and an unescaped quote there
 * would let model output break out of the attribute.
 */
export function escapeHtml(text = ""): string {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Allows only the small inline markup vocabulary the notes prompt asks for
 * (<hl>, <circle>, <under>) and escapes everything else.
 */
export function inlineFormat(html = ""): string {
  return escapeHtml(html)
    .replace(/&lt;hl&gt;/g, '<span class="highlight">')
    .replace(/&lt;\/hl&gt;/g, "</span>")
    .replace(/&lt;circle&gt;/g, '<span class="rough-circle">')
    .replace(/&lt;\/circle&gt;/g, "</span>")
    .replace(/&lt;under&gt;/g, '<span class="hand-underline">')
    .replace(/&lt;\/under&gt;/g, "</span>");
}

/**
 * Diagram labels sit inside fixed-size SVG boxes; overflowing labels overlap
 * visually, so they are trimmed at a word boundary.
 */
export function truncateLabel(text: string, maxLen: number): string {
  const clean = String(text ?? "").trim();

  if (clean.length <= maxLen) {
    return clean;
  }

  const hardCut = clean.slice(0, maxLen - 1);
  const lastSpace = hardCut.lastIndexOf(" ");
  const wordBoundaryCut = lastSpace > maxLen * 0.4 ? hardCut.slice(0, lastSpace) : hardCut;

  return wordBoundaryCut.trimEnd() + "…";
}

export function layoutFlowDiagram(nodes: DiagramNode[]): FlowLayout {
  const widths = nodes.map((node) =>
    Math.min(220, Math.max(100, truncateLabel(node.label, 24).length * 8 + 24)),
  );

  const width =
    widths.reduce((sum, boxWidth) => sum + boxWidth, 0) +
    FLOW_GAP * Math.max(nodes.length - 1, 0) +
    20;

  const boxes: Box[] = [];
  const lines: Line[] = [];

  let x = 10;

  nodes.forEach((node, index) => {
    const boxWidth = widths[index];

    boxes.push({
      x,
      y: FLOW_BOX_Y,
      width: boxWidth,
      height: FLOW_BOX_HEIGHT,
      rx: 8,
      label: truncateLabel(node.label, 24),
      fill: node.fill || "#e3f2fd",
      stroke: node.stroke || "#0b3c85",
    });

    if (index < nodes.length - 1) {
      lines.push({
        x1: x + boxWidth + 5,
        y1: FLOW_BOX_Y + FLOW_BOX_HEIGHT / 2,
        x2: x + boxWidth + FLOW_GAP - 5,
        y2: FLOW_BOX_Y + FLOW_BOX_HEIGHT / 2,
      });
    }

    x += boxWidth + FLOW_GAP;
  });

  return { kind: "flow", width, height: FLOW_BOX_HEIGHT + 50, boxes, lines };
}

/**
 * The decision diagram uses a fixed 600x130 coordinate space so the branch
 * arrows always land on the same anchors.
 */
export function layoutDecisionDiagram(
  root: DiagramNode,
  left: DiagramNode & { sub?: string },
  right: DiagramNode & { sub?: string },
): DecisionLayout {
  return {
    kind: "decision",
    width: 600,
    height: 130,
    root: {
      x: 220,
      y: 10,
      width: 160,
      height: 40,
      rx: 8,
      label: truncateLabel(root.label, 20),
      fill: root.fill || "#e3f2fd",
      stroke: root.stroke || "#0b3c85",
    },
    left: {
      x: 50,
      y: 80,
      width: 160,
      height: 40,
      rx: 8,
      label: truncateLabel(left.label, 20),
      fill: left.fill || "#e8f5e9",
      stroke: left.stroke || "#388e3c",
    },
    right: {
      x: 390,
      y: 80,
      width: 160,
      height: 40,
      rx: 8,
      label: truncateLabel(right.label, 20),
      fill: right.fill || "#ffe0b2",
      stroke: right.stroke || "#f57c00",
    },
    leftSub: left.sub ? truncateLabel(left.sub, 26) : undefined,
    rightSub: right.sub ? truncateLabel(right.sub, 26) : undefined,
    lines: [
      { x1: 240, y1: 50, x2: 130, y2: 80 },
      { x1: 360, y1: 50, x2: 470, y2: 80 },
    ],
  };
}
