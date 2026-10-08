/**
 * The API's documented default port. Kept in sync with `README.md`,
 * `server/.env.example` and `web/.env` (VITE_API_URL).
 */
export const DEFAULT_API_PORT = 5055;

export interface PortResolution {
  port: number;
  reason?: string;
}

/**
 * Resolve the API port from the environment.
 *
 * `dotenv` never overrides variables that already exist in `process.env`, so a
 * `PORT` exported by a parent process (shell profile, IDE run configuration,
 * container host, ...) silently wins over `server/.env`. A parent `PORT=0`
 * means "any free port" to some hosts and would make the API bind an ephemeral
 * port that nothing can reach — so instead of trusting the raw value we only
 * accept a usable explicit port and otherwise fall back to the documented one.
 *
 * Explicit invalid values are reported through `reason` so callers can log a
 * warning instead of failing boot.
 */
export function resolvePort(raw: string | undefined | null): PortResolution {
  if (raw === undefined || raw === null || raw.trim() === "") {
    return { port: DEFAULT_API_PORT };
  }

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    return {
      port: DEFAULT_API_PORT,
      reason:
        `Ignoring PORT=${JSON.stringify(raw)} (expected an integer between 1 and 65535); ` +
        `using ${DEFAULT_API_PORT} instead.`,
    };
  }

  return { port: parsed };
}
