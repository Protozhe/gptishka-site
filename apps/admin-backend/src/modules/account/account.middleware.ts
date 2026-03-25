import { NextFunction, Request, Response } from "express";
import { AppError } from "../../common/errors/app-error";
import { env } from "../../config/env";
import { accountService } from "./account.service";

export async function requireCustomerSession(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = String(req.cookies?.[env.CUSTOMER_SESSION_COOKIE_NAME] || "").trim();
    if (!token) {
      return next(new AppError("Unauthorized", 401));
    }

    const session = await accountService.resolveSession(token);
    if (!session) {
      return next(new AppError("Unauthorized", 401));
    }

    req.customerAuth = {
      customerId: session.customerId,
      customerEmail: session.customer.email,
      sessionId: session.id,
    };
    next();
  } catch (error) {
    next(error);
  }
}

