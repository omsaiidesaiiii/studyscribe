import type { NotesData, NoteBlock, NotesPage } from "../shared/types.js";
import {
  ARROW_STROKE,
  escapeHtml,
  inlineFormat,
  layoutDecisionDiagram,
  layoutFlowDiagram,
} from "../shared/geometry.js";
import { NOTEBOOK_CSS } from "../shared/notebook-css.js";

type Page = NotesPage;

type Block = NoteBlock;

type DiagramBlock = Extract<Block, { type: "diagram" }>;

type FlowDiagram = Extract<DiagramBlock, { kind: "flow" }>;

type DecisionDiagram = Extract<DiagramBlock, { kind: "decision" }>;

function renderBlock(block: Block): string {
  switch (block.type) {
    case "heading": {
      const num = block.number ? `${block.number}. ` : "";

      return `
        <h2 class="red-title">
          ${escapeHtml(num + block.text)}
        </h2>
      `;
    }

    case "sectionhead":
      return `
        <h3 class="section-head">
          ${escapeHtml(block.text)}
        </h3>
      `;

    case "paragraph":
      return `
        <p>${inlineFormat(block.html)}</p>
      `;

    case "bullets": {
      const items = block.items
        .map((item) => `<li>${inlineFormat(item)}</li>`)
        .join("\n");

      return `
        <ul>
          ${items}
        </ul>
      `;
    }

    case "stickynote": {
      const variantClass =
        block.variant === "pink"
          ? " sticky-pink"
          : block.variant === "green"
            ? " sticky-green"
            : "";

      const badge = block.badge
        ? `
          <span class="exam-tip-badge">
            ${escapeHtml(block.badge)}
          </span>
        `
        : "";

      return `
        <div class="sticky-note${variantClass}">
          ${badge}${inlineFormat(block.html)}
        </div>
      `;
    }

    case "table": {
      const headers = block.headers
        .map((header) => `<th>${escapeHtml(header)}</th>`)
        .join("");

      const rows = block.rows
        .map(
          (row) =>
            `<tr>${row
              .map((cell) => `<td>${inlineFormat(cell)}</td>`)
              .join("")}</tr>`,
        )
        .join("\n");

      return `
        <table class="notes-table">
          <thead>
            <tr>${headers}</tr>
          </thead>

          <tbody>
            ${rows}
          </tbody>
        </table>
      `;
    }

    case "codebox": {
      // Escape HTML but preserve the real newline characters returned by
      // Gemini — the prompt explicitly requires them.
      const code = escapeHtml(block.code);

      return `
        <div class="code-box">${code}</div>
      `;
    }

    case "diagram":
      return block.kind === "decision"
        ? renderDecisionDiagram(block)
        : renderFlowDiagram(block);

    default:
      return "";
  }
}

function renderFlowDiagram(block: FlowDiagram): string {
  const layout = layoutFlowDiagram(block.nodes);

  const boxes = layout.boxes
    .map(
      (box) => `
      <rect
        x="${box.x}"
        y="${box.y}"
        width="${box.width}"
        height="${box.height}"
        rx="${box.rx}"
        fill="${escapeHtml(box.fill)}"
        stroke="${escapeHtml(box.stroke)}"
        stroke-width="2"
      />

      <text
        x="${box.x + box.width / 2}"
        y="${box.y + box.height / 2 + 5}"
        text-anchor="middle"
        font-family="Kalam"
        font-size="13"
        fill="${escapeHtml(box.stroke)}"
      >
        ${escapeHtml(box.label)}
      </text>
    `,
    )
    .join("\n");

  const arrows = layout.lines
    .map(
      (line) => `
      <path
        d="M ${line.x1} ${line.y1} L ${line.x2} ${line.y2}"
        stroke="${ARROW_STROKE}"
        stroke-width="2"
      />
    `,
    )
    .join("\n");

  return `
    <div class="diagram-box">
      <div class="diagram-title">
        ${escapeHtml(block.title || "")}
      </div>

      <svg
        width="100%"
        height="${layout.height}"
        viewBox="0 0 ${layout.width} ${layout.height}"
        preserveAspectRatio="xMidYMid meet"
      >
        ${boxes}
        ${arrows}
      </svg>
    </div>
  `;
}

