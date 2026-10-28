export const VERIFICATION_SUPPORT_SLUGS = ["claude-kyc-support", "claude-cvp-support", "claude-kyc", "claude-cvp"] as const;
export const VERIFICATION_MANAGER_URL = "https://t.me/gptishkasupport";
export function isVerificationSupportProduct(value: unknown): boolean {
  return VERIFICATION_SUPPORT_SLUGS.some(slug => slug === String(value || "").trim().toLowerCase());
}

export function validateVerificationSupportLink(value: unknown): string | null {
  const raw = String(value || "").trim();
  if (!raw || raw.length > 8192 || /\s/.test(raw)) return "Вставьте полную HTTPS-ссылку на страницу верификации.";
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== "https:" || url.username || url.password || url.port || !host.includes(".") ||
      host === "gptishka.shop" || host.endsWith(".gptishka.shop") ||
      host === "localhost" || host.endsWith(".localhost") || /^\d[\d.]*$/.test(host)) {
      return "Нужна ссылка на страницу верификации после Verify now и Start, а не ссылка на заказ.";
    }
    return null;
  } catch {
    return "Вставьте полную HTTPS-ссылку на страницу верификации.";
  }
}
