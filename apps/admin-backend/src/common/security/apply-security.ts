import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import morgan from "morgan";
import { Express } from "express";
import { env } from "../../config/env";
import { getAllowedOrigins } from "./origins";

export function applySecurity(app: Express) {
  const allowedOrigins = getAllowedOrigins();
  app.use(helmet());
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        try {
          const normalized = new URL(origin).origin.toLowerCase();
          return callback(null, allowedOrigins.has(normalized));
        } catch {
          return callback(null, false);
        }
      },
      credentials: true,
    })
  );
  app.use(cookieParser());
  // Never log query strings or Referer: both can contain order access tokens.
  morgan.token("private-path", (req) => String(req.url || "").split("?")[0]);
  app.use(morgan(':remote-addr :method :private-path :status :res[content-length] - :response-time ms'));
}
