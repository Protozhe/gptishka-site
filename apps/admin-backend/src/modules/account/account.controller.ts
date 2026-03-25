import { Request, Response } from "express";
import { asyncHandler } from "../../common/http/async-handler";
import { AppError } from "../../common/errors/app-error";
import { env } from "../../config/env";
import { accountService } from "./account.service";

function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: env.CUSTOMER_SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
    path: "/api/account",
  };
}

export const requestAccountMagicLink = asyncHandler(async (req: Request, res: Response) => {
  const { email, next } = req.body as { email: string; next?: string };
  const result = await accountService.requestMagicLink({
    email,
    next,
    ip: req.requestMeta?.ip || req.ip,
    userAgent: req.requestMeta?.userAgent || String(req.headers["user-agent"] || ""),
  });

  res.status(202).json({
    ok: true,
    message:
      "Если email найден среди оплаченных заказов, мы отправили ссылку для входа в кабинет. Проверьте входящие и папку Спам.",
    debug: env.NODE_ENV === "production" ? null : result,
  });
});

export const requestAccountTelegramAuth = asyncHandler(async (req: Request, res: Response) => {
  const payload = await accountService.requestTelegramAuthToken({
    ip: req.requestMeta?.ip || req.ip,
    userAgent: req.requestMeta?.userAgent || String(req.headers["user-agent"] || ""),
  });
  res.status(201).json(payload);
});

export const accountTelegramAuthStatus = asyncHandler(async (req: Request, res: Response) => {
  const token = String(req.query.token || "").trim();
  const payload = await accountService.getTelegramAuthTokenStatus(token);
  res.json(payload);
});

export const consumeAccountTelegramAuth = asyncHandler(async (req: Request, res: Response) => {
  const { token } = req.body as { token: string };
  const payload = await accountService.consumeTelegramAuthToken(token, {
    ip: req.requestMeta?.ip || req.ip,
    userAgent: req.requestMeta?.userAgent || String(req.headers["user-agent"] || ""),
  });

  if (!payload.ready) {
    const statusCode = payload.status === "expired" ? 410 : payload.status === "consumed" ? 409 : 202;
    res.status(statusCode).json(payload);
    return;
  }

  res.cookie(env.CUSTOMER_SESSION_COOKIE_NAME, payload.sessionToken, sessionCookieOptions());
  res.json({
    ok: true,
    customer: payload.customer,
    nextPath: payload.nextPath,
    sessionExpiresAt: payload.sessionExpiresAt,
    authMethod: "telegram",
  });
});

export const consumeAccountMagicLink = asyncHandler(async (req: Request, res: Response) => {
  const { token } = req.body as { token: string };
  const result = await accountService.consumeMagicLinkToken(token, {
    ip: req.requestMeta?.ip || req.ip,
    userAgent: req.requestMeta?.userAgent || String(req.headers["user-agent"] || ""),
  });

  res.cookie(env.CUSTOMER_SESSION_COOKIE_NAME, result.sessionToken, sessionCookieOptions());
  res.json({
    ok: true,
    customer: result.customer,
    nextPath: result.nextPath,
    sessionExpiresAt: result.sessionExpiresAt,
  });
});

export const consumeAccountMagicLinkRedirect = asyncHandler(async (req: Request, res: Response) => {
  const token = String(req.query.token || "").trim();
  if (!token) throw new AppError("Token is required", 400);

  const result = await accountService.consumeMagicLinkToken(token, {
    ip: req.requestMeta?.ip || req.ip,
    userAgent: req.requestMeta?.userAgent || String(req.headers["user-agent"] || ""),
  });

  res.cookie(env.CUSTOMER_SESSION_COOKIE_NAME, result.sessionToken, sessionCookieOptions());
  const rawQueryNext = String(req.query.next || "").trim();
  const nextPath = rawQueryNext ? accountService.sanitizeNextPath(rawQueryNext) : result.nextPath;
  if (String(req.query.format || "").trim().toLowerCase() === "json") {
    res.json({
      ok: true,
      customer: result.customer,
      nextPath,
      sessionExpiresAt: result.sessionExpiresAt,
    });
    return;
  }

  res.redirect(302, nextPath);
});

export const accountMe = asyncHandler(async (req: Request, res: Response) => {
  if (!req.customerAuth) throw new AppError("Unauthorized", 401);
  const payload = await accountService.getAccountOverview(req.customerAuth.customerId);
  res.json(payload);
});

export const accountRevealVpnKey = asyncHandler(async (req: Request, res: Response) => {
  if (!req.customerAuth) throw new AppError("Unauthorized", 401);
  const vpnAccessId = String(req.params.id || "").trim();
  if (!vpnAccessId) throw new AppError("VPN access id is required", 400);

  const payload = await accountService.revealVpnAccessKey({
    customerId: req.customerAuth.customerId,
    vpnAccessId,
    ip: req.requestMeta?.ip || req.ip,
    userAgent: req.requestMeta?.userAgent || String(req.headers["user-agent"] || ""),
  });
  res.json(payload);
});

