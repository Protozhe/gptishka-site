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

/**
 * Resolves the immutable CDK/SDK pool assigned to a product.
 *
 * Product slugs remain the default so every product is isolated. Products
 * whose historical slug does not match the storefront plan can opt into an
 * explicit pool with an `activation-pool:<key>` tag.
 */
export function resolveProductPoolBaseKey(input: {
  slug?: string | null;
  id?: string | null;
  tags?: string[] | null;
}) {
  const explicitPool = (Array.isArray(input.tags) ? input.tags : [])
    .map((tag) => String(tag || "").trim().toLowerCase())
    .find((tag) => tag.startsWith("activation-pool:"))
    ?.slice("activation-pool:".length);

  return canonicalProductKey(explicitPool || input.slug || input.id || "");
}
