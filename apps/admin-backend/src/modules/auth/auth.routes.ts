import { Router } from "express";
import { authRateLimit } from "../../common/security/rate-limit";
import { validateBody } from "../../common/middleware/validation";
import { loginSchema, registerAdminSchema } from "./auth.schemas";
import { login, logout, me, refresh, registerAdmin } from "./auth.controller";
import { requireAuth } from "./auth.middleware";

export const authRouter = Router();

authRouter.post("/login", authRateLimit, validateBody(loginSchema), login);
authRouter.post("/register-admin", authRateLimit, validateBody(registerAdminSchema), registerAdmin);
authRouter.post("/refresh", authRateLimit, refresh);
authRouter.post("/logout", authRateLimit, logout);
authRouter.get("/me", requireAuth, me);
