import { Request, Response } from "express";
import { prisma } from "../../config/prisma";
import { env } from "../../config/env";
import { asyncHandler } from "../../common/http/async-handler";
import { validateUserCredentials } from "./auth.service";
import { signAccessToken, signRefreshToken, verifyRefreshToken, signPanelToken, verifyPanelToken } from "./token.service";
import { telegramMfaRequired, beginTelegramChallenge, consumeTelegramChallenge, requestBinding, credentialVersion, hasTrustedIp, rememberVerifiedIp } from "./telegram-mfa.service";
import { sha256 } from "../../common/utils/hash";
import { AppError } from "../../common/errors/app-error";
import bcrypt from "bcrypt";
import { RoleCode } from "@prisma/client";

const PANEL_COOKIE = "__Host-gptishka_panel";
function panelCookieOptions() {
  return { httpOnly: true, secure: true, sameSite: "strict" as const, path: "/" };
}
function setPanelCookie(res: Response, userId: string, sessionId: string, expiresAt: Date, mfa: boolean) {
  if (mfa) res.cookie(PANEL_COOKIE, signPanelToken(userId, sessionId, expiresAt), { ...panelCookieOptions(), expires: expiresAt });
}

function refreshCookieOptions() {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: env.JWT_REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000,
    path: "/api/admin/auth",
  };
}

export const login = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body as { email: string; password: string };
  const user = await validateUserCredentials(email, password);
  res.setHeader("Cache-Control", "no-store");
  if (telegramMfaRequired()) {
    const version = credentialVersion(user.id, user.passwordHash);
    if (await hasTrustedIp(user.id, req.ip || "", version)) return createLoginSession(req, res, user, true);
    return res.json(await beginTelegramChallenge(user.id, requestBinding(req.ip || "", String(req.headers["user-agent"] || "")), version));
  }
  await createLoginSession(req, res, user, false);
});

async function createLoginSession(req: Request, res: Response, user: Awaited<ReturnType<typeof validateUserCredentials>>, mfa: boolean) {
  const refreshToken = signRefreshToken(user.id, mfa);
  const session = await prisma.refreshToken.create({
    data: {
      tokenHash: sha256(refreshToken),
      userId: user.id,
      userAgent: String(req.headers["user-agent"] || ""),
      ip: req.ip,
      expiresAt: new Date(Date.now() + env.JWT_REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000),
    },
  });
  const accessToken = signAccessToken(user.id, user.role.code, session.id, mfa);

  res.cookie(env.REFRESH_COOKIE_NAME, refreshToken, refreshCookieOptions());
  setPanelCookie(res, user.id, session.id, session.expiresAt, mfa);

  res.json({
    accessToken,
    user: {
      id: user.id,
      email: user.email,
      role: user.role.code,
      firstName: user.firstName,
      lastName: user.lastName,
    },
  });
}

export const verifyTelegram = asyncHandler(async (req: Request, res: Response) => {
  const { challengeId, code } = req.body as { challengeId: string; code: string };
  const verified = await consumeTelegramChallenge(challengeId, code, requestBinding(req.ip || "", String(req.headers["user-agent"] || "")));
  const user = await prisma.user.findUnique({ where: { id: verified.userId }, include: { role: true } });
  if (!user?.isActive) throw new AppError("Unauthorized", 401);
  const version = credentialVersion(user.id, user.passwordHash);
  if (verified.credentialVersion && verified.credentialVersion !== version) throw new AppError("Пароль изменился. Начните вход заново", 401);
  // Codes issued before the rollout remain usable, but cannot enroll an IP
  // because their challenge was not bound to the current password version.
  if (verified.credentialVersion) await rememberVerifiedIp(user.id, req.ip || "", version);
  res.setHeader("Cache-Control", "no-store");
  await createLoginSession(req, res, user, true);
});

export const panelCheck = asyncHandler(async (req: Request, res: Response) => {
  res.setHeader("Cache-Control", "no-store");
  let payload;
  try { payload = verifyPanelToken(String(req.cookies?.[PANEL_COOKIE] || "")); }
  catch { throw new AppError("Unauthorized", 401); }
  const session = await prisma.refreshToken.findFirst({
    where: { id: payload.sid, userId: payload.sub, revokedAt: null, expiresAt: { gt: new Date() } },
    select: { user: { select: { isActive: true, role: { select: { code: true } } } } },
  });
  if (!session?.user.isActive || !["OWNER", "ADMIN"].includes(session.user.role.code)) throw new AppError("Unauthorized", 401);
  res.status(204).send();
});

