import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import morgan from "morgan";
import { Express } from "express";
import { env } from "../../config/env";

export function applySecurity(app: Express) {
  app.use(helmet());
  app.use(
    cors({
      origin: env.ADMIN_UI_URL,
      credentials: true,
    })
  );
  app.use(cookieParser());
  app.use(morgan(env.NODE_ENV === "production" ? "combined" : "dev"));
}
