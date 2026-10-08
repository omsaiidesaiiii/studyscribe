import type {
  AuthResponse,
  Generation,
  HistoryResponse,
  User,
} from "./types";

export const API_URL = (
  import.meta.env.VITE_API_URL ?? "http://localhost:5055"
).replace(/\/$/, "");
const ACCESS_KEY = "studyscribe.accessToken";
const REFRESH_KEY = "studyscribe.refreshToken";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

export const tokens = {
  access: () => localStorage.getItem(ACCESS_KEY),
  refresh: () => localStorage.getItem(REFRESH_KEY),
  set(accessToken: string, refreshToken: string) {
    localStorage.setItem(ACCESS_KEY, accessToken);
    localStorage.setItem(REFRESH_KEY, refreshToken);
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

let onSessionExpired: (() => void) | null = null;
export function setSessionExpiredHandler(handler: () => void) {
  onSessionExpired = handler;
}

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: string };
    if (body?.message) return body.message;
  } catch {
    // non-JSON error body — fall through
  }
  return `Request failed with status ${response.status}`;
}

// Only one refresh call may be in flight; concurrent 401s await the same one.
let refreshInFlight: Promise<boolean> | null = null;

async function refreshTokens(): Promise<boolean> {
  const refreshToken = tokens.refresh();
  if (!refreshToken) return false;

  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const response = await fetch(`${API_URL}/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken }),
        });

        if (!response.ok) return false;

        const data = (await response.json()) as {
          accessToken: string;
          refreshToken: string;
        };

        tokens.set(data.accessToken, data.refreshToken);
        return true;
      } catch {
        return false;
      } finally {
        setTimeout(() => {
          refreshInFlight = null;
        }, 0);
      }
    })();
  }

  return refreshInFlight;
}

export type RequestOptions = {
  method?: "GET" | "POST";
  body?: unknown;
  auth?: boolean;
  retried?: boolean;
};

export async function request<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { method = "GET", body, auth = true, retried = false } = options;

  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (auth) {
    const accessToken = tokens.access();
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  }

  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (response.status === 401 && auth && !retried) {
    const refreshed = await refreshTokens();

    if (refreshed) {
      return request<T>(path, { ...options, retried: true });
    }

    tokens.clear();
    onSessionExpired?.();
    throw new ApiError(401, "Your session expired — please sign in again.");
  }

  if (!response.ok) {
    throw new ApiError(response.status, await readError(response));
  }

  if (response.status === 204) return undefined as T;

  return (await response.json()) as T;
}

export const api = {
  googleConfig: () =>
    request<{ googleClientId: string | null }>("/auth/config", { auth: false }),

  models: () =>
    request<{ models: import("./types").ModelOption[] }>("/generate/models", {
      auth: false,
    }),

  register: (input: { name: string; email: string; password: string }) =>
    request<AuthResponse>("/auth/register", { method: "POST", body: input, auth: false }),

  login: (input: { email: string; password: string }) =>
    request<AuthResponse>("/auth/login", { method: "POST", body: input, auth: false }),

  loginWithGoogle: (idToken: string) =>
    request<AuthResponse>("/auth/google", {
      method: "POST",
      body: { idToken },
      auth: false,
    }),

  me: () => request<{ user: User }>("/auth/me"),

  logout: () => {
    const refreshToken = tokens.refresh();
    tokens.clear();
    if (!refreshToken) return Promise.resolve();
    return request<void>("/auth/logout", {
      method: "POST",
      body: { refreshToken },
      auth: false,
    }).catch(() => undefined);
  },

  generate: (input: { url: string; language: string; model?: string }) =>
    request<{ generationId: string }>("/generate", { method: "POST", body: input }),

  generation: (id: string) =>
    request<{ generation: Generation }>(`/generate/${id}`),

  history: (page = 1, limit = 10) =>
    request<HistoryResponse>(`/generate/history?page=${page}&limit=${limit}`),

  async downloadPdf(id: string, fallbackName: string): Promise<void> {
    const accessToken = tokens.access();

    const response = await fetch(`${API_URL}/generate/${id}/download`, {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    });

    if (!response.ok) {
      throw new ApiError(response.status, await readError(response));
    }

    const disposition = response.headers.get("Content-Disposition") ?? "";
    const match = /filename="([^"]+)"/.exec(disposition);
    const filename = match?.[1] ?? `${fallbackName}.pdf`;

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  },
};

export const apiWithRequest = {
  /** Low-level request helper, exported so pages can reach endpoints the `api` object doesn't cover. */
  request: (path: string, options?: import("./api").RequestOptions) => {
    return (apiWithRequest as any).request(path, options);
  },
};
