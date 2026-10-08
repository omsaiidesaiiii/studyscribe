import { useEffect, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useGoogleClientId } from "@/lib/google";
import { GoogleLogin } from "@react-oauth/google";
import type { ButtonHTMLAttributes, InputHTMLAttributes } from "react";
import type { GenerationStatus } from "@/lib/types";
import { CloudOff, SadFace } from "./doodles";

/**
 * StudyScribe shared UI kit.
 *
 * Every component renders the hand-drawn notebook neo-brutal design system:
 *  3px ink borders · hard 5px 5px 0 ink shadows · 6-10px radius · no blur,
 *  no gradients · slight rotation only on stickers and label badges.
 *
 * Pages compose these instead of inventing their own boxes, so every screen
 * shares the same frame, spacing and focus treatment.
 */

export const COVER_TONES = ["yellow", "pink", "violet", "cyan", "orange"] as const;
export type CoverTone = (typeof COVER_TONES)[number];

/** Deterministic cover color for a notebook, so a notebook keeps its color. */
export function coverToneFor(seed: string): CoverTone {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash + seed.charCodeAt(index)) % 997;
  }
  return COVER_TONES[hash % COVER_TONES.length];
}

// ---------------------------------------------------------------------------
// Button — lift on hover, press on active
// ---------------------------------------------------------------------------
type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "white" | "violet" | "danger" | "ink" | "cyan" | "green";
  size?: "sm" | "md";
};

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ButtonProps) {
  const variants = {
    primary: "btn btn-primary",
    white: "btn btn-white",
    violet: "btn btn-violet",
    danger: "btn btn-danger",
    ink: "btn btn-ink",
    cyan: "btn btn-cyan",
    green: "btn btn-green",
  } as const;

  return (
    <button
      {...props}
      className={`${variants[variant]} ${
        size === "sm" ? "btn-sm" : ""
      } ${className}`.trim()}
    />
  );
}

/** Anchor that looks exactly like a Button (links are not buttons). */
export function ButtonLink({
  href,
  children,
  variant = "primary",
  className = "",
  external = false,
}: {
  href: string;
  children: ReactNode;
  variant?: "primary" | "white" | "violet" | "ink";
  className?: string;
  external?: boolean;
}) {
  const cls = `btn btn-${variant} ${className}`.trim();

  if (external) {
    return (
      <a className={cls} href={href} target="_blank" rel="noreferrer">
        {children}
      </a>
    );
  }

  return (
    <Link className={cls} to={href}>
      {children}
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Card + Sheet (form card with spiral holes and a red margin line)
// ---------------------------------------------------------------------------
export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`card ${className}`.trim()}>{children}</div>;
}

export function Sheet({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`sheet ${className}`.trim()}>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Field + Label + Hint + TextInput + Select
// ---------------------------------------------------------------------------
export function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div className="field">
      <label className="field-label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint ? <span className="field-hint">{hint}</span> : null}
    </div>
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  const { className = "", ...rest } = props;
  return <input {...rest} className={`input ${className}`.trim()} />;
}

export function Select(props: InputHTMLAttributes<HTMLSelectElement>) {
  const { className = "", children, ...rest } = props;
  return (
    <select {...rest} className={`select ${className}`.trim()}>
      {children}
    </select>
  );
}

