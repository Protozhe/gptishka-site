import { NextFunction, Request, Response } from "express";
import { AppError } from "../../common/errors/app-error";
import { verifyAccessToken } from "./token.service";
import { prisma } from "../../config/prisma";

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  req.auth = undefined;
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return next(new AppError("Unauthorized", 401));
  }

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    return next(new AppError("Unauthorized", 401));
  }

  try {
    // Roles and account status can change before the signed token expires.
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, isActive: true, role: { select: { code: true } } },
    });
    if (!user?.isActive || !user.role?.code) {
      return next(new AppError("Unauthorized", 401));
    }
    req.auth = { userId: user.id, role: user.role.code };
    return next();
  } catch (error) {
    return next(error);
  }
}

export function allowRoles(allowed: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) {
      return next(new AppError("Unauthorized", 401));
    }

    if (!allowed.includes(req.auth.role)) {
      return next(new AppError("Forbidden", 403));
    }

    next();
  };
}
