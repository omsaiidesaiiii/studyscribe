import { Router } from "express";
import { validate } from "../middlewares/validate.js";
import { requireAuth, type AuthedRequest } from "../middlewares/requireAuth.js";
import {
  registerSchema,
  loginSchema,
  refreshSchema,
  googleAuthSchema,
} from "../schemas/auth.schema.js";
import * as authService from "../services/auth.service.js";

const router = Router();

// Public: lets the web app configure Google Sign-In without hardcoding the
// client id in a second place that could drift from the server's .env.
router.get("/config", (_req, res) => {
  res.status(200).json({
    success: true,
    googleClientId: process.env.GOOGLE_CLIENT_ID ?? null,
  });
});

router.post("/register", validate(registerSchema), async (req, res, next) => {
  try {
    const result = await authService.register(req.body);
    res.status(201).json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
});

router.post("/login", validate(loginSchema), async (req, res, next) => {
  try {
    const result = await authService.login(req.body);
    res.status(200).json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
});

router.post("/refresh", validate(refreshSchema), async (req, res, next) => {
  try {
    const result = await authService.refresh(req.body);
    res.status(200).json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
});

router.post("/logout", validate(refreshSchema), async (req, res, next) => {
  try {
    await authService.logout(req.body);
    res.status(200).json({ success: true, message: "Logged out successfully" });
  } catch (error) {
    next(error);
  }
});

router.post("/google", validate(googleAuthSchema), async (req, res, next) => {
  try {
    const result = await authService.loginWithGoogle(req.body);
    res.status(200).json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
});

router.get("/me", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const user = await authService.getCurrentUser(req.userId!);
    res.status(200).json({ success: true, user });
  } catch (error) {
    next(error);
  }
});

export default router;
