import { Router } from "express";
import { authLoginRateLimit, authSessionRateLimit } from "../../common/security/rate-limit";
import { validateBody } from "../../common/middleware/validation";
import { loginSchema, registerAdminSchema } from "./auth.schemas";
import { login, logout, me, refresh, registerAdmin } from "./auth.controller";
import { requireAuth } from "./auth.middleware";

export const authRouter = Router();

authRouter.post("/login", authLoginRateLimit, validateBody(loginSchema), login);
authRouter.post("/register-admin", authLoginRateLimit, validateBody(registerAdminSchema), registerAdmin);
authRouter.post("/refresh", authSessionRateLimit, refresh);
authRouter.post("/logout", authSessionRateLimit, logout);
authRouter.get("/me", requireAuth, me);
