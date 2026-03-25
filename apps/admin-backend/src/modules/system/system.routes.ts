import { Router } from "express";
import { asyncHandler } from "../../common/http/async-handler";
import { validateBody } from "../../common/middleware/validation";
import { allowRoles, requireAuth } from "../auth/auth.middleware";
import { getSystemMailStatus, postRunAccountNotifyCycle, postSystemMailTest } from "./system.controller";
import { adminSendTestEmailSchema } from "./system.schemas";

export const systemAdminRouter = Router();

systemAdminRouter.use(requireAuth, allowRoles(["OWNER", "ADMIN"]));

systemAdminRouter.get("/mail/status", asyncHandler(getSystemMailStatus));
systemAdminRouter.post("/mail/test", validateBody(adminSendTestEmailSchema), asyncHandler(postSystemMailTest));
systemAdminRouter.post("/account-notify/run", asyncHandler(postRunAccountNotifyCycle));

