import { NextFunction, Request, Response } from "express";

export function attachRequestMeta(req: Request, _res: Response, next: NextFunction) {
  req.requestMeta = {
    ip: req.ip,
    userAgent: String(req.headers["user-agent"] || ""),
  };
  next();
}