// ---------------------------------------------------------------------------
// Chip / toggle (aria-pressed, yellow when selected)
// ---------------------------------------------------------------------------
export function Chip({
  active,
  children,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      {...props}
      type={props.type ?? "button"}
      className={`chip ${active ? "chip-active" : ""} ${className}`.trim()}
      aria-pressed={props["aria-pressed"] ?? active}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Sticker (tilted, small rotation only)
// ---------------------------------------------------------------------------
export function Sticker({
  children,
  className = "",
  rotated = true,
}: {
  children: ReactNode;
  className?: string;
  rotated?: boolean;
}) {
  return (
    <span className={`sticker ${rotated ? "sticker-rotated" : ""} ${className}`.trim()}>
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Badge (tiny all-caps) + StatusPill
// ---------------------------------------------------------------------------
export function Badge({
  children,
  tone = "yellow",
}: {
  children: ReactNode;
  tone?: "yellow" | "green" | "cyan" | "pink" | "red" | "white";
}) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function StatusPill({
  status,
}: {
  status: GenerationStatus | "done" | "failed" | "pending" | "processing";
}) {
  const tone = String(status).toLowerCase();

  const label =
    tone === "done" || tone === "completed"
      ? "Ready"
      : tone === "processing"
        ? "Writing"
        : tone === "pending"
          ? "Queued"
          : tone === "failed"
            ? "Failed"
            : tone;

  const badgeTone =
    tone === "processing"
      ? "yellow"
      : tone === "done" || tone === "completed"
        ? "green"
        : tone === "failed"
          ? "red"
          : "white";

  return (
    <span data-status={tone} className="pill">
      <Badge tone={badgeTone as "yellow" | "green" | "red" | "white"}>{label}</Badge>
    </span>
  );
}

// ---------------------------------------------------------------------------
// BookCard — a notebook with a colored cover
// ---------------------------------------------------------------------------
export function BookCard({
  to,
  cover,
  eyebrow,
  title,
  meta,
  status,
  action,
}: {
  to?: string;
  cover: CoverTone;
  eyebrow?: string;
  title: string;
  meta?: ReactNode;
  status?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <article className="book-card">
      <div className={`book-cover ${cover}`}>
        <span className="cover-label">{eyebrow ?? "Notebook"}</span>
      </div>

      <div className="book-body">
        {status ? <div className="row">{status}</div> : null}

        <h3 className="title">
          {to ? (
            <Link to={to} className="no-underline">
              {title}
            </Link>
          ) : (
            title
          )}
        </h3>

        {meta ? <div className="meta">{meta}</div> : null}

        {action ? <div className="row">{action}</div> : null}
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Spinner / Skeleton
// ---------------------------------------------------------------------------
export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <span role="status" aria-live="polite" className="spinner">
      <span className="spinner-ring" aria-hidden="true" />
      {label}
    </span>
  );
}

export function Skeleton({
  count = 3,
  label = "Loading notebooks",
}: {
  count?: number;
  label?: string;
}) {
  return (
    <div className="notes-grid" role="status" aria-live="polite">
      <span className="svg-hidden">{label}</span>
      {Array.from({ length: count }, (_, index) => (
        <div className="skeleton block" key={index} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Alert
// ---------------------------------------------------------------------------
export function Alert({
  tone = "error",
  children,
}: {
  tone?: "error" | "info";
  children: ReactNode;
}) {
  return (
    <div role="alert" className={`alert alert-${tone}`}>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// EmptyState / ErrorState
// ---------------------------------------------------------------------------
export function EmptyState({
  title,
  children,
  doodle,
  action,
  headingLevel = "p",
}: {
  title: string;
  children?: ReactNode;
  doodle?: ReactNode;
  action?: ReactNode;
  /** "h1" when this state is the whole page (404, missing notebook). */
  headingLevel?: "h1" | "h2" | "p";
}) {
  const Title = headingLevel;

  return (
    <div className="empty-state">
      <div className="empty-doodle">{doodle ?? <SadFace />}</div>
      <Title className={`title${headingLevel === "h1" ? " is-page" : ""}`}>
        {title}
      </Title>
      {children ? <p className="muted empty-copy">{children}</p> : null}
      {action ? <div className="empty-action">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  title,
  message,
  children,
  headingLevel = "p",
}: {
  title: string;
  message: string | null;
  children?: ReactNode;
  /** "h1" when this state is the whole page. */
  headingLevel?: "h1" | "h2" | "p";
}) {
  const Title = headingLevel;

  return (
    <div className="error-state" role="alert">
      <div className="empty-doodle">
        <CloudOff />
      </div>
      <Title className={`title${headingLevel === "h1" ? " is-page" : ""}`}>
        {title}
      </Title>
      {message ? <p className="muted">{message}</p> : null}
      {children ? (
        <p className="muted">
          Try again in a moment. If it keeps failing, reload the page.
        </p>
      ) : null}
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modal (native <dialog>, ink frame, no blur)
// ---------------------------------------------------------------------------
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="close"
          aria-label="Close"
          onClick={onClose}
        >
          ×
        </button>
        <h2 className="modal-title">{title}</h2>
        {children}
        {footer ? <div className="row modal-footer">{footer}</div> : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toast stack
// ---------------------------------------------------------------------------
export function ToastStack({
  toasts,
  onDismiss,
}: {
  toasts: { id: number; message: string; tone: "info" | "error" | "success" }[];
  onDismiss: (id: number) => void;
}) {
  return (
    <div className="toast-stack" aria-live="polite" aria-atomic="false">
      {toasts.map((toast) => (
        <div key={toast.id} data-tone={toast.tone} className="toast" role="status">
          <span>{toast.message}</span>
          <button
            type="button"
            className="toast-close"
            aria-label="Dismiss notification"
            onClick={() => onDismiss(toast.id)}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Google sign-in — same frame as the other buttons, centered label
// ---------------------------------------------------------------------------
export function GoogleButton({
  onToken,
  onError,
}: {
  onToken: (idToken: string) => void;
  onError: (message: string) => void;
}) {
  const clientId = useGoogleClientId();
  const configured = Boolean(import.meta.env.VITE_GOOGLE_CLIENT_ID || clientId);

  if (!configured) {
    return (
      <p className="field-hint">
        Google sign-in is not set up on this install — use your email and
        password below.
      </p>
    );
  }

  return (
    <div className="google-area">
      <GoogleLogin
        shape="rectangular"
        size="large"
        text="continue_with"
        onSuccess={(response) => {
          if (response.credential) {
            onToken(response.credential);
          } else {
            onError("Google did not return a sign-in token. Try again.");
          }
        }}
        onError={() => onError("Google sign-in failed or was cancelled. Try again.")}
      />
    </div>
  );
}
