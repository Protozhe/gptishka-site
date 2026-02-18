import { env } from "../../../config/env";
import { AppError } from "../../../common/errors/app-error";
import { PaymentProvider, PaymentCreateInput } from "../payment-provider";

type GatewayCreateResponse = {
  status_check?: boolean;
  data?: {
    id?: string | number;
    invoice_id?: string | number;
    payment_id?: string | number;
    url?: string;
    checkout_url?: string;
    payment_url?: string;
    status?: string;
  };
  paymentId?: string;
  payment_id?: string;
  id?: string;
  invoice_id?: string;
  checkoutUrl?: string;
  checkout_url?: string;
  paymentUrl?: string;
  payment_url?: string;
  status?: string;
};

export class GatewayProvider implements PaymentProvider {
  readonly code = "gateway";

  private buildUrl(pathname: string) {
    return new URL(pathname, env.PAYMENT_API_BASE_URL).toString();
  }

  async createPayment(input: PaymentCreateInput) {
    const apiKey = env.ENOT_API_KEY || env.PAYMENT_SECRET;
    const shopId = env.ENOT_SHOP_ID || env.PAYMENT_SHOP_ID;
    if (!apiKey || !shopId) {
      throw new AppError("Payment gateway is not configured", 500);
    }

    const successUrl = new URL(env.PAYMENT_SUCCESS_URL);
    successUrl.searchParams.set("order_id", input.orderId);
    const failUrl = new URL(env.PAYMENT_FAIL_URL);
    failUrl.searchParams.set("order_id", input.orderId);
    const redeemToken = typeof input.metadata?.redeemToken === "string" ? input.metadata.redeemToken.trim() : "";
    if (redeemToken) {
      successUrl.searchParams.set("t", redeemToken);
      failUrl.searchParams.set("t", redeemToken);
    }

    const customFields = { ...(input.metadata || {}) } as any;
    // Do not store link secrets in payment provider metadata.
    delete customFields.redeemToken;

    const payload = {
      shop_id: shopId,
      order_id: String(input.orderId),
      amount: Number(input.amount.toFixed(2)),
      currency: String(input.currency || "RUB").toUpperCase(),
      email: String(input.metadata?.email || "").trim() || undefined,
      custom_fields: customFields,
      success_url: successUrl.toString(),
      fail_url: failUrl.toString(),
      hook_url: env.PAYMENT_WEBHOOK_URL,
      description: input.description,
    };

    const response = await fetch(this.buildUrl(env.PAYMENT_CREATE_PATH), {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const details = (await response.text().catch(() => "")).trim();
      throw new AppError(`Payment create failed with status ${response.status}`, 502, details ? { details } : undefined);
    }

    const data = (await response.json()) as GatewayCreateResponse;
    if (data.status_check === false) {
      throw new AppError("Payment gateway rejected invoice create request", 502, data as any);
    }

    const nested = data.data || {};
    const paymentId = String(
      nested.id ||
        nested.invoice_id ||
        nested.payment_id ||
        data.paymentId ||
        data.payment_id ||
        data.invoice_id ||
        data.id ||
        ""
    ).trim();
    const checkoutUrl = String(
      nested.url || nested.checkout_url || nested.payment_url || data.checkoutUrl || data.checkout_url || data.paymentUrl || data.payment_url || ""
    ).trim();
    const status = String(nested.status || data.status || "processing").toLowerCase();

    if (!paymentId || !checkoutUrl) {
      throw new AppError("Payment gateway returned invalid create response", 502);
    }

    return {
      provider: this.code,
      paymentId,
      checkoutUrl,
      status: status === "failed" ? "failed" : "processing",
    } as const;
  }

  async refundPayment(paymentId: string, amount?: number) {
    const apiKey = env.ENOT_API_KEY || env.PAYMENT_SECRET;
    const shopId = env.ENOT_SHOP_ID || env.PAYMENT_SHOP_ID;
    if (!apiKey || !shopId) {
      throw new AppError("Payment gateway is not configured", 500);
    }

    const payload = {
      shop_id: shopId,
      invoice_id: paymentId,
      amount: amount ? Number(amount.toFixed(2)) : undefined,
    };
    const response = await fetch(this.buildUrl(env.PAYMENT_REFUND_PATH), {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      return { ok: false };
    }

    const json = (await response.json()) as {
      status_check?: boolean;
      data?: { id?: string; refund_id?: string };
      refundId?: string;
      refund_id?: string;
      id?: string;
    };
    if (json.status_check === false) {
      return { ok: false };
    }
    return {
      ok: true,
      providerRef: String(json.data?.id || json.data?.refund_id || json.refundId || json.refund_id || json.id || "").trim() || undefined,
    };
  }
}