function renderDecisionDiagram(block: DecisionDiagram): string {
  const layout = layoutDecisionDiagram(block.root, block.left, block.right);

  function renderBox(box: typeof layout.root, sub?: string): string {
    return `
      <rect
        x="${box.x}"
        y="${box.y}"
        width="${box.width}"
        height="${box.height}"
        rx="${box.rx}"
        fill="${escapeHtml(box.fill)}"
        stroke="${escapeHtml(box.stroke)}"
        stroke-width="2"
      />

      <text
        x="${box.x + box.width / 2}"
        y="${box.y + 20}"
        text-anchor="middle"
        font-family="Kalam"
        font-size="13"
        fill="${escapeHtml(box.stroke)}"
      >
        ${escapeHtml(box.label)}
      </text>

      ${
        sub
          ? `
        <text
          x="${box.x + box.width / 2}"
          y="${box.y + 35}"
          text-anchor="middle"
          font-family="Kalam"
          font-size="10"
          fill="#555"
        >
          ${escapeHtml(sub)}
        </text>
      `
          : ""
      }
    `;
  }

  const arrows = layout.lines
    .map(
      (line) => `
      <path
        d="M ${line.x1} ${line.y1} L ${line.x2} ${line.y2}"
        stroke="${ARROW_STROKE}"
        stroke-width="2"
      />
    `,
    )
    .join("\n");

  return `
    <div class="diagram-box">
      <div class="diagram-title">
        ${escapeHtml(block.title || "")}
      </div>

      <svg
        width="100%"
        height="${layout.height}"
        viewBox="0 0 ${layout.width} ${layout.height}"
        preserveAspectRatio="xMidYMid meet"
      >
        ${renderBox(layout.root)}
        ${arrows}
        ${renderBox(layout.left, layout.leftSub)}
        ${renderBox(layout.right, layout.rightSub)}
      </svg>
    </div>
  `;
}

function renderPage(
  page: Page,
  subject: string,
  index: number,
  totalPages: number,
): string {
  const pageNum = String(index + 1).padStart(2, "0");

  const totalStr = String(totalPages).padStart(2, "0");

  const activeClass = index === 0 ? " active-page" : "";

  const doodles = (page.doodles ?? [])
    .map(
      (doodle) => `
        <div
          class="margin-doodle"
          style="top: ${Number(doodle.top) || 0}px;"
        >
          ${escapeHtml(doodle.text)}
        </div>
        `,
    )
    .join("\n");

  const blocksHtml = page.blocks.map(renderBlock).join("\n\n");

  const rings = Array(12).fill('<div class="ring"></div>').join("");

  return `
    <div
      class="notebook-page${activeClass}"
      id="page-${index + 1}"
    >

      <div class="spiral-binder">
        ${rings}
      </div>

      <div class="page-header">
        <span>
          SUBJECT:
          ${escapeHtml(subject)}
        </span>

        <span>
          TOPIC:
          ${escapeHtml(page.topic)}
        </span>

        <span>
          PAGE:
          ${pageNum} / ${totalStr}
        </span>
      </div>

      ${doodles}

      ${blocksHtml}

      <div class="page-footer">
        <span>
          Handwritten Study Notes —
          Page ${index + 1}
        </span>

        <span>
          Target: Exam Mastery
        </span>
      </div>

    </div>
  `;
}

