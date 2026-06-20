import { z } from "zod";

export const telegramBotOverviewQuerySchema = z.object({
  botType: z.enum(["claude", "chatgpt", "grok"]).optional(),
  days: z.coerce.number().int().min(1).max(30).default(7),
});

export const telegramBotEventsQuerySchema = z.object({
  botType: z.enum(["claude", "chatgpt", "grok"]).optional(),
  eventType: z.string().trim().min(1).max(120).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

export const telegramBotUsersQuerySchema = z.object({
  botType: z.enum(["claude", "chatgpt", "grok"]).optional(),
  days: z.coerce.number().int().min(1).max(30).default(7),
  limit: z.coerce.number().int().min(1).max(300).default(100),
});

export const telegramBotUserTimelineQuerySchema = z.object({
  botType: z.enum(["claude", "chatgpt", "grok"]).optional(),
  telegramUserId: z.string().trim().min(1).max(120),
  limit: z.coerce.number().int().min(1).max(300).default(100),
});
