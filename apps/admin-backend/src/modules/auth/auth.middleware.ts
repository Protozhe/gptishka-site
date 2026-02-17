import { NextFunction, Request, Response } from "express";
import { AppError } from "../../common/errors/app-error";
import { verifyAccessToken } from "./token.service";

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return next(new AppError("Unauthorized", 401));
  }

  try {
    const payload = verifyAccessToken(token);
    req.auth = { userId: payload.sub, role: payload.role };
    next();
  } catch {
    next(new AppError("Unauthorized", 401));
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
