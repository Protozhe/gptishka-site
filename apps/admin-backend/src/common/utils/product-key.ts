function normalizeProductKey(value: string) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "");
  return normalized;
}

/**
 * Normalizes product keys used for CDK pools.
 *
 * Important: Do NOT collapse similar products into a shared pool (e.g. 1 month vs 1 year).
 * Each product must have its own independent key pool.
 */
export function canonicalProductKey(value: string) {
  return normalizeProductKey(value) || "";
}
