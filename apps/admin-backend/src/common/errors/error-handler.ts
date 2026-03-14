import { NextFunction, Request, Response } from "express";
import { AppError } from "../errors/app-error";
import { env } from "../../config/env";

export function notFoundHandler(_req: Request, _res: Response, next: NextFunction) {
  next(new AppError("Route not found", 404));
}

export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (error instanceof AppError) {
    const includeDetails = env.NODE_ENV !== "production";
    return res.status(error.statusCode).json({
      message: error.message,
      details: includeDetails ? (error.details ?? null) : null,
    });
  }

  console.error(error);
  return res.status(500).json({
    message: "Internal server error",
  });
}
