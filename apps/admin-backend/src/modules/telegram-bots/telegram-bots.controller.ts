import { Request, Response } from "express";
import { asyncHandler } from "../../common/http/async-handler";
import { telegramBotEventsService } from "./telegram-bot-events.service";

export const getTelegramBotsOverview = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as any;
  const data = await telegramBotEventsService.getOverview({
    botType: query.botType,
    days: query.days,
  });
  res.json(data);
});

export const listTelegramBotEvents = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as any;
  const items = await telegramBotEventsService.listEvents({
    botType: query.botType,
    eventType: query.eventType,
    limit: query.limit,
  });
  res.json({ items });
});

export const listTelegramBotUsers = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as any;
  const data = await telegramBotEventsService.listUsers({
    botType: query.botType,
    days: query.days,
    limit: query.limit,
  });
  res.json(data);
});

export const getTelegramBotUserTimeline = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as any;
  const items = await telegramBotEventsService.userTimeline({
    botType: query.botType,
    telegramUserId: query.telegramUserId,
    limit: query.limit,
  });
  res.json({ items });
});
