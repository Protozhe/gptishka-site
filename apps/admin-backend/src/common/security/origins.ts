import { env } from "../../config/env";

function normalizeOrigin(value: string) {
  try {
    return new URL(value).origin.toLowerCase();
  } catch {
    return "";
  }
}

export function getAllowedOrigins() {
  const origins = new Set<string>();

  [env.ADMIN_UI_URL, env.APP_URL, env.FRONTEND_URL, env.API_URL]
    .map((item) => normalizeOrigin(String(item || "")))
    .filter(Boolean)
    .forEach((item) => origins.add(item));

  String(env.ADMIN_UI_URLS || "")
    .split(",")
    .map((item) => normalizeOrigin(item.trim()))
    .filter(Boolean)
    .forEach((item) => origins.add(item));

  if (env.NODE_ENV !== "production") {
    [
      "http://localhost:3000",
      "http://127.0.0.1:3000",
      "http://localhost:5173",
      "http://127.0.0.1:5173",
    ]
      .map(normalizeOrigin)
      .filter(Boolean)
      .forEach((item) => origins.add(item));
  }

  return origins;
}

