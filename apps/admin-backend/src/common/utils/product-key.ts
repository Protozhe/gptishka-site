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
 * Canonicalizes product keys used for CDK pools.
 *
 * Production uses product slugs like `chatgpt-plus-1m`, but keys are stored under
 * base pools like `chatgpt-plus`. This prevents "paid but no CDK issued" cases.
 */
export function canonicalProductKey(value: string) {
  const key = normalizeProductKey(value);
  if (!key) return "";

  if (key === "chatgpt-plus") return "chatgpt-plus";
  if (key.startsWith("chatgpt-plus-")) return "chatgpt-plus";

  if (key === "chatgpt-go") return "chatgpt-go";
  if (key.startsWith("chatgpt-go-")) return "chatgpt-go";

  if (key === "chatgpt") return "chatgpt";
  if (key.startsWith("chatgpt-")) return "chatgpt";

  return key;
}

