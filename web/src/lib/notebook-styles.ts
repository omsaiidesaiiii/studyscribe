import { NOTEBOOK_CSS } from "@shared/notebook-css";

/** The only place note markup is rendered in the app. */
const SCOPE = ".notebook-frame";

/**
 * The shared stylesheet is written for the PDF document, where the note markup
 * *is* the whole page. In the app it is injected into the same document as the
 * UI, so its bare selectors (`*`, `p, li`, `h2`, `.sticky-note`, …) would leak
 * into the app: that is what turned every paragraph into handwriting and reset
 * margins app-wide.
 *
 * Scoping each rule under `.notebook-frame` keeps the PDF output byte-identical
 * (the server never calls this) while confining the note styles to the viewer.
 * The stylesheet is flat — no at-rules — so a small scanner is enough.
 */
export function scopeNotebookCss(css: string, scope = SCOPE): string {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");

  return withoutComments.replace(/(^|\})([^{}]*)\{/g, (_match, brace: string, selectors: string) => {
    const trimmed = selectors.trim();
    if (!trimmed) return `${brace}${selectors}{`;

    const scoped = trimmed
      .split(",")
      .map((selector) => {
        const single = selector.trim();
        // `:root` becomes the scope itself so the custom properties still
        // cascade into every notebook descendant.
        if (single === ":root") return scope;
        if (single === "html" || single === "body") return scope;
        if (single.startsWith(`${scope} `) || single === scope) return single;
        return `${scope} ${single}`;
      })
      .join(", ");

    return `${brace}\n${scoped}{`;
  });
}

/**
 * Injects the PDF renderer's stylesheet, scoped to the notebook frame, so the
 * in-browser notebook is the same ruled paper, sticky notes and handwriting
 * fonts that come out of the download button — and nothing else.
 */
export function ensureNotebookStyles(): void {
  if (document.getElementById("notebook-styles")) return;

  const style = document.createElement("style");
  style.id = "notebook-styles";
  style.textContent = scopeNotebookCss(NOTEBOOK_CSS);
  document.head.appendChild(style);
}
