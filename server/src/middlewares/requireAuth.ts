import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { AppError } from "../errors/AppError.js";

const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET!;

export interface AuthedRequest extends Request {
  userId?: string;
}

export function requireAuth(req: AuthedRequest, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    throw new AppError(401, "Missing access token");
  }

  const token = header.slice("Bearer ".length);

  try {
    const payload = jwt.verify(token, ACCESS_TOKEN_SECRET) as { userId: string };
    req.userId = payload.userId;
    next();
  } catch {
    throw new AppError(401, "Invalid or expired access token");
  }
}