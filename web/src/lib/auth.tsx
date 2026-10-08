import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api, setSessionExpiredHandler, tokens } from "./api";
import type { AuthResponse, User } from "./types";

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  signIn: (input: { email: string; password: string }) => Promise<void>;
  signInWithGoogle: (idToken: string) => Promise<void>;
  signUp: (input: { name: string; email: string; password: string }) => Promise<void>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const applySession = useCallback((session: AuthResponse) => {
    tokens.set(session.accessToken, session.refreshToken);
    setUser(session.user);
  }, []);

  const refreshUser = useCallback(async () => {
    if (!tokens.access() && !tokens.refresh()) {
      setUser(null);
      return;
    }

    const { user: current } = await api.me();
    setUser(current);
  }, []);

  // Restore the session on boot if a token pair is stored.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!tokens.access() && !tokens.refresh()) {
        setLoading(false);
        return;
      }

      try {
        const { user: current } = await api.me();
        if (!cancelled) setUser(current);
      } catch {
        if (!cancelled) {
          tokens.clear();
          setUser(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setSessionExpiredHandler(() => setUser(null));
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      async signIn(input) {
        applySession(await api.login(input));
      },
      async signInWithGoogle(idToken) {
        applySession(await api.loginWithGoogle(idToken));
      },
      async signUp(input) {
        applySession(await api.register(input));
      },
      async signOut() {
        await api.logout();
        setUser(null);
      },
      refreshUser,
    }),
    [user, loading, applySession, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside <AuthProvider>");
  }

  return context;
}
