import { useEffect, useId, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";

/**
 * Hamburger navigation for narrow screens.
 *
 * Both shells render their links twice: as inline pills for wide screens and
 * inside this panel for phones. CSS keeps exactly one of them in the layout
 * (`display: none` also removes the other from the accessibility tree), so a
 * screen reader never reads the same link set twice.
 *
 * The panel closes on Escape and on every navigation — including in-page hash
 * links, because `useLocation` reports hash changes too.
 */
export function MobileNav({
  children,
  label = "Open menu",
}: {
  children: ReactNode;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const { pathname, hash } = useLocation();
  const panelId = useId();

  useEffect(() => {
    setOpen(false);
  }, [pathname, hash]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <div className="nav-menu">
      <button
        type="button"
        className="nav-toggle"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={open ? "Close menu" : label}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="nav-bars" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
      </button>

      <div className="nav-menu-panel" id={panelId} hidden={!open}>
        {children}
      </div>
    </div>
  );
}
