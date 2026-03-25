import dotenv from "dotenv";
import { z } from "zod";
import path from "path";
import fs from "fs";

const envFileCandidates = [
  path.resolve(__dirname, "../../.env"),
  path.resolve(process.cwd(), ".env"),
];

for (const candidate of envFileCandidates) {
  if (fs.existsSync(candidate)) {
    dotenv.config({ path: candidate });
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
if (!process.env.HOST && process.env.BIND_HOST) {
  process.env.HOST = process.env.BIND_HOST;
}
if (!process.env.APP_URL && process.env.API_URL) {
  process.env.APP_URL = process.env.API_URL;
}
if (!process.env.APP_BASE_URL && process.env.APP_URL) {
  process.env.APP_BASE_URL = process.env.APP_URL;
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
if (!process.env.LAVA_WEBHOOK_SECRET && process.env.LAVA_ADDITIONAL_SECRET) {
  process.env.LAVA_WEBHOOK_SECRET = process.env.LAVA_ADDITIONAL_SECRET;
}
if (!process.env.LAVA_ADDITIONAL_SECRET && process.env.LAVA_WEBHOOK_SECRET) {
  process.env.LAVA_ADDITIONAL_SECRET = process.env.LAVA_WEBHOOK_SECRET;
}

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4100),
  HOST: z.string().default("127.0.0.1"),
  BIND_HOST: z.string().optional().default(""),
  APP_URL: z.string().url(),
  APP_BASE_URL: z.string().url().default("https://gptishka.shop"),
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
  CUSTOMER_SESSION_COOKIE_NAME: z.string().default("customer_session"),
  CUSTOMER_SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  CUSTOMER_MAGIC_LINK_TTL_MINUTES: z.coerce.number().int().min(5).max(120).default(20),
  CUSTOMER_TELEGRAM_AUTH_TTL_MINUTES: z.coerce.number().int().min(3).max(60).default(10),
  ACCOUNT_NOTIFICATIONS_ENABLED: z
    .union([z.boolean(), z.string()])
    .transform((value) => (typeof value === "boolean" ? value : String(value).toLowerCase() === "true"))
    .default(false),
  ACCOUNT_NOTIFY_SCAN_INTERVAL_MS: z.coerce.number().int().min(60_000).max(60 * 60_000).default(5 * 60_000),
  ACCOUNT_NOTIFY_WINDOW_MINUTES: z.coerce.number().int().min(15).max(24 * 60).default(60),
  ACCOUNT_NOTIFY_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(20).default(5),
  TELEGRAM_BOT_TOKEN: z.string().optional().default(""),
  TELEGRAM_BOT_USERNAME: z.string().optional().default(""),
  TELEGRAM_WEBHOOK_SECRET: z.string().optional().default(""),
  TELEGRAM_LINK_TOKEN_TTL_MINUTES: z.coerce.number().int().min(5).max(120).default(15),
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
  PAYMENT_WEBHOOK_URL: z.string().url().default("https://gptishka.shop/api/public/webhook/payment"),
  PAYMENT_WEBHOOK_SIGNATURE_HEADER: z.string().default("x-api-sha256-signature"),
  PAYMENT_WEBHOOK_IP_ALLOWLIST: z.string().default(""),
  LAVA_SHOP_ID: z.string().default(""),
  LAVA_SECRET_KEY: z.string().default(""),
  LAVA_ADDITIONAL_SECRET: z.string().default(""),
  LAVA_WEBHOOK_SECRET: z.string().default(""),
  LAVA_API_BASE_URL: z.string().url().default("https://api.lava.ru"),
  LAVA_CREATE_PATH: z.string().default("/business/invoice/create"),
  LAVA_STATUS_PATH: z.string().default("/business/invoice/status"),
  LAVA_WEBHOOK_URL: z.string().url().default("https://gptishka.shop/api/public/webhook/lava"),
  LAVA_WEBHOOK_SIGNATURE_HEADER: z.string().default("authorization"),
  LAVA_WEBHOOK_IP_ALLOWLIST: z.string().default(""),
  STORAGE_DRIVER: z.enum(["local"]).default("local"),
  // Some upstream providers bind tasks to a device id. Use a stable value.
  ACTIVATION_DEVICE_ID: z.string().optional().default("web"),
  ACTIVATION_TOKEN_ENCRYPTION_KEY: z.string().optional().default(""),
  ACTIVATION_STORED_TOKEN_TTL_HOURS: z.coerce.number().int().min(1).max(24 * 30).default(24 * 7),
  VPN_SERVER_ID: z.string().min(2).default("eu-1"),
  VPN_3XUI_BASE_URL: z.string().optional().default(""),
  VPN_3XUI_USERNAME: z.string().optional().default(""),
  VPN_3XUI_PASSWORD: z.string().optional().default(""),
  VPN_3XUI_INBOUND_ID: z.coerce.number().int().min(0).default(0),
  VPN_3XUI_CLIENT_TOTAL_GB: z.coerce.number().min(0).default(0),
  VPN_TELEGRAM_LOOKUP_TOKEN: z.string().optional().default(""),
  VPN_AUTO_SEED_PRODUCTS: z
    .union([z.boolean(), z.string()])
    .transform((value) => (typeof value === "boolean" ? value : String(value).toLowerCase() === "true"))
    .default(false),
  VPN_ACCESS_LINK_TEMPLATE: z.string().optional().default(""),
  VPN_VLESS_HOST: z.string().optional().default("89.208.96.217"),
  VPN_VLESS_PORT: z.coerce.number().int().min(1).max(65535).default(443),
  VPN_VLESS_SNI: z.string().optional().default("www.microsoft.com"),
  VPN_VLESS_PBK: z.string().optional().default("tjkQAA2MFOuXNbvE50pjKG6hinrbC5pzmuqOifA0fQM"),
  VPN_VLESS_SID: z.string().optional().default("7a"),
  VPN_VLESS_FP: z.string().optional().default("chrome"),
  VPN_VLESS_PATH: z.string().optional().default(""),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid env:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
