import { useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Alert, Button, Field, GoogleButton, Sheet, TextInput } from "@/components/ui/kit";
import { PublicFooter, PublicNav } from "@/components/PublicShell";
import { CheckBox, GraphDoodle } from "@/components/ui/doodles";

/**
 * Sign in / sign up.
 *
 * Desktop: a colourful panel on the left (tilted notebook preview + three
 * benefits) and the form inside a notebook Sheet on the right, max 440px wide.
 * Mobile: the panel is hidden and the form comes first.
 */

const BENEFITS = [
  "5 free credits on sign-up — one credit per new video",
  "Notes in English, हिन्दी or Hinglish",
  "Read in the browser or download a print-ready A4 PDF",
];

/** Small tilted notebook preview used inside the colour panel. */
function PanelNotebook() {
  return (
    <div className="hero-note panel-note">
      <span className="margin" aria-hidden="true" />
      <span className="rule-lines" aria-hidden="true" />

      <div className="hero-note-inner">
        <h2>
          <span className="marker">Graphs: basics</span>
        </h2>
        <p>Graph = nodes + edges.</p>
        <p>Adjacency list: quick to walk.</p>
        <GraphDoodle className="hero-graph" />
      </div>
    </div>
  );
}

function AuthLayout({
  title,
  subtitle,
  panelTitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  panelTitle: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div id="top">
      <PublicNav links={false} />

      <main>
        <div className="container">
          <div className="auth-layout">
            {/* Left: colourful panel (hidden on small screens). */}
            <aside className="auth-panel">
              <h2>{panelTitle}</h2>

              <ul className="benefits">
                {BENEFITS.map((benefit) => (
                  <li key={benefit}>
                    <CheckBox />
                    <span>{benefit}</span>
                  </li>
                ))}
              </ul>

              <div className="panel-note-wrap">
                <PanelNotebook />
              </div>
            </aside>

            {/* Right: the form, inside a notebook sheet. */}
            <div className="auth-col">
              <Sheet className="auth-card">
                <h1>{title}</h1>
                <p className="card-subtitle">{subtitle}</p>

                {children}

                <div className="auth-foot">{footer}</div>
              </Sheet>
            </div>
          </div>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}

function AuthForm({ mode }: { mode: "login" | "register" }) {
  const navigate = useNavigate();
  const { signIn, signUp, signInWithGoogle } = useAuth();

  const isRegister = mode === "register";

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      if (isRegister) {
        await signUp({ name, email, password });
      } else {
        await signIn({ email, password });
      }

      // Routing behaviour is unchanged: public pages hand the signed-in user
      // to /app through the existing guard.
      navigate("/");
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : isRegister
            ? "Could not create the account. Check your details and try again."
            : "Could not sign in. Check your email and password and try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function withGoogle(idToken: string) {
    setError(null);

    try {
      await signInWithGoogle(idToken);
      navigate("/");
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "Google sign-in failed. Try again or use your email and password.",
      );
    }
  }

  return (
    <AuthLayout
      panelTitle="Notes you can revise from."
      title={isRegister ? "Create your account" : "Welcome back"}
      subtitle={
        isRegister
          ? "New accounts start with 5 free credits."
          : "Sign in to see your notebooks and credits."
      }
      footer={
        isRegister ? (
          <>
            Already have an account? <Link to="/login">Log in</Link>
          </>
        ) : (
          <>
            New here? <Link to="/register">Create an account</Link>
          </>
        )
      }
    >
      <form className="auth-form" onSubmit={submit} noValidate={false}>
        {isRegister ? (
          <Field label="Name" htmlFor="auth-name">
            <TextInput
              id="auth-name"
              name="name"
              required
              autoComplete="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
        ) : null}

        <Field label="Email" htmlFor="auth-email">
          <TextInput
            id="auth-email"
            name="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </Field>

        <Field
          label="Password"
          htmlFor="auth-password"
          hint={isRegister ? "At least 8 characters." : undefined}
        >
          <TextInput
            id="auth-password"
            name="password"
            type="password"
            required
            minLength={isRegister ? 8 : 1}
            autoComplete={isRegister ? "new-password" : "current-password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </Field>

        {error ? <Alert>{error}</Alert> : null}

        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? "Please wait…" : isRegister ? "Create account" : "Log in"}
        </Button>
      </form>

      <div className="divider">or</div>

      <GoogleButton
        onToken={(token) => void withGoogle(token)}
        onError={setError}
      />
    </AuthLayout>
  );
}

export function LoginPage() {
  return <AuthForm mode="login" />;
}

export function RegisterPage() {
  return <AuthForm mode="register" />;
}
