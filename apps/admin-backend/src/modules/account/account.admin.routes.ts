import { Router } from "express";
import { validateBody, validateQuery } from "../../common/middleware/validation";
import { allowRoles, requireAuth } from "../auth/auth.middleware";
import {
  adminAccountLinkOrder,
  adminAccountLinkVpnAccess,
  adminAccountLookup,
  adminAccountSendMagicLink,
  adminAccountSendTelegramTestMessage,
} from "./account.controller";
import {
  adminLinkOrderSchema,
  adminTelegramTestMessageSchema,
  adminLinkVpnAccessSchema,
  adminLookupQuerySchema,
  adminSendMagicLinkSchema,
} from "./account.schemas";

export const accountAdminRouter = Router();

accountAdminRouter.use(requireAuth, allowRoles(["OWNER", "ADMIN", "SUPPORT"]));

accountAdminRouter.get("/lookup", validateQuery(adminLookupQuerySchema), adminAccountLookup);
accountAdminRouter.post("/resend-magic-link", validateBody(adminSendMagicLinkSchema), adminAccountSendMagicLink);
accountAdminRouter.post("/link-order", validateBody(adminLinkOrderSchema), adminAccountLinkOrder);
accountAdminRouter.post("/link-vpn-access", validateBody(adminLinkVpnAccessSchema), adminAccountLinkVpnAccess);
accountAdminRouter.post("/telegram/test-message", validateBody(adminTelegramTestMessageSchema), adminAccountSendTelegramTestMessage);
