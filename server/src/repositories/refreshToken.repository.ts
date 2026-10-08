import { pool } from "../lib/db.js";
import type { RefreshTokenRow } from "../types/refreshToken.types.js";

export async function insertRefreshToken(data: {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}): Promise<void> {
  await pool.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [data.userId, data.tokenHash, data.expiresAt]
  );
}

export async function findRefreshTokenByHash(
  tokenHash: string
): Promise<RefreshTokenRow | null> {
  const result = await pool.query<RefreshTokenRow>(
    "SELECT * FROM refresh_tokens WHERE token_hash = $1",
    [tokenHash]
  );
  return result.rows[0] ?? null;
}

export async function revokeRefreshTokenById(id: string): Promise<void> {
  await pool.query(
    "UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1",
    [id]
  );
}

export async function revokeRefreshTokenByHash(tokenHash: string): Promise<void> {
  await pool.query(
    "UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1",
    [tokenHash]
  );
}