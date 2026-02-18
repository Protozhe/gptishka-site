import { PaymentProvider, PaymentCreateInput } from "../payment-provider";
import { env } from "../../../config/env";

export class StubProvider implements PaymentProvider {
  readonly code = "stub";

  async createPayment(input: PaymentCreateInput) {
    const successUrl = new URL(env.PAYMENT_SUCCESS_URL);
    successUrl.searchParams.set("order_id", input.orderId);
    const redeemToken = typeof input.metadata?.redeemToken === "string" ? input.metadata.redeemToken.trim() : "";
    if (redeemToken) successUrl.searchParams.set("t", redeemToken);
    successUrl.searchParams.set("mock", "1");
    return {
      provider: this.code,
      paymentId: `stub_${input.orderId}_${Date.now()}`,
      status: "success" as const,
      checkoutUrl: successUrl.toString(),
    };
  }

  async refundPayment(paymentId: string) {
    return { ok: true, providerRef: `refund_${paymentId}` };
  }
}
