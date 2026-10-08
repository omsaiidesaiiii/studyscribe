import { Link } from "react-router-dom";
import { ButtonLink } from "./ui/kit";
import { MobileNav } from "./MobileNav";
import { APP_NAME } from "./Layout";
import { AppFooter } from "./FooterCredits";

const SECTION_LINKS = [
  { label: "Features", href: "#features" },
  { label: "How it works", href: "#how-it-works" },
  { label: "Pricing", href: "#pricing" },
];

/**
 * Public top bar — the same framed header as the signed-in shell, but with
 * section links and the two account actions. One app name everywhere.
 */
export function PublicNav({ links = true }: { links?: boolean }) {
  return (
    <header className="topbar">
      <div className="toolbar-row">
        <Link to="/" className="brand no-underline">
          <span className="sticker sticker-lime">{APP_NAME}</span>
        </Link>

        {links ? (
          <nav className="nav" aria-label="Sections">
            <Link to="/" className="chip chip-active" aria-current="page">
              Home
            </Link>
            <a href="#features" className="chip">
              Features
            </a>
            <a href="#how-it-works" className="chip">
              How it works
            </a>
            <a href="#pricing" className="chip">
              Pricing
            </a>
          </nav>
        ) : null}

        <span className="toolbar-spacer" />

        <div className="toolbar-auth">
          <ButtonLink href="/login" variant="white" className="btn-sm">
            Log in
          </ButtonLink>
          <ButtonLink href="/register" variant="violet" className="btn-sm">
            Get started
          </ButtonLink>
        </div>

        {/* Always present: on the auth pages the header actions are hidden
            below 820px, so the panel is the only way to switch between them. */}
        <MobileNav label="Open navigation">
          {links ? (
            <>
              <Link to="/" className="chip chip-active" aria-current="page">
                Home
              </Link>
              {SECTION_LINKS.map((link) => (
                <a href={link.href} className="chip" key={link.href}>
                  {link.label}
                </a>
              ))}
            </>
          ) : null}

          <ButtonLink href="/login" variant={links ? "white" : "primary"}>
            Log in
          </ButtonLink>
          <ButtonLink href="/register" variant="violet">
            Get started
          </ButtonLink>
        </MobileNav>
      </div>
    </header>
  );
}

/** Public footer matching the exact neo-brutalist footer layout */
export function PublicFooter() {
  return <AppFooter />;
}
