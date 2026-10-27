import { AppError } from "../../common/errors/app-error";
import { normalizeActivationSiteUrl } from "../../common/utils/activation-site";
import { canonicalProductKey } from "../../common/utils/product-key";

export type CodexKeySupplier = "aibuy" | "aisou";

export const CODEX_KEY_SUPPLIER_SITES: Record<CodexKeySupplier, string> = {
  aibuy: "https://aichongzhi.fun",
  aisou: "https://aiee.fun",
};

export function isDualSupplierCodexPool(productKey: string) {
  return /^codex-(250|500|1000)$/.test(canonicalProductKey(productKey));
}

export function resolveCodexImportSite(productKey: string, site: string | undefined, supplier?: CodexKeySupplier) {
  const normalized = normalizeActivationSiteUrl(site);
  if (!supplier) return normalized;
  if (!isDualSupplierCodexPool(productKey)) {
    throw new AppError("Выбор AI-BUY / AISOU доступен для Codex 250, 500 и 1000 кредитов", 400);
  }
  const expected = CODEX_KEY_SUPPLIER_SITES[supplier];
  if (!expected || (String(site || "").trim() && normalized !== expected)) {
    throw new AppError("Сайт активации не соответствует выбранному поставщику", 400);
  }
  return expected;
}
