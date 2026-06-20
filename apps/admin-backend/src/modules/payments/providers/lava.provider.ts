import crypto from "crypto";
import { env } from "../../../config/env";
import { AppError } from "../../../common/errors/app-error";
import { PaymentProvider, PaymentCreateInput } from "../payment-provider";
import { resolveLavaCredentials } from "../lava.credentials";
import { buildPaymentReturnUrls } from "../payment-return-url";

type LavaCreateResponse = {
  status_check?: boolean;
  data?: {
    id?: string | number;
    invoiceId?: string | number;
    invoice_id?: string | number;
    orderId?: string;
    order_id?: string;
    url?: string;
    payUrl?: string;
    payment_url?: string;
    status?: string;
  };
  id?: string | number;
  invoiceId?: string | number;
  invoice_id?: string | number;
  url?: string;
  payUrl?: string;
  payment_url?: string;
  status?: string;
  message?: string;
};

function signLavaPayload(payload: unknown, secret: string) {
  return crypto.createHmac("sha256", secret).update(JSON.stringify(payload), "utf8").digest("hex");
}

export class LavaProvider implements PaymentProvider {
  readonly code = "lava";

  private buildUrl(pathname: string) {
    return new URL(pathname, env.LAVA_API_BASE_URL).toString();
  }

  async createPayment(input: PaymentCreateInput) {
    const credentials = resolveLavaCredentials({ botType: input.metadata?.botType });
    if (!credentials) {
      throw new AppError("Lava payment gateway is not configured", 500);
    }

    const { successUrl, failUrl } = buildPaymentReturnUrls(input);

    const payload = {
      shopId: credentials.shopId,
      sum: Number(input.amount.toFixed(2)),
      orderId: String(input.orderId),
      hookUrl: env.LAVA_WEBHOOK_URL,
      successUrl: successUrl.toString(),
      failUrl: failUrl.toString(),
      expire: 60 * 30,
      comment: String(input.description || "").trim().slice(0, 240) || undefined,
    };
    const signature = signLavaPayload(payload, credentials.secretKey);

    const response = await fetch(this.buildUrl(env.LAVA_CREATE_PATH), {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Signature: signature,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const details = (await response.text().catch(() => "")).trim();
      throw new AppError(`Lava payment create failed with status ${response.status}`, 502, details ? { details } : undefined);
    }

    const data = (await response.json()) as LavaCreateResponse;
    if (data.status_check === false) {
      throw new AppError("Lava gateway rejected invoice create request", 502, data as any);
    }

    const nested = data.data || {};
    const paymentId = String(nested.id || nested.invoiceId || nested.invoice_id || data.id || data.invoiceId || data.invoice_id || "").trim();
    const checkoutUrl = String(nested.url || nested.payUrl || nested.payment_url || data.url || data.payUrl || data.payment_url || "").trim();
    const statusRaw = String(nested.status || data.status || "").toLowerCase();

    if (!paymentId || !checkoutUrl) {
      throw new AppError("Lava gateway returned invalid create response", 502);
    }

    const status = ["success", "succeeded", "paid", "completed"].includes(statusRaw)
      ? "success"
      : ["failed", "error", "cancelled", "canceled", "expired", "rejected"].includes(statusRaw)
      ? "failed"
      : "processing";

    return {
      provider: this.code,
      paymentId,
      checkoutUrl,
      status,
    } as const;
  }

  async refundPayment(_paymentId: string, _amount?: number) {
    // Lava refund flow is account-side and not enabled in this project.
    return { ok: false };
  }
}
