/**
 * Inline SVG doodles — hand-drawn notebook style.
 *
 * Everything here is drawn with plain paths and the ink/accent colors, so the
 * app ships no external images. All of them are decorative: they are marked
 * `aria-hidden` and take their size from CSS (or a `size` prop).
 */

const INK = "#111111";
const PINK = "#ff7a9c";
const YELLOW = "#ffe600";
const LIME = "#c6f135";
const VIOLET = "#7b5cff";
const CYAN = "#3dd6f5";
const ORANGE = "#ff7a1a";

/** Tick inside a small box — used by the hero check list and feature lists. */
export function CheckBox({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      aria-hidden="true"
      focusable="false"
    >
      <rect
        x="1.5"
        y="1.5"
        width="17"
        height="17"
        rx="3"
        fill={LIME}
        stroke={INK}
        strokeWidth="2"
      />
      <path
        d="M5.5 10.5l3 3 6-7"
        fill="none"
        stroke={INK}
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Hand-drawn arrow between the how-it-works cards. */
export function PinkArrow({ className = "", horizontal = true }: { className?: string; horizontal?: boolean }) {
  return (
    <svg
      className={className}
      viewBox="0 0 60 30"
      aria-hidden="true"
      focusable="false"
      style={horizontal ? undefined : { transform: "rotate(90deg)" }}
    >
      <path
        d="M2 18c14-8 30-10 44-6"
        fill="none"
        stroke={PINK}
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M38 12l12-1-6 10"
        fill="none"
        stroke={PINK}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Wobbly underline for a headline word. */
export function WobblyUnderline({ width = 160 }: { width?: number }) {
  return (
    <svg width={width} height="12" viewBox="0 0 160 12" aria-hidden="true" focusable="false">
      <path
        d="M2 8c22-5 44-6 66-3 22 3 44 3 66-1"
        fill="none"
        stroke={YELLOW}
        strokeWidth="6"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Sparkle burst, used next to headings and stickers. */
export function Sparkle({ size = 28, color = INK }: { size?: number; color?: string }) {
  return (
    <svg
      className="scribble"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M12 2v6M12 16v6M2 12h6M16 12h6" stroke={color} strokeWidth="2" />
      <path d="M12 7l1.6 3.4L17 12l-3.4 1.6L12 17l-1.6-3.4L7 12l3.4-1.6z" fill={YELLOW} stroke={color} strokeWidth="1.5" />
    </svg>
  );
}

/** Outlined star doodle (hero visual). */
export function StarDoodle({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path
        d="M24 4l6 14 15 1-11 10 3 15-13-8-13 8 3-15L3 19l15-1z"
        fill="none"
        stroke={INK}
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Smiley doodle — "That's it!" and the sticky note. */
export function SmileyDoodle({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <circle cx="24" cy="24" r="19" fill={YELLOW} stroke={INK} strokeWidth="2.5" />
      <circle cx="17" cy="20" r="2.2" fill={INK} />
      <circle cx="31" cy="20" r="2.2" fill={INK} />
      <path
        d="M15 29c3 5 15 5 18 0"
        fill="none"
        stroke={INK}
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Small graph diagram with numbered nodes (hero notebook page). */
export function GraphDoodle({ className = "" }: { className?: string }) {
  const nodes = [
    { x: 18, y: 20, label: "1" },
    { x: 84, y: 10, label: "3" },
    { x: 58, y: 56, label: "2" },
    { x: 112, y: 40, label: "4" },
  ];

  return (
    <svg className={className} viewBox="0 0 130 70" aria-hidden="true" focusable="false">
      <path d="M18 20l40 36 26-46 28 30" fill="none" stroke={INK} strokeWidth="2" />
      {nodes.map((node) => (
        <g key={node.label}>
          <circle cx={node.x} cy={node.y} r="11" fill="#fff" stroke={INK} strokeWidth="2" />
          <text
            x={node.x}
            y={node.y + 4}
            textAnchor="middle"
            fontSize="12"
            fontFamily="Kalam, cursive"
            fill={INK}
          >
            {node.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

/** Array diagram: boxes with low / mid / high markers. */
export function ArrayDoodle({ className = "" }: { className?: string }) {
  const cells = [VIOLET, YELLOW, PINK, LIME, CYAN];

  return (
    <svg className={className} viewBox="0 0 150 54" aria-hidden="true" focusable="false">
      {cells.map((fill, index) => (
        <rect
          key={index}
          x={6 + index * 28}
          y="8"
          width="26"
          height="20"
          rx="3"
          fill={fill}
          stroke={INK}
          strokeWidth="2"
        />
      ))}
      <path d="M12 32v6M68 32v6M124 32v6" stroke={INK} strokeWidth="2" />
      <text x="12" y="50" fontSize="10" fontFamily="Kalam, cursive" fill={INK}>
        low
      </text>
      <text x="62" y="50" fontSize="10" fontFamily="Kalam, cursive" fill={INK}>
        mid
      </text>
      <text x="118" y="50" fontSize="10" fontFamily="Kalam, cursive" fill={INK}>
        high
      </text>
    </svg>
  );
}

/** Three-book stack: CODE / LEARN / GROW. */
export function BookStack() {
  const books = [
    { label: "CODE", className: "violet" },
    { label: "LEARN", className: "yellow" },
    { label: "GROW", className: "pink" },
  ];

  return (
    <div className="book-stack" aria-hidden="true">
      {books.map((book) => (
        <div className={`book ${book.className}`} key={book.label}>
          <span className="spine" />
          <span className="page">
            <span className="line" />
            <span className="line" />
            <span className="line" />
          </span>
          <span className="label">{book.label}</span>
        </div>
      ))}
    </div>
  );
}

/** Spiral-bound notebook page used inside illustrations (no text). */
export function SpiralPage({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 160 200" aria-hidden="true" focusable="false">
      <rect x="14" y="6" width="140" height="188" rx="6" fill="#fff" stroke={INK} strokeWidth="3" />
      <path d="M40 6v188" stroke="#ff5c5c" strokeWidth="3" />
      {Array.from({ length: 9 }, (_, index) => (
        <circle
          key={index}
          cx="10"
          cy={22 + index * 20}
          r="6"
          fill="#fff"
          stroke={INK}
          strokeWidth="3"
        />
      ))}
      {Array.from({ length: 6 }, (_, index) => (
        <path
          key={index}
          d={`M52 ${42 + index * 24}h88`}
          stroke="#e3e0d2"
          strokeWidth="2"
        />
      ))}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Feature tile icons (5 colors, one per feature)
// ---------------------------------------------------------------------------
const iconProps = {
  width: 30,
  height: 30,
  viewBox: "0 0 32 32",
  "aria-hidden": true as const,
  focusable: "false" as const,
};

export function YouTubeIcon() {
  return (
    <svg {...iconProps}>
      <rect x="2" y="7" width="28" height="18" rx="5" fill="#fff" stroke={INK} strokeWidth="2.5" />
      <path d="M13 12l8 4-8 4z" fill={INK} />
    </svg>
  );
}

export function GlobeIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="16" cy="16" r="12" fill="#fff" stroke={INK} strokeWidth="2.5" />
      <path d="M4 16h24M16 4c4 4 4 20 0 24M16 4c-4 4-4 20 0 24" fill="none" stroke={INK} strokeWidth="2" />
    </svg>
  );
}

export function SparkIcon() {
  return (
    <svg {...iconProps}>
      <path
        d="M16 3l3 9 9 3-9 3-3 9-3-9-9-3 9-3z"
        fill="#fff"
        stroke={INK}
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function PrinterIcon() {
  return (
    <svg {...iconProps}>
      <rect x="7" y="4" width="18" height="8" rx="2" fill="#fff" stroke={INK} strokeWidth="2.5" />
      <rect x="3" y="13" width="26" height="10" rx="3" fill="#fff" stroke={INK} strokeWidth="2.5" />
      <rect x="8" y="21" width="16" height="8" rx="2" fill="#fff" stroke={INK} strokeWidth="2.5" />
    </svg>
  );
}

export function BoltIcon() {
  return (
    <svg {...iconProps}>
      <path d="M18 3L7 18h7l-2 11 11-15h-7z" fill="#fff" stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
    </svg>
  );
}

export function LinkIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <path
        d="M13 19l6-6M11 12l3-3a5 5 0 017 7l-3 3M21 20l-3 3a5 5 0 01-7-7l3-3"
        fill="none"
        stroke={INK}
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function LanguageIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <path d="M4 7h11M9 5v2c0 6-2 10-5 12M7 12c1 4 4 6 7 7" fill="none" stroke={INK} strokeWidth="2.4" strokeLinecap="round" />
      <path d="M16 27l5-13 5 13M18 22h6" fill="none" stroke={INK} strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

export function ReceiptIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <path d="M8 3h16v26l-4-3-4 3-4-3-4 3z" fill="#fff" stroke={INK} strokeWidth="2.4" strokeLinejoin="round" />
      <path d="M12 11h8M12 17h8" stroke={INK} strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

/** Wobbly hand-drawn underline used by the notebook sample heading. */
export function MarkerStroke({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 120 10" aria-hidden="true" focusable="false">
      <path d="M2 6c20-4 60-5 116-2" fill="none" stroke={YELLOW} strokeWidth="7" strokeLinecap="round" />
    </svg>
  );
}

/** Small spiral notebook page for empty states. */
export function NotebookDoodle({ size = 56 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <rect x="12" y="6" width="44" height="52" rx="4" fill="#fff" stroke={INK} strokeWidth="3" />
      <path d="M24 6v52" stroke="#ff5c5c" strokeWidth="3" />
      {Array.from({ length: 5 }, (_, index) => (
        <path
          key={index}
          d={`M30 ${16 + index * 9}h20`}
          stroke="#e3e0d2"
          strokeWidth="2"
        />
      ))}
      {Array.from({ length: 6 }, (_, index) => (
        <circle
          key={index}
          cx="7"
          cy={12 + index * 8}
          r="3.4"
          fill="#fff"
          stroke={INK}
          strokeWidth="3"
        />
      ))}
    </svg>
  );
}

export function SadFace({ size = 48 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <circle cx="24" cy="24" r="19" fill="#fff" stroke={INK} strokeWidth="2.5" />
      <circle cx="17" cy="20" r="2.2" fill={INK} />
      <circle cx="31" cy="20" r="2.2" fill={INK} />
      <path d="M15 33c4-5 14-5 18 0" fill="none" stroke={INK} strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

export function CloudOff({ size = 48 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path
        d="M12 32a8 8 0 010-16 10 10 0 0119-2 7 7 0 014 13"
        fill="#fff"
        stroke={INK}
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path d="M8 8l32 32" stroke={ORANGE} strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