export const accountGetNotificationPreferences = asyncHandler(async (req: Request, res: Response) => {
  if (!req.customerAuth) throw new AppError("Unauthorized", 401);
  const payload = await accountService.getNotificationPreferences(req.customerAuth.customerId);
  res.json(payload);
});

export const accountUpdateNotificationPreferences = asyncHandler(async (req: Request, res: Response) => {
  if (!req.customerAuth) throw new AppError("Unauthorized", 401);
  const payload = await accountService.updateNotificationPreferences(req.customerAuth.customerId, req.body || {});
  res.json(payload);
});

export const accountTelegramStatus = asyncHandler(async (req: Request, res: Response) => {
  if (!req.customerAuth) throw new AppError("Unauthorized", 401);
  const payload = await accountService.getTelegramStatus(req.customerAuth.customerId);
  res.json(payload);
});

export const accountRequestTelegramLink = asyncHandler(async (req: Request, res: Response) => {
  if (!req.customerAuth) throw new AppError("Unauthorized", 401);
  const payload = await accountService.requestTelegramLinkToken({
    customerId: req.customerAuth.customerId,
    ip: req.requestMeta?.ip || req.ip,
    userAgent: req.requestMeta?.userAgent || String(req.headers["user-agent"] || ""),
  });
  res.status(201).json(payload);
});

export const accountTelegramUnlink = asyncHandler(async (req: Request, res: Response) => {
  if (!req.customerAuth) throw new AppError("Unauthorized", 401);
  const payload = await accountService.unlinkTelegram({
    customerId: req.customerAuth.customerId,
    ip: req.requestMeta?.ip || req.ip,
    userAgent: req.requestMeta?.userAgent || String(req.headers["user-agent"] || ""),
  });
  res.json(payload);
});

export const accountLogout = asyncHandler(async (req: Request, res: Response) => {
  const token = String(req.cookies?.[env.CUSTOMER_SESSION_COOKIE_NAME] || "").trim();
  if (token) {
    await accountService.logout(token);
  }
  res.clearCookie(env.CUSTOMER_SESSION_COOKIE_NAME, sessionCookieOptions());
  res.status(204).send();
});

export const accountLogoutAll = asyncHandler(async (req: Request, res: Response) => {
  if (!req.customerAuth) throw new AppError("Unauthorized", 401);
  await accountService.logoutAll(req.customerAuth.customerId);
  res.clearCookie(env.CUSTOMER_SESSION_COOKIE_NAME, sessionCookieOptions());
  res.status(204).send();
});

export const adminAccountLookup = asyncHandler(async (req: Request, res: Response) => {
  const payload = await accountService.adminLookup({
    email: String(req.query.email || "").trim() || undefined,
    orderId: String(req.query.orderId || "").trim() || undefined,
    vpnAccessId: String(req.query.vpnAccessId || "").trim() || undefined,
  });
  res.json(payload);
});

export const adminAccountSendMagicLink = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as { email: string; next?: string };
  const payload = await accountService.adminSendMagicLink({
    email: body.email,
    next: body.next,
    requestedByUserId: req.auth?.userId || null,
    ip: req.requestMeta?.ip || req.ip,
    userAgent: req.requestMeta?.userAgent || String(req.headers["user-agent"] || ""),
  });
  res.status(202).json(payload);
});

export const adminAccountLinkOrder = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as {
    orderId: string;
    email: string;
    syncOrderEmail?: boolean;
    syncVpnAccessEmail?: boolean;
  };
  const payload = await accountService.adminLinkOrderToCustomer({
    orderId: body.orderId,
    email: body.email,
    syncOrderEmail: body.syncOrderEmail,
    syncVpnAccessEmail: body.syncVpnAccessEmail,
    requestedByUserId: req.auth?.userId || null,
    ip: req.requestMeta?.ip || req.ip,
    userAgent: req.requestMeta?.userAgent || String(req.headers["user-agent"] || ""),
  });
  res.json(payload);
});

export const adminAccountLinkVpnAccess = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as {
    vpnAccessId: string;
    email: string;
    syncOrderEmail?: boolean;
  };
  const payload = await accountService.adminLinkVpnAccessToCustomer({
    vpnAccessId: body.vpnAccessId,
    email: body.email,
    syncOrderEmail: body.syncOrderEmail,
    requestedByUserId: req.auth?.userId || null,
    ip: req.requestMeta?.ip || req.ip,
    userAgent: req.requestMeta?.userAgent || String(req.headers["user-agent"] || ""),
  });
  res.json(payload);
});

export const adminAccountSendTelegramTestMessage = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as {
    customerId?: string;
    email?: string;
    message?: string;
  };
  const payload = await accountService.adminSendTelegramTestMessage({
    customerId: body.customerId,
    email: body.email,
    message: body.message,
    requestedByUserId: req.auth?.userId || null,
    ip: req.requestMeta?.ip || req.ip,
    userAgent: req.requestMeta?.userAgent || String(req.headers["user-agent"] || ""),
  });
  res.json(payload);
});
