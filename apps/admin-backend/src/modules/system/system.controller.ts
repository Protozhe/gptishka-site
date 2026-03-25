import { Request, Response } from "express";
import { z } from "zod";
import { AppError } from "../../common/errors/app-error";
import { env } from "../../config/env";
import { accountNotificationsService } from "../account/account-notifications.service";
import { getEmailTransportStatus, sendAdminTestEmail } from "../notifications/notifications.service";
import { adminSendTestEmailSchema } from "./system.schemas";

export async function getSystemMailStatus(_req: Request, res: Response) {
  const status = getEmailTransportStatus();
  res.json({
    ...status,
    notificationsEnabled: env.ACCOUNT_NOTIFICATIONS_ENABLED,
    notificationIntervalMs: env.ACCOUNT_NOTIFY_SCAN_INTERVAL_MS,
    notificationWindowMinutes: env.ACCOUNT_NOTIFY_WINDOW_MINUTES,
    notificationMaxAttempts: env.ACCOUNT_NOTIFY_MAX_ATTEMPTS,
  });
}

export async function postSystemMailTest(req: Request, res: Response) {
  const body = req.body as z.infer<typeof adminSendTestEmailSchema>;
  const targetEmail = String(body.email || "").trim().toLowerCase();

  const result = await sendAdminTestEmail(targetEmail, { requestedBy: req.auth?.userId || null });
  if (!result.sent) {
    if (result.reason === "smtp_not_configured") {
      throw new AppError("SMTP is not configured", 409, {
        reason: result.reason,
        targetEmail,
      });
    }
    throw new AppError("SMTP test email failed", 502, {
      reason: result.reason,
      error: result.error || null,
      targetEmail,
    });
  }

  res.status(202).json({
    ok: true,
    sent: true,
    targetEmail,
  });
}

export async function postRunAccountNotifyCycle(_req: Request, res: Response) {
  await accountNotificationsService.runOnce();
  res.json({ ok: true });
}

