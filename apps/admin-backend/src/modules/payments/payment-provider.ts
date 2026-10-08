import { Currency } from "@prisma/client";

export type PaymentCreateInput = {
  orderId: string;
  amount: number;
  currency: Currency;
  description: string;
  metadata?: Record<string, unknown>;
  orderData?: {
    name: string;
    type: "normal";
    payer_email: string;
    items: Array<{ name: string; price: string; quantity: string; category: string; extra?: Record<string, string> }>;
  };
};

export type PaymentCreateResult = {
  provider: string;
  paymentId: string;
  checkoutUrl?: string;
  status: "initiated" | "processing" | "success" | "failed";
};

export interface PaymentProvider {
  readonly code: string;
  createPayment(input: PaymentCreateInput): Promise<PaymentCreateResult>;
  refundPayment(paymentId: string, amount?: number): Promise<{ ok: boolean; providerRef?: string }>;
}
