import { Request, Response } from "express";
import { prisma } from "../../config/prisma";
import { env } from "../../config/env";
import { asyncHandler } from "../../common/http/async-handler";
import { validateUserCredentials } from "./auth.service";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "./token.service";
import { sha256 } from "../../common/utils/hash";
import { AppError } from "../../common/errors/app-error";
import bcrypt from "bcrypt";
import { RoleCode } from "@prisma/client";

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

  const refreshToken = signRefreshToken(user.id);
  const accessToken = signAccessToken(user.id, user.role.code);

  await prisma.refreshToken.create({
    data: {
      tokenHash: sha256(refreshToken),
      userId: user.id,
      userAgent: String(req.headers["user-agent"] || ""),
      ip: req.ip,
      expiresAt: new Date(Date.now() + env.JWT_REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000),
    },
  });

  res.cookie(env.REFRESH_COOKIE_NAME, refreshToken, refreshCookieOptions());

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
});

export const registerAdmin = asyncHandler(async (req: Request, res: Response) => {
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
  const accessToken = signAccessToken(user.id, user.role.code);

  await prisma.refreshToken.create({
    data: {
      tokenHash: sha256(refreshToken),
      userId: user.id,
      userAgent: String(req.headers["user-agent"] || ""),
      ip: req.ip,
      expiresAt: new Date(Date.now() + env.JWT_REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000),
    },
  });

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

  const nextRefresh = signRefreshToken(stored.userId);
  const nextAccess = signAccessToken(stored.userId, stored.user.role.code);

  await prisma.$transaction([
    prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } }),
    prisma.refreshToken.create({
      data: {
        tokenHash: sha256(nextRefresh),
        userId: stored.userId,
        userAgent: String(req.headers["user-agent"] || ""),
        ip: req.ip,
        expiresAt: new Date(Date.now() + env.JWT_REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000),
      },
    }),
  ]);

  res.cookie(env.REFRESH_COOKIE_NAME, nextRefresh, refreshCookieOptions());
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