export const registerAdmin = asyncHandler(async (req: Request, res: Response) => {
  // Production users are provisioned out of band with an individual MFA chat.
  if (telegramMfaRequired()) throw new AppError("Bootstrap registration is disabled", 403);
  const { email, password, firstName, lastName } = req.body as {
    email: string;
    password: string;
    firstName?: string;
    lastName?: string;
  };

  const existingRootUsers = await prisma.user.count({
    where: {
      role: {
        code: { in: [RoleCode.OWNER, RoleCode.ADMIN] },
      },
    },
  });

  if (existingRootUsers > 0) {
    throw new AppError("Bootstrap registration is disabled", 403);
  }

  const adminRole = await prisma.role.upsert({
    where: { code: RoleCode.ADMIN },
    create: { code: RoleCode.ADMIN, name: "Admin" },
    update: {},
  });

  const passwordHash = await bcrypt.hash(password, env.BCRYPT_ROUNDS);

  const user = await prisma.user.create({
    data: {
      email: email.toLowerCase(),
      passwordHash,
      firstName: firstName || null,
      lastName: lastName || null,
      roleId: adminRole.id,
    },
    include: { role: true },
  });

  const refreshToken = signRefreshToken(user.id);
  const session = await prisma.refreshToken.create({
    data: {
      tokenHash: sha256(refreshToken),
      userId: user.id,
      userAgent: String(req.headers["user-agent"] || ""),
      ip: req.ip,
      expiresAt: new Date(Date.now() + env.JWT_REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000),
    },
  });
  const accessToken = signAccessToken(user.id, user.role.code, session.id);

  res.cookie(env.REFRESH_COOKIE_NAME, refreshToken, refreshCookieOptions());
  res.status(201).json({
    accessToken,
    user: {
      id: user.id,
      email: user.email,
      role: user.role.code,
      firstName: user.firstName,
      lastName: user.lastName,
    },
  });
});

export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const token = String(req.cookies?.[env.REFRESH_COOKIE_NAME] || "");
  if (!token) throw new AppError("Unauthorized", 401);

  let payload;
  try {
    payload = verifyRefreshToken(token);
  } catch {
    throw new AppError("Unauthorized", 401);
  }
  if (telegramMfaRequired() && payload.mfa !== true) throw new AppError("Unauthorized", 401);

  const hashed = sha256(token);
  const stored = await prisma.refreshToken.findFirst({
    where: {
      tokenHash: hashed,
      userId: payload.sub,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    include: { user: { include: { role: true } } },
  });

  if (!stored || !stored.user.isActive) throw new AppError("Unauthorized", 401);

  const nextRefresh = signRefreshToken(stored.userId, payload.mfa === true);
  // Compare-and-swap cannot resurrect a concurrently revoked device session.
  const rotated = await prisma.refreshToken.updateMany({
    where: { id: stored.id, tokenHash: hashed, revokedAt: null, expiresAt: { gt: new Date() } },
    data: { tokenHash: sha256(nextRefresh) },
  });
  if (rotated.count !== 1) throw new AppError("Unauthorized", 401);
  const nextAccess = signAccessToken(stored.userId, stored.user.role.code, stored.id, payload.mfa === true);

  res.cookie(env.REFRESH_COOKIE_NAME, nextRefresh, refreshCookieOptions());
  setPanelCookie(res, stored.userId, stored.id, stored.expiresAt, payload.mfa === true);
  res.json({ accessToken: nextAccess });
});

export const logout = asyncHandler(async (req: Request, res: Response) => {
  const token = String(req.cookies?.[env.REFRESH_COOKIE_NAME] || "");
  if (token) {
    await prisma.refreshToken.updateMany({
      where: { tokenHash: sha256(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  res.clearCookie(env.REFRESH_COOKIE_NAME, refreshCookieOptions());
  res.clearCookie(PANEL_COOKIE, panelCookieOptions());
  res.status(204).send();
});

export const me = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw new AppError("Unauthorized", 401);

  const user = await prisma.user.findUnique({
    where: { id: req.auth.userId },
    include: { role: true },
  });

  if (!user) throw new AppError("Unauthorized", 401);

  res.json({
    id: user.id,
    email: user.email,
    role: user.role.code,
    firstName: user.firstName,
    lastName: user.lastName,
  });
});

export const listSessions = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw new AppError("Unauthorized", 401);
  const sessions = await prisma.refreshToken.findMany({
    where: { userId: req.auth.userId, revokedAt: null, expiresAt: { gt: new Date() } },
    select: { id: true, userAgent: true, ip: true, createdAt: true, expiresAt: true },
    orderBy: { createdAt: "desc" },
  });
  res.setHeader("Cache-Control", "no-store");
  res.json(sessions.map(session => ({ ...session, current: session.id === req.auth!.sessionId })));
});

export const revokeSession = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw new AppError("Unauthorized", 401);
  await prisma.refreshToken.updateMany({
    where: { id: String(req.params.id), userId: req.auth.userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (req.params.id === req.auth.sessionId) {
    res.clearCookie(env.REFRESH_COOKIE_NAME, refreshCookieOptions());
    res.clearCookie(PANEL_COOKIE, panelCookieOptions());
  }
  res.status(204).send();
});

export const revokeOtherSessions = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw new AppError("Unauthorized", 401);
  await prisma.refreshToken.updateMany({
    where: { userId: req.auth.userId, id: { not: req.auth.sessionId }, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  res.status(204).send();
});
