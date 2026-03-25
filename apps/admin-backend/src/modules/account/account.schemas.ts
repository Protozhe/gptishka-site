import { z } from "zod";

export const requestMagicLinkSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  next: z.string().trim().max(400).optional(),
});

export const consumeMagicLinkSchema = z.object({
  token: z.string().trim().min(20).max(512),
});

export const consumeTelegramAuthSchema = z.object({
  token: z.string().trim().min(20).max(512),
});

export const telegramAuthStatusQuerySchema = z.object({
  token: z.string().trim().min(20).max(512),
});

export const updateNotificationPreferencesSchema = z
  .object({
    emailEnabled: z.boolean().optional(),
    reminder7d: z.boolean().optional(),
    reminder3d: z.boolean().optional(),
    reminder1d: z.boolean().optional(),
    reminderExpired: z.boolean().optional(),
    marketingEmailEnabled: z.boolean().optional(),
    transactionalEmailEnabled: z.boolean().optional(),
  })
  .refine((value) => Object.values(value).some((item) => typeof item === "boolean"), {
    message: "At least one field is required",
  });

export const adminLookupQuerySchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(254).optional(),
    orderId: z.string().trim().min(6).max(120).optional(),
    vpnAccessId: z.string().trim().min(6).max(120).optional(),
  })
  .refine((value) => Boolean(value.email || value.orderId || value.vpnAccessId), {
    message: "email, orderId or vpnAccessId is required",
  });

export const adminSendMagicLinkSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  next: z.string().trim().max(400).optional(),
});

export const adminLinkOrderSchema = z.object({
  orderId: z.string().trim().min(6).max(120),
  email: z.string().trim().toLowerCase().email().max(254),
  syncOrderEmail: z.boolean().optional(),
  syncVpnAccessEmail: z.boolean().optional(),
});

export const adminLinkVpnAccessSchema = z.object({
  vpnAccessId: z.string().trim().min(6).max(120),
  email: z.string().trim().toLowerCase().email().max(254),
  syncOrderEmail: z.boolean().optional(),
});

export const adminTelegramTestMessageSchema = z
  .object({
    customerId: z.string().trim().min(6).max(120).optional(),
    email: z.string().trim().toLowerCase().email().max(254).optional(),
    message: z.string().trim().max(1500).optional(),
  })
  .refine((value) => Boolean(value.customerId || value.email), {
    message: "customerId or email is required",
  });
