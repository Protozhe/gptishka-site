/** App Store cards are prepared for the paid order; stock does not gate checkout. */
export function appStoreCard(product: { slug?: unknown; tags?: unknown } | null | undefined) {
  const tags = Array.isArray(product?.tags) ? product.tags : [];
  if (!tags.includes("itunes") || !tags.includes("delivery:code")) return null;
  const match = /^itunes-(app-store|ru|us|tr|in|ae)-([1-9]\d*)$/.exec(String(product?.slug || ""));
  const denomination = Number(match?.[2]);
  return match && Number.isSafeInteger(denomination)
    ? { region: match[1] === "app-store" ? "us" : match[1], denomination }
    : null;
}

export function normalizeAppStoreCode(value: string) {
  const code = String(value || "").trim().replace(/[\s-]/g, "").toUpperCase();
  return /^[A-Z0-9]{16}$/.test(code) ? code : "";
}
