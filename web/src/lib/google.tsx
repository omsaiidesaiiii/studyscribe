import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { api } from "./api";

const GoogleConfigContext = createContext<string | null>(null);

/**
 * Resolves the Google OAuth client id from the API (GET /auth/config, which
 * reads GOOGLE_CLIENT_ID on the server) so it is configured in exactly one
 * place. Falls back to VITE_GOOGLE_CLIENT_ID when set.
 */
export function GoogleConfigProvider({ children }: { children: ReactNode }) {
  const [clientId, setClientId] = useState<string | null>(
    import.meta.env.VITE_GOOGLE_CLIENT_ID || null,
  );

  useEffect(() => {
    let cancelled = false;

    api
      .googleConfig()
      .then((config) => {
        if (!cancelled && config.googleClientId) {
          setClientId(config.googleClientId);
        }
      })
      .catch(() => {
        // Google sign-in simply stays hidden; email/password still works.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (!clientId) {
    return (
      <GoogleConfigContext.Provider value={null}>
        {children}
      </GoogleConfigContext.Provider>
    );
  }

  return (
    <GoogleConfigContext.Provider value={clientId}>
      <GoogleOAuthProvider clientId={clientId}>{children}</GoogleOAuthProvider>
    </GoogleConfigContext.Provider>
  );
}

export function useGoogleClientId(): string | null {
  return useContext(GoogleConfigContext);
}
