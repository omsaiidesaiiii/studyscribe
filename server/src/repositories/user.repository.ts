import { pool } from "../lib/db.js";
import type { UserRow } from "../types/user.types.js";

export async function findUserByEmail(email: string): Promise<UserRow | null> {
  const result = await pool.query<UserRow>(
    "SELECT * FROM users WHERE email = $1",
    [email]
  );
  return result.rows[0] ?? null;
}

export async function createUser(data: {
  email: string;
  passwordHash: string | null;
  name: string;
  googleId?: string | null;
}): Promise<UserRow> {
  const result = await pool.query<UserRow>(
    `INSERT INTO users (email, password_hash, name, google_id)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [data.email, data.passwordHash, data.name, data.googleId ?? null]
  );
  return result.rows[0];
}

export async function findUserById(id: string): Promise<UserRow | null> {
  const result = await pool.query<UserRow>(
    "SELECT * FROM users WHERE id = $1",
    [id]
  );
  return result.rows[0] ?? null;
}

export async function findUserByGoogleId(googleId: string): Promise<UserRow | null> {
  const result = await pool.query<UserRow>(
    "SELECT * FROM users WHERE google_id = $1",
    [googleId]
  );
  return result.rows[0] ?? null;
}

export async function linkGoogleId(userId: string, googleId: string): Promise<void> {
  await pool.query("UPDATE users SET google_id = $1 WHERE id = $2", [
    googleId,
    userId,
  ]);
}

export async function decrementUserCredits(userId: string): Promise<void> {
  await pool.query(
    "UPDATE users SET credits = credits - 1 WHERE id = $1 AND credits > 0",
    [userId]
  );
}
export async function addCredits(userId: string, count: number): Promise<void> {
  if (count < 1) {
    throw new RangeError("addCredits count must be >= 1");
  }

  await pool.query(
    "UPDATE users SET credits = credits + $1 WHERE id = $2",
    [count, userId],
  );
}
