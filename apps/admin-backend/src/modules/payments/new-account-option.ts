import { AppError } from "../../common/errors/app-error";

const NEW_ACCOUNT_SURCHARGES: Record<string, number> = {
  chatgpt: 500,
  claude: 3000,
};

export function resolveNewAccountSurcharge(slug: unknown, currency: unknown, requested: unknown): number {
  if (requested !== true) return 0;
  const productSlug = String(slug || "").trim().toLowerCase();
  const service = productSlug.split("-")[0];
  const surcharge = NEW_ACCOUNT_SURCHARGES[service];
  if (!surcharge || (productSlug !== service && !productSlug.startsWith(`${service}-`)) ||
      String(currency || "").trim().toUpperCase() !== "RUB") {
    throw new AppError("New account option is not available for this product", 400);
  }
  return surcharge;
}
