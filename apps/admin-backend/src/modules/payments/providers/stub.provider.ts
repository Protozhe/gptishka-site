import { PaymentProvider, PaymentCreateInput } from "../payment-provider";
import { buildPaymentReturnUrls } from "../payment-return-url";

export class StubProvider implements PaymentProvider {
  readonly code = "stub";

  async createPayment(input: PaymentCreateInput) {
    const { successUrl } = buildPaymentReturnUrls(input);
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
