import crypto from "node:crypto";
import jwt from "jsonwebtoken";

/**
 * Refresh-token TTL in days. Exported so callers/tests can reason about expiry
 * without duplicating the constant.
 */
export const REFRESH_TOKEN_TTL_DAYS = 7;

export interface RefreshTokenPayload {
  userId: string;
  /** Unique token id — see signRefreshToken(). */
  jti: string;
}

/**
 * Sign a refresh token for a user.
 *
 * Every token carries a random `jti`. Without it a JWT payload is just
 * `{ userId, iat, exp }`, so two tokens issued for the same user inside the
 * same second are byte-for-byte identical. `refresh_tokens.token_hash` is
 * UNIQUE, so the second insert would blow up with a 23505 and the user would
 * get a 500 from `/auth/login`, `/auth/register` or `/auth/refresh` — for
 * example whenever a client logs in right after registering.
 */
export function signRefreshToken(userId: string): string {
  const secret = process.env.REFRESH_TOKEN_SECRET;
  if (!secret) {
    throw new Error("REFRESH_TOKEN_SECRET is not set");
  }

  return jwt.sign({ userId, jti: crypto.randomUUID() } satisfies RefreshTokenPayload, secret, {
    expiresIn: `${REFRESH_TOKEN_TTL_DAYS}d`,
  });
}

/** Stable hash stored in the database; the raw token is never persisted. */
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}
