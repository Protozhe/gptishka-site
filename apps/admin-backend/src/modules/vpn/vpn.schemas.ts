import { z } from "zod";

export const vpnListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  q: z.string().trim().max(200).optional().default(""),
  active: z.string().trim().optional().default(""),
  serverId: z.string().trim().max(64).optional().default(""),
});

export const vpnActionReasonSchema = z.object({
  reason: z.string().trim().max(300).optional().default(""),
});

export const vpnSetExpirySchema = z.object({
  expiresAt: z.string().trim().min(1),
  reason: z.string().trim().max(300).optional().default(""),
});

export const vpnSyncExpiredSchema = z.object({
  limit: z.coerce.number().int().min(1).max(1000).optional().default(200),
});

export const vpnExportQuerySchema = vpnListQuerySchema.partial().extend({
  includeAccessLink: z.union([z.string(), z.number(), z.boolean()]).optional().default("1"),
});
