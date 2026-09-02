export type AichongzhiProduct = "grok" | "claude";

export function resolveAichongzhiProduct(productKey?: string | null): AichongzhiProduct | null {
  const key = String(productKey || "").trim().toLowerCase();
  if (!key) return null;

  if (
    (key.includes("grok") || key.includes("supergrok")) &&
    !key.includes("xpremium") &&
    !key.includes("x-premium")
  ) {
    return "grok";
  }

  if (key.includes("claude-pro") && !key.includes("claude-max")) {
    return "claude";
  }

  return null;
}
