const MIDJOURNEY_PRODUCT_SLUGS = new Set([
  "midjourney-basic-1",
  "midjourney-standard-1",
  "midjourney-pro-1",
]);

export function isMidjourneyProductSlug(value: unknown): boolean {
  return MIDJOURNEY_PRODUCT_SLUGS.has(String(value || "").trim().toLowerCase());
}

/** Checks the submitted URL's shape only; it cannot verify the Stripe merchant or session state. */
export function validateMidjourneyPaymentLink(value: unknown): string | null {
  const raw = String(value || "").trim();
  if (!raw || raw.length > 4096 || /\s/.test(raw)) return "Вставьте полную ссылку на оплату Midjourney.";
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
    !/^\/c\/pay\/cs_live_[A-Za-z0-9]+$/.test(url.pathname)
  ) {
    return "Нужна ссылка Stripe Checkout вида https://checkout.stripe.com/c/pay/cs_live_…";
  }
  return null;
}