// Renders exactly one page, standalone.
//
// Used for per-page isolated PDF rendering. The page is intentionally allowed
// to grow beyond its minimum height if its content overflows.
export function renderSinglePageHtml(
  page: Page,
  subject: string,
  index: number,
  totalPages: number,
): string {
  const pageHtml = renderPage(page, subject, index, totalPages);

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">

    <link
        rel="preconnect"
        href="https://fonts.googleapis.com"
    >

    <link
        rel="preconnect"
        href="https://fonts.gstatic.com"
        crossorigin
    >

    <link
        href="https://fonts.googleapis.com/css2?family=Architects+Daughter&family=Caveat:wght@600;700&family=Kalam:wght@300;400;700&family=Permanent+Marker&display=swap"
        rel="stylesheet"
    >

    <style>
        ${NOTEBOOK_CSS}

        @page {
            size: A4 portrait;
            margin: 0;
        }

        html,
        body {
            margin: 0;
            padding: 0;
            width: 100%;
            min-height: 100%;
            background: none;
        }

        /*
         * This fixed layer is the important part.
         *
         * Chromium can split a logical .notebook-page across multiple
         * physical A4 sheets. A normal element background does not reliably
         * give every fragmented physical sheet the notebook-paper look,
         * so the ruled paper is painted on a fixed, full-page layer.
         */
        body::before {
            content: "";
            position: fixed;
            inset: 0;
            z-index: -1;
            pointer-events: none;

            background-color: var(--paper-bg);

            background-image:
                linear-gradient(
                    to right,
                    transparent 0,
                    transparent 74px,
                    var(--margin-line) 74px,
                    var(--margin-line) 76px,
                    transparent 76px
                ),
                linear-gradient(
                    var(--line-color) 1px,
                    transparent 1px
                );

            background-size:
                100% 100%,
                100% 32px;

            background-position:
                0 0,
                0 0;

            background-repeat:
                no-repeat,
                repeat;
        }

        /* The actual notebook page becomes transparent in PDF mode so the
         * fixed ruled-paper background can continue underneath fragmented
         * content. */
        .notebook-page {
            min-height: 1080px;
            display: block !important;
            margin-bottom: 0 !important;

            background-color: transparent;
            background-image: none;
        }

        .code-box {
            white-space: pre-wrap;
            overflow-wrap: anywhere;
        }

        .diagram-box {
            overflow: hidden;
        }

        .diagram-box svg {
            display: block;
            max-width: 100%;
            height: auto;
            margin: 0 auto;
        }
    </style>
</head>

<body>

    <div class="notebook-wrapper">
        ${pageHtml}
    </div>

</body>
</html>`;
}

/**
 * Standalone, self-contained HTML view of a whole notebook: every page is
 * rendered in the same handwriting template the PDF uses, with page navigation.
 * Served by GET /generate/:id/preview.
 */
export function renderNotesHtml(data: NotesData): string {
  const pagesHtml = data.pages
    .map((page, index) => renderPage(page, data.subject, index, data.pages.length))
    .join("\n");

  const navButtons = data.pages
    .map(
      (page, index) => `
        <button
          class="nav-btn${index === 0 ? " active" : ""}"
          data-page="${index + 1}"
        >
          Page ${index + 1}:
          ${escapeHtml(page.topic)}
        </button>
      `,
    )
    .join("\n");

  return `<!DOCTYPE html>

<html lang="en">

<head>

  <meta charset="UTF-8">

  <meta
    name="viewport"
    content="width=device-width, initial-scale=1.0"
  >

  <title>
    ${escapeHtml(data.title)}
  </title>

  <link
    rel="preconnect"
    href="https://fonts.googleapis.com"
  >

  <link
    rel="preconnect"
    href="https://fonts.gstatic.com"
    crossorigin
  >

  <link
    href="https://fonts.googleapis.com/css2?family=Architects+Daughter&family=Caveat:wght@600;700&family=Kalam:wght@300;400;700&family=Permanent+Marker&display=swap"
    rel="stylesheet"
  >

  <style>
    ${NOTEBOOK_CSS}
  </style>

</head>

<body>

  <div class="top-bar">

    <h1>
      🧠 ${escapeHtml(data.title)}
    </h1>

    <div class="nav-buttons">

      ${navButtons}

      <button class="nav-btn" id="view-all">
        📄 View All
      </button>

    </div>

  </div>

  <div class="notebook-wrapper">
    ${pagesHtml}
  </div>

  <script>
    var pages = document.querySelectorAll(".notebook-page");
    var buttons = document.querySelectorAll(".nav-btn[data-page]");

    function switchPage(pageNum) {
      pages.forEach(function (page) {
        page.classList.remove("active-page");
      });

      var target = document.getElementById("page-" + pageNum);
      if (target) {
        target.classList.add("active-page");
      }

      buttons.forEach(function (button) {
        button.classList.toggle(
          "active",
          Number(button.dataset.page) === pageNum
        );
      });
    }

    buttons.forEach(function (button) {
      button.addEventListener("click", function () {
        switchPage(Number(button.dataset.page));
      });
    });

    document.getElementById("view-all").addEventListener("click", function () {
      pages.forEach(function (page) {
        page.classList.add("active-page");
      });
      buttons.forEach(function (button) {
        button.classList.remove("active");
      });
    });
  </script>

</body>

</html>`;
}
