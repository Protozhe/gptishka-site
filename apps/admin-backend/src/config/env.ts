import dotenv from "dotenv";
import { z } from "zod";
import path from "path";
import fs from "fs";

const envFileCandidates = [
  path.resolve(process.cwd(), ".env"),
  path.resolve(__dirname, "../../.env"),
];

for (const candidate of envFileCandidates) {
  if (fs.existsSync(candidate)) {
    dotenv.config({ path: candidate });
    break;
  }
}

if (!process.env.JWT_ACCESS_SECRET && process.env.JWT_SECRET) {
  process.env.JWT_ACCESS_SECRET = process.env.JWT_SECRET;
}
if (!process.env.JWT_REFRESH_SECRET && process.env.JWT_SECRET) {
  process.env.JWT_REFRESH_SECRET = process.env.JWT_SECRET;
}
if (!process.env.JWT_ACCESS_SECRET && process.env.SESSION_SECRET) {
  process.env.JWT_ACCESS_SECRET = process.env.SESSION_SECRET;
}
if (!process.env.JWT_REFRESH_SECRET && process.env.SESSION_SECRET) {
  process.env.JWT_REFRESH_SECRET = process.env.SESSION_SECRET;
}
if (!process.env.ADMIN_UI_URL && process.env.FRONTEND_URL) {
  process.env.ADMIN_UI_URL = process.env.FRONTEND_URL;
}
if (!process.env.APP_URL && process.env.API_URL) {
  process.env.APP_URL = process.env.API_URL;
}
if (!process.env.ENOT_API_KEY && process.env.PAYMENT_SECRET) {
  process.env.ENOT_API_KEY = process.env.PAYMENT_SECRET;
}
if (!process.env.PAYMENT_SECRET && process.env.ENOT_API_KEY) {
  process.env.PAYMENT_SECRET = process.env.ENOT_API_KEY;
}
if (!process.env.ENOT_SHOP_ID && process.env.PAYMENT_SHOP_ID) {
  process.env.ENOT_SHOP_ID = process.env.PAYMENT_SHOP_ID;
}
if (!process.env.PAYMENT_SHOP_ID && process.env.ENOT_SHOP_ID) {
  process.env.PAYMENT_SHOP_ID = process.env.ENOT_SHOP_ID;
}
if (!process.env.ENOT_WEBHOOK_SECRET && process.env.WEBHOOK_SECRET) {
  process.env.ENOT_WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;
}
if (!process.env.WEBHOOK_SECRET && process.env.ENOT_WEBHOOK_SECRET) {
  process.env.WEBHOOK_SECRET = process.env.ENOT_WEBHOOK_SECRET;
}

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4100),
  APP_URL: z.string().url(),
  ADMIN_UI_URL: z.string().url(),
  ADMIN_UI_URLS: z.string().optional().default(""),
  FRONTEND_URL: z.string().optional().default(""),
  API_URL: z.string().optional().default(""),
  DATABASE_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  SESSION_SECRET: z.string().optional().default(""),
  JWT_SECRET: z.string().optional().default(""),
  JWT_ACCESS_TTL: z.string().default("15m"),
  JWT_REFRESH_TTL_DAYS: z.coerce.number().int().min(1).default(30),
  REFRESH_COOKIE_NAME: z.string().default("admin_refresh_token"),
  BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
  SMTP_HOST: z.string().optional().default(""),
  SMTP_PORT: z.coerce.number().int().default(587),
  SMTP_SECURE: z
    .union([z.boolean(), z.string()])
    .transform((value) => (typeof value === "boolean" ? value : value === "true"))
    .default(false),
  SMTP_USER: z.string().optional().default(""),
  SMTP_PASSWORD: z.string().optional().default(""),
  SMTP_FROM: z.string().default("no-reply@gptishka.local"),
  TELEGRAM_BOT_TOKEN: z.string().optional().default(""),
  TELEGRAM_CHAT_ID: z.string().optional().default(""),
  FX_USD_RUB: z.coerce.number().positive().default(95),
  FX_EUR_RUB: z.coerce.number().positive().default(103),
  FX_USDT_RUB: z.coerce.number().positive().default(95),
  PAYMENT_PROVIDER: z.string().default("gateway"),
  ENOT_API_KEY: z.string().default(""),
  ENOT_SHOP_ID: z.string().default(""),
  ENOT_WEBHOOK_SECRET: z.string().default(""),
  PAYMENT_SECRET: z.string().default(""),
  PAYMENT_SHOP_ID: z.string().default(""),
  WEBHOOK_SECRET: z.string().default(""),
  PAYMENT_API_BASE_URL: z.string().url().default("https://api.enot.io"),
  PAYMENT_CREATE_PATH: z.string().default("/invoice/create"),
  PAYMENT_REFUND_PATH: z.string().default("/invoice/refund"),
  PAYMENT_SUCCESS_URL: z.string().url().default("https://gptishka.shop/success.html"),
  PAYMENT_FAIL_URL: z.string().url().default("https://gptishka.shop/fail.html"),
  PAYMENT_WEBHOOK_URL: z.string().url().default("https://admin-api.gptishka.shop/api/public/webhook/payment"),
  PAYMENT_WEBHOOK_SIGNATURE_HEADER: z.string().default("x-api-sha256-signature"),
  PAYMENT_WEBHOOK_IP_ALLOWLIST: z.string().default(""),
  STORAGE_DRIVER: z.enum(["local"]).default("local"),
  // Some upstream providers bind tasks to a device id. Use a stable value.
  ACTIVATION_DEVICE_ID: z.string().optional().default("web"),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid env:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
