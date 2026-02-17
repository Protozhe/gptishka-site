import { PaymentProvider, PaymentCreateInput } from "../payment-provider";
import { env } from "../../../config/env";

export class WebMoneyProvider implements PaymentProvider {
  readonly code = "webmoney";

  async createPayment(input: PaymentCreateInput) {
    const base = new URL(env.PAYMENT_SUCCESS_URL);
    const checkout = new URL("/payment/webmoney/pay.php", `${base.protocol}//${base.host}`);
    checkout.searchParams.set("order_id", input.orderId);
    checkout.searchParams.set("amount", String(input.amount));
    checkout.searchParams.set("description", input.description);

    return {
      provider: this.code,
      paymentId: `wm_${input.orderId}_${Date.now()}`,
      status: "processing" as const,
      checkoutUrl: checkout.toString(),
    };
  }

  async refundPayment(paymentId: string) {
    return { ok: true, providerRef: `wm_refund_${paymentId}` };
  }
}
