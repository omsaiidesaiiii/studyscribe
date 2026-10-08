import { Link, NavLink } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import type { ReactNode } from "react";
import { Button, Sticker } from "./ui/kit";
import { MobileNav } from "./MobileNav";
import { AppFooter } from "./FooterCredits";

/**
 * Single source of truth for the application name.
 *
 * The target design (and every page title, tab title, sticker and footer)
 * uses ONE name. StudyScribe per the reference mockup.
 */
export const APP_NAME = "StudyScribe";

/**
 * AppShell: the shared sticky header inside a bordered frame, followed by the
 * signed-in app's `container`.
 *
 * - Sticky header, always in view.
 * - Nav pills highlight the active route.
 * - Credits appear exactly once as a lime sticker in the frame (not duplicated).
 * - User name truncates with ellipsis at a max width.
 *
 * Signed-in public pages (landing, login, register, 404) are full-screen and
 * do NOT render this shell.
 */
export function Layout({
  children,
}: {
  children: ReactNode;
}) {
  const { user, signOut } = useAuth();

  return (
    <div className="shell">
      {/* Sticky header inside a bordered frame. */}
      <header className="toolbar">
        <div className="toolbar-row">
          <Link to="/" className="brand no-underline">
            <span className="sticker sticker-yellow">{APP_NAME}</span>
          </Link>

          <nav className="nav">
            <NavLink
              to="/app/dashboard"
              end
              className={({ isActive }) =>
                `chip ${isActive ? "chip-active" : ""}`
              }
            >
              New notes
            </NavLink>
            <NavLink
              to="/app/history"
              className={({ isActive }) =>
                `chip ${isActive ? "chip-active" : ""}`
              }
            >
              History
            </NavLink>
            <NavLink
              to="/app/payments"
              className={({ isActive }) =>
                `chip ${isActive ? "chip-active" : ""}`
              }
            >
              Credits
            </NavLink>
          </nav>

          <div className="toolbar-spacer" />

          {user ? (
            <div className="toolbar-user">
              <span className="user-tag">{user.name}</span>

              {/* ONE lime sticker — the credit balance. Kept out of the body. */}
              <span className="credit-cell">
                <Sticker rotated className="sticker-lime">
                  {user.credits ?? 0} credits
                </Sticker>
              </span>

              <Button variant="ink" size="sm" onClick={() => void signOut()}>
                Sign out
              </Button>
            </div>
          ) : (
            <div className="toolbar-auth">
              <Link to="/login" className="btn btn-primary">
                Sign in
              </Link>
              <Link to="/register" className="btn btn-white">
                Get started
              </Link>
            </div>
          )}

          {/* Phones: the same links, the account name and Sign out, one tap
              away behind the hamburger (CSS swaps it in below 820px). */}
          <MobileNav label="Open navigation">
            <NavLink
              to="/app/dashboard"
              end
              className={({ isActive }) =>
                `chip ${isActive ? "chip-active" : ""}`
              }
            >
              New notes
            </NavLink>
            <NavLink
              to="/app/history"
              className={({ isActive }) =>
                `chip ${isActive ? "chip-active" : ""}`
              }
            >
              History
            </NavLink>
            <NavLink
              to="/app/payments"
              className={({ isActive }) =>
                `chip ${isActive ? "chip-active" : ""}`
              }
            >
              Credits
            </NavLink>

            {user ? (
              <>
                <span className="nav-menu-user">{user.name}</span>
                <Button variant="ink" size="sm" onClick={() => void signOut()}>
                  Sign out
                </Button>
              </>
            ) : (
              <>
                <Link to="/login" className="btn btn-primary">
                  Sign in
                </Link>
                <Link to="/register" className="btn btn-white">
                  Get started
                </Link>
              </>
            )}
          </MobileNav>
        </div>
      </header>

      {/* Bordered frame around the signed-in content. */}
      <main className="shell-frame">
        <div className="container">{children}</div>
      </main>

      <AppFooter />
    </div>
  );
}

