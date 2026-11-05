import { AppError } from "../errors/app-error";

export const GEMINI_ACTIVATION_SITE = "https://aichongzhi.fun";
export const GEMINI_WORKFLOWS: Record<string, string> = {
  "gemini-pro-6m": "gemini_6m",
  "gemini-pro-12m": "gemini_12m",
  "gemini-pro-24m": "gemini_24m",
};

export function isGeminiAutomaticProduct(value: unknown) {
  return Object.prototype.hasOwnProperty.call(GEMINI_WORKFLOWS, String(value || "").trim().toLowerCase());
}

export type GeminiAccount = { email: string; password: string; twofa: string; recovery_email: string };

// Error messages are stable codes; never include any part of submitted credentials.
export function parseGeminiAccount(input: string): GeminiAccount {
  let value: any;
  try { value = JSON.parse(input); } catch { throw new AppError("gemini_account_required", 422); }
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      Object.keys(value).some((key) => !["email", "password", "twofa", "recovery_email", "consent"].includes(key))) {
    throw new AppError("gemini_account_required", 422);
  }
  if (value.consent !== true) throw new AppError("gemini_consent_required", 422);
  const email = typeof value.email === "string" ? value.email.trim().toLowerCase() : "";
  const password = typeof value.password === "string" ? value.password : "";
  const twofa = typeof value.twofa === "string" ? value.twofa.replace(/\s+/g, "") : "";
  const recovery_email = typeof value.recovery_email === "string" ? value.recovery_email.trim().toLowerCase() : "";
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailPattern.test(email) || email.length > 254) throw new AppError("gemini_email_invalid", 422);
  if (!password.trim() || password.length > 1024) throw new AppError("gemini_password_required", 422);
  if (!/^(?:[A-Z2-7]{16,128}={0,6}|\d{8})$/i.test(twofa)) throw new AppError("gemini_twofa_invalid", 422);
  if (recovery_email && (!emailPattern.test(recovery_email) || recovery_email.length > 254)) {
    throw new AppError("gemini_recovery_email_invalid", 422);
  }
  return { email, password, twofa, recovery_email };
}
