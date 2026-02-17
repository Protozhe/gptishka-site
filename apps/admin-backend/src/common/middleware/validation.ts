import { z } from "zod";
import { NextFunction, Request, Response } from "express";
import { AppError } from "../errors/app-error";

export function validateBody<T>(schema: z.Schema<T>) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return next(new AppError("Validation failed", 422, result.error.flatten()));
    }

    req.body = result.data;
    next();
  };
}

export function validateQuery<T>(schema: z.Schema<T>) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      return next(new AppError("Validation failed", 422, result.error.flatten()));
    }

    req.query = result.data as any;
    next();
  };
}
