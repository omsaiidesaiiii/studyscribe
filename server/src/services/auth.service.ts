import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";
import { AppError } from "../errors/AppError.js";
import {
  findUserByEmail,
  createUser,
  findUserById,
  findUserByGoogleId,
  linkGoogleId,
} from "../repositories/user.repository.js";
import {
  insertRefreshToken,
  findRefreshTokenByHash,
  revokeRefreshTokenById,
  revokeRefreshTokenByHash,
} from "../repositories/refreshToken.repository.js";
import type {
  RegisterInput,
  LoginInput,
  RefreshInput,
  GoogleAuthInput,
} from "../schemas/auth.schema.js";
import type { PublicUser } from "../types/user.types.js";
import {
  REFRESH_TOKEN_TTL_DAYS,
  hashToken,
  signRefreshToken,
} from "../lib/refresh-token.js";

const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET!;
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET!;

async function issueTokenPair(userId: string) {
  const accessToken = jwt.sign({ userId }, ACCESS_TOKEN_SECRET, {
    expiresIn: "15m",
  });

  // Carries a unique jti: token_hash is UNIQUE in the database, and without a
  // unique payload two tokens minted in the same second would collide.
  const refreshToken = signRefreshToken(userId);

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_TTL_DAYS);

  await insertRefreshToken({
    userId,
    tokenHash: hashToken(refreshToken),
    expiresAt,
  });

  return { accessToken, refreshToken };
}

export async function register(input: RegisterInput): Promise<{
  user: PublicUser;
  accessToken: string;
  refreshToken: string;
}> {
  const existing = await findUserByEmail(input.email);
  if (existing) {
    throw new AppError(409, "Email is already registered");
  }

  const passwordHash = await bcrypt.hash(input.password, 12);

  const userRow = await createUser({
    email: input.email,
    passwordHash,
    name: input.name,
  });

  const { accessToken, refreshToken } = await issueTokenPair(userRow.id);

  return {
    user: {
      id: userRow.id,
      email: userRow.email,
      name: userRow.name,
      credits: userRow.credits,
    },
    accessToken,
    refreshToken,
  };
}

export async function login(input: LoginInput): Promise<{
  user: PublicUser;
  accessToken: string;
  refreshToken: string;
}> {
  const userRow = await findUserByEmail(input.email);

  if (!userRow || !userRow.password_hash) {
    throw new AppError(401, "Invalid email or password");
  }

  const passwordMatches = await bcrypt.compare(input.password, userRow.password_hash);

  if (!passwordMatches) {
    throw new AppError(401, "Invalid email or password");
  }

  const { accessToken, refreshToken } = await issueTokenPair(userRow.id);

  return {
    user: {
      id: userRow.id,
      email: userRow.email,
      name: userRow.name,
      credits: userRow.credits,
    },
    accessToken,
    refreshToken,
  };
}

export async function refresh(input: RefreshInput): Promise<{
  accessToken: string;
  refreshToken: string;
}> {
  let payload: { userId: string; jti?: string };
  try {
    payload = jwt.verify(input.refreshToken, REFRESH_TOKEN_SECRET) as {
      userId: string;
      jti?: string;
    };
  } catch {
    throw new AppError(401, "Invalid or expired refresh token");
  }

  const tokenHash = hashToken(input.refreshToken);
  const tokenRow = await findRefreshTokenByHash(tokenHash);

  if (!tokenRow || tokenRow.revoked_at || new Date(tokenRow.expires_at) < new Date()) {
    throw new AppError(401, "Refresh token has been revoked or expired");
  }

  await revokeRefreshTokenById(tokenRow.id);

  return issueTokenPair(payload.userId);
}

export async function logout(input: RefreshInput): Promise<void> {
  const tokenHash = hashToken(input.refreshToken);
  await revokeRefreshTokenByHash(tokenHash);
}

export async function getCurrentUser(userId: string): Promise<PublicUser> {
  const userRow = await findUserById(userId);

  if (!userRow) {
    throw new AppError(404, "User not found");
  }

  return {
    id: userRow.id,
    email: userRow.email,
    name: userRow.name,
    credits: userRow.credits,
  };
}

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

export async function loginWithGoogle(input: GoogleAuthInput): Promise<{
  user: PublicUser;
  accessToken: string;
  refreshToken: string;
}> {
  let ticket;
  try {
    ticket = await googleClient.verifyIdToken({
      idToken: input.idToken,
      audience: GOOGLE_CLIENT_ID,
    });
  } catch {
    throw new AppError(401, "Invalid Google token");
  }

  const payload = ticket.getPayload();

  if (!payload || !payload.sub || !payload.email) {
    throw new AppError(401, "Invalid Google token");
  }

  const googleId = payload.sub;
  const email = payload.email.toLowerCase();
  const name = payload.name ?? email;

  let userRow = await findUserByGoogleId(googleId);

  if (!userRow) {
    const existingByEmail = await findUserByEmail(email);

    if (existingByEmail) {
      // Account linking: same email already registered with a password.
      // Attach this Google ID to that existing account instead of
      // creating a duplicate.
      await linkGoogleId(existingByEmail.id, googleId);
      userRow = { ...existingByEmail, google_id: googleId };
    } else {
      userRow = await createUser({
        email,
        passwordHash: null,
        name,
        googleId,
      });
    }
  }

  const { accessToken, refreshToken } = await issueTokenPair(userRow.id);

  return {
    user: {
      id: userRow.id,
      email: userRow.email,
      name: userRow.name,
      credits: userRow.credits,
    },
    accessToken,
    refreshToken,
  };
}