import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { ButtonLink, EmptyState, Spinner, ToastStack } from "@/components/ui/kit";
import { SadFace } from "@/components/ui/doodles";
import { useAuth } from "@/lib/auth";
import { useToasts } from "@/lib/hooks";
import { LoginPage, RegisterPage } from "@/pages/AuthPages";
import { LandingPage } from "@/pages/LandingPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { GenerationPage } from "@/pages/GenerationPage";
import { HistoryPage } from "@/pages/HistoryPage";
import { PaymentsPage } from "@/pages/PaymentsPage";
import { PublicFooter, PublicNav } from "@/components/PublicShell";
import type { ReactNode } from "react";

/**
 * Route guards.
 * - RequireAuth: only signed-in users reach the app.
 * - PublicOnly: only anonymous users reach public pages.
 */

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="container section center-text">
        <Spinner label="Restoring your session" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function PublicOnly({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="container section center-text">
        <Spinner label="Checking your session" />
      </div>
    );
  }

  // Landing is public; a signed-in user who visits it is sent to the app.
  return user ? <Navigate to="/app" replace /> : <>{children}</>;
}

/** Unknown address: same shell as the public pages, one clear way forward. */
function NotFoundPage() {
  return (
    <div id="top">
      <PublicNav links={false} />

      <main>
        <div className="container section">
          <EmptyState
            title="This page does not exist"
            headingLevel="h1"
            doodle={<SadFace />}
            action={
              <>
                <ButtonLink href="/" variant="primary">
                  Back to the home page
                </ButtonLink>
                <ButtonLink href="/app/dashboard" variant="white">
                  Go to my notebooks
                </ButtonLink>
              </>
            }
          >
            The address may have a typo. Check the link, or start from the home
            page.
          </EmptyState>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}

/**
 * Routes. The signed-in app lives under /app and always renders the AppShell;
 * everything else is a public page (landing, log in, register, 404).
 */
export function App() {
  const { toasts, push, dismiss } = useToasts();

  return (
    <>
      <Routes>
        {/* ---- Public pages (full-screen, no app shell) ---- */}
        <Route
          path="/login"
          element={
            <PublicOnly>
              <LoginPage />
            </PublicOnly>
          }
        />
        <Route
          path="/register"
          element={
            <PublicOnly>
              <RegisterPage />
            </PublicOnly>
          }
        />
        <Route
          path="/"
          element={
            <PublicOnly>
              <LandingPage />
            </PublicOnly>
          }
        />

        {/* ---- Signed-in app (same AppShell on every route) ---- */}
        <Route
          path="/app"
          element={
            <RequireAuth>
              <Layout>
                <Navigate to="/app/dashboard" replace />
              </Layout>
            </RequireAuth>
          }
        />
        <Route
          path="/app/dashboard"
          element={
            <RequireAuth>
              <Layout>
                <DashboardPage onToast={push} />
              </Layout>
            </RequireAuth>
          }
        />
        <Route
          path="/app/history"
          element={
            <RequireAuth>
              <Layout>
                <HistoryPage onToast={push} />
              </Layout>
            </RequireAuth>
          }
        />
        <Route
          path="/app/payments"
          element={
            <RequireAuth>
              <Layout>
                <PaymentsPage onToast={push} />
              </Layout>
            </RequireAuth>
          }
        />
        <Route
          path="/app/generation/:id"
          element={
            <RequireAuth>
              <Layout>
                <GenerationPage onToast={push} />
              </Layout>
            </RequireAuth>
          }
        />

        {/* ---- Catch-all ---- */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>

      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </>
  );
}
