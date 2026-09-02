export function isTelegramOrderEmail(value: string | null | undefined) {
  const normalized = String(value || "").trim().toLowerCase();
  const separatorIndex = normalized.lastIndexOf("@");
  if (separatorIndex < 0) return false;
  const domain = normalized.slice(separatorIndex + 1);
  return domain === "telegram.local" || domain.endsWith(".telegram.local");
}
