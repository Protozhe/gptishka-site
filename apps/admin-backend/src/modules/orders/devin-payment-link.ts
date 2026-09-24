const DEVIN_SLUG = /^devin-(pro|max|teams)-1$/;
const STRIPE_CHECKOUT_PATH = /^\/g\/pay\/cs_live_[A-Za-z0-9]+$/;

export function isDevinProductSlug(value: unknown): boolean {
  return DEVIN_SLUG.test(String(value || "").trim().toLowerCase());
}

export function validateDevinPaymentLink(value: unknown): string | null {
  const raw = String(value || "").trim();
  if (!raw || raw.length > 4096 || /\s/.test(raw)) {
    return "Вставьте полную ссылку Stripe Checkout длиной до 4096 символов.";
  }
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.hostname !== "checkout.stripe.com" ||
        url.username || url.password || url.port || !STRIPE_CHECKOUT_PATH.test(url.pathname)) {
      return "Нужна ссылка Stripe Checkout вида https://checkout.stripe.com/g/pay/cs_live_…";
    }
    return null;
  } catch {
    return "Нужна корректная HTTPS-ссылка Stripe Checkout.";
  }
}
