import { Router } from "express";
import { validateBody, validateQuery } from "../../common/middleware/validation";
import {
  accountMagicLinkRateLimit,
  accountRevealRateLimit,
  accountSessionRateLimit,
  accountTelegramLinkRateLimit,
} from "../../common/security/rate-limit";
import {
  accountGetNotificationPreferences,
  accountLogout,
  accountLogoutAll,
  accountMe,
  accountTelegramAuthStatus,
  accountRequestTelegramLink,
  accountRevealVpnKey,
  accountTelegramStatus,
  accountTelegramUnlink,
  accountUpdateNotificationPreferences,
  consumeAccountTelegramAuth,
  consumeAccountMagicLink,
  consumeAccountMagicLinkRedirect,
  requestAccountTelegramAuth,
  requestAccountMagicLink,
} from "./account.controller";
import { requireCustomerSession } from "./account.middleware";
import {
  consumeMagicLinkSchema,
  consumeTelegramAuthSchema,
  requestMagicLinkSchema,
  telegramAuthStatusQuerySchema,
  updateNotificationPreferencesSchema,
} from "./account.schemas";

export const accountRouter = Router();

accountRouter.post("/auth/request-link", accountMagicLinkRateLimit, validateBody(requestMagicLinkSchema), requestAccountMagicLink);
accountRouter.post("/auth/telegram/request", accountMagicLinkRateLimit, requestAccountTelegramAuth);
accountRouter.get("/auth/telegram/status", accountSessionRateLimit, validateQuery(telegramAuthStatusQuerySchema), accountTelegramAuthStatus);
accountRouter.post("/auth/telegram/consume", accountSessionRateLimit, validateBody(consumeTelegramAuthSchema), consumeAccountTelegramAuth);
accountRouter.post("/auth/consume", accountMagicLinkRateLimit, validateBody(consumeMagicLinkSchema), consumeAccountMagicLink);
accountRouter.get("/auth/magic", accountMagicLinkRateLimit, consumeAccountMagicLinkRedirect);
accountRouter.post("/auth/logout", accountSessionRateLimit, accountLogout);
accountRouter.post("/auth/logout-all", accountSessionRateLimit, requireCustomerSession, accountLogoutAll);

accountRouter.get("/me", accountSessionRateLimit, requireCustomerSession, accountMe);
accountRouter.get("/vpn-accesses/:id/key", accountRevealRateLimit, requireCustomerSession, accountRevealVpnKey);
accountRouter.get("/notification-preferences", accountSessionRateLimit, requireCustomerSession, accountGetNotificationPreferences);
accountRouter.patch(
  "/notification-preferences",
  accountSessionRateLimit,
  requireCustomerSession,
  validateBody(updateNotificationPreferencesSchema),
  accountUpdateNotificationPreferences
);
accountRouter.post("/telegram/link/request", accountTelegramLinkRateLimit, requireCustomerSession, accountRequestTelegramLink);
accountRouter.get("/telegram/status", accountSessionRateLimit, requireCustomerSession, accountTelegramStatus);
accountRouter.post("/telegram/unlink", accountTelegramLinkRateLimit, requireCustomerSession, accountTelegramUnlink);
