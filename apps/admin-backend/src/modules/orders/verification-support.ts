export const VERIFICATION_SUPPORT_SLUGS = ["claude-kyc-support", "claude-cvp-support"] as const;
export const VERIFICATION_MANAGER_URL = "https://t.me/gptishkasupport";
export function isVerificationSupportProduct(value: unknown): boolean {
  return VERIFICATION_SUPPORT_SLUGS.some(slug => slug === String(value || "").trim().toLowerCase());
}
