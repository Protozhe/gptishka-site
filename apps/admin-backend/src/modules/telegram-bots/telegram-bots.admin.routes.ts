import { Router } from "express";
import { allowRoles, requireAuth } from "../auth/auth.middleware";
import { validateQuery } from "../../common/middleware/validation";
import { getTelegramBotUserTimeline, getTelegramBotsOverview, listTelegramBotEvents, listTelegramBotUsers } from "./telegram-bots.controller";
import { telegramBotEventsQuerySchema, telegramBotOverviewQuerySchema, telegramBotUserTimelineQuerySchema, telegramBotUsersQuerySchema } from "./telegram-bots.schemas";

export const telegramBotsAdminRouter = Router();

telegramBotsAdminRouter.use(requireAuth);
telegramBotsAdminRouter.get(
  "/overview",
  allowRoles(["OWNER", "ADMIN", "MANAGER", "SUPPORT"]),
  validateQuery(telegramBotOverviewQuerySchema),
  getTelegramBotsOverview
);
telegramBotsAdminRouter.get(
  "/events",
  allowRoles(["OWNER", "ADMIN", "MANAGER", "SUPPORT"]),
  validateQuery(telegramBotEventsQuerySchema),
  listTelegramBotEvents
);
telegramBotsAdminRouter.get(
  "/users",
  allowRoles(["OWNER", "ADMIN", "MANAGER", "SUPPORT"]),
  validateQuery(telegramBotUsersQuerySchema),
  listTelegramBotUsers
);
telegramBotsAdminRouter.get(
  "/user-timeline",
  allowRoles(["OWNER", "ADMIN", "MANAGER", "SUPPORT"]),
  validateQuery(telegramBotUserTimelineQuerySchema),
  getTelegramBotUserTimeline
);
