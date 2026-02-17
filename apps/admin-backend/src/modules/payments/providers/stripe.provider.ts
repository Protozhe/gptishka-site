import { PaymentProvider, PaymentCreateInput } from "../payment-provider";

export class StripeProvider implements PaymentProvider {
  readonly code = "stripe";

  async createPayment(input: PaymentCreateInput) {
    return {
      provider: this.code,
      paymentId: `stripe_${input.orderId}_${Date.now()}`,
      status: "processing" as const,
      checkoutUrl: "https://checkout.stripe.com/placeholder",
    };
  }

  async refundPayment(paymentId: string) {
    return { ok: true, providerRef: `stripe_refund_${paymentId}` };
  }
}
