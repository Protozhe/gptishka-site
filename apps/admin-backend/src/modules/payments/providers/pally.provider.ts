import { env } from "../../../config/env";
import { AppError } from "../../../common/errors/app-error";
import { PaymentCreateInput, PaymentProvider } from "../payment-provider";
import { buildPaymentReturnUrls } from "../payment-return-url";

export function buildPallyCreateBody(input: PaymentCreateInput, shopId: string) {
  if (!input.orderData) throw new AppError("Pally order data is missing", 422);
  const { successUrl, failUrl } = buildPaymentReturnUrls(input);
  const form = new URLSearchParams({
    amount: input.amount.toFixed(2),
    shop_id: shopId,
    order_id: input.orderId,
    description: input.description,
    name: input.orderData.name,
    type: "normal",
    currency_in: String(input.currency).toUpperCase(),
    payer_email: input.orderData.payer_email,
    "payer_data[email]": input.orderData.payer_email,
    success_url: successUrl.toString(),
    fail_url: failUrl.toString(),
  });
  input.orderData.items.forEach((item, index) => {
    const prefix = `items[${index}]`;
    form.set(`${prefix}[name]`, item.name);
    form.set(`${prefix}[price]`, item.price);
    form.set(`${prefix}[quantity]`, item.quantity);
    form.set(`${prefix}[category]`, item.category);
    Object.entries(item.extra || {}).forEach(([key, value]) => {
      if (value) form.set(`${prefix}[extra][${key}]`, value);
    });
  });
  return form;
}

export class PallyProvider implements PaymentProvider {
  readonly code = "pally";

  async createPayment(input: PaymentCreateInput) {
    const token = env.PALLY_API_TOKEN;
    const shopId = env.PALLY_SHOP_ID;
    if (!token || !shopId) throw new AppError("Pally is not configured", 503);

    let response: Response;
    try {
      response = await fetch(new URL("/api/v1/bill/create", env.PALLY_API_BASE_URL).toString(), {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Bearer ${token}`,
        },
        body: buildPallyCreateBody(input, shopId),
        signal: AbortSignal.timeout(10000),
      });
    } catch (error) {
      console.warn(
        `[payments] Pally request failed order=${input.orderId} reason=${
          error instanceof Error ? error.message : "unknown"
        }`
      );
      throw new AppError("Pally is temporarily unavailable", 502);
    }
    if (!response.ok) {
      const details = (await response.text().catch(() => "")).trim().slice(0, 500);
      console.warn(
        `[payments] Pally rejected bill order=${input.orderId} status=${response.status}` +
          (details ? ` response=${details}` : "")
      );
      throw new AppError(`Pally bill create failed with status ${response.status}`, 502);
    }
    const result = (await response.json()) as {
      success?: boolean | string;
      bill_id?: string;
      link_page_url?: string;
    };
    const paymentId = String(result.bill_id || "").trim();
    const checkoutUrl = String(result.link_page_url || "").trim();
    if ((result.success !== true && result.success !== "true") || !paymentId || !checkoutUrl) {
      throw new AppError("Pally returned an invalid bill", 502);
    }
    const url = new URL(checkoutUrl);
    if (url.protocol !== "https:") throw new AppError("Pally returned an invalid payment URL", 502);
    return { provider: this.code, paymentId, checkoutUrl, status: "processing" } as const;
  }

  async refundPayment(_paymentId: string, _amount?: number): Promise<{ ok: boolean; providerRef?: string }> {
    throw new AppError("Pally refunds are not configured", 503);
  }
}
