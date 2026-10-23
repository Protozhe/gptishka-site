import { Router } from "express";
import { authLoginRateLimit, authSessionRateLimit } from "../../common/security/rate-limit";
import { validateBody } from "../../common/middleware/validation";
import { loginSchema, registerAdminSchema, telegramCodeSchema } from "./auth.schemas";
import { login, logout, me, refresh, registerAdmin, listSessions, revokeSession, revokeOtherSessions, verifyTelegram, panelCheck } from "./auth.controller";
import { requireAuth } from "./auth.middleware";

export const authRouter = Router();

authRouter.post("/login", authLoginRateLimit, validateBody(loginSchema), login);
authRouter.post("/verify-telegram", authLoginRateLimit, validateBody(telegramCodeSchema), verifyTelegram);
authRouter.get("/panel-check", panelCheck);
authRouter.post("/register-admin", authLoginRateLimit, validateBody(registerAdminSchema), registerAdmin);
authRouter.post("/refresh", authSessionRateLimit, refresh);
authRouter.post("/logout", authSessionRateLimit, logout);
authRouter.get("/me", requireAuth, me);
authRouter.get("/sessions", requireAuth, listSessions);
authRouter.post("/sessions/revoke-others", authSessionRateLimit, requireAuth, revokeOtherSessions);
authRouter.delete("/sessions/:id", authSessionRateLimit, requireAuth, revokeSession);
