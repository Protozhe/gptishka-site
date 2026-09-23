const SUNO_PRODUCT_SLUGS = new Set(["suno-pro-1-month", "suno-premier-1-month"]);

export function isSunoProductSlug(value: unknown): boolean {
  return SUNO_PRODUCT_SLUGS.has(String(value || "").trim().toLowerCase());
}

/** Existing Premier orders predate this flow and keep their original delivery route. */
export function isSunoPaymentLinkOrder(productSlug: unknown, orderDetails: unknown): boolean {
  if (!isSunoProductSlug(productSlug) || !orderDetails || typeof orderDetails !== "object" || Array.isArray(orderDetails)) return false;
  const selection = (orderDetails as Record<string, unknown>).selection;
  return Boolean(selection && typeof selection === "object" && !Array.isArray(selection) &&
    (selection as Record<string, unknown>).paymentLinkFlow === "suno-v1");
}

/** Shape check only: a manager must verify the merchant, selected plan and session. */
export function validateSunoPaymentLink(value: unknown): string | null {
  const raw = String(value || "").trim();
  if (!raw || raw.length > 4096 || /\s/.test(raw)) return "Вставьте полную ссылку на оплату Suno.";
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return "Ссылка на оплату имеет неверный формат.";
  }
  if (
    url.protocol !== "https:" ||
    url.hostname !== "checkout.stripe.com" ||
    url.username ||
    url.password ||
    url.port ||
    !/^\/g\/pay\/cs_live_[A-Za-z0-9]+$/.test(url.pathname)
  ) {
    return "Нужна ссылка Stripe Checkout вида https://checkout.stripe.com/g/pay/cs_live_…";
  }
  return null;
}
