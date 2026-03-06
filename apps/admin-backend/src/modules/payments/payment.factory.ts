import { env } from "../../config/env";
import { AppError } from "../../common/errors/app-error";
import { PaymentProvider } from "./payment-provider";
import { StubProvider } from "./providers/stub.provider";
import { WebMoneyProvider } from "./providers/webmoney.provider";
import { StripeProvider } from "./providers/stripe.provider";
import { GatewayProvider } from "./providers/gateway.provider";
import { LavaProvider } from "./providers/lava.provider";

const providers: Record<string, PaymentProvider> = {
  gateway: new GatewayProvider(),
  lava: new LavaProvider(),
  stub: new StubProvider(),
  webmoney: new WebMoneyProvider(),
  stripe: new StripeProvider(),
};

const paymentMethodToProviderCode: Record<string, string> = {
  enot: "gateway",
  gateway: "gateway",
  lava: "lava",
  stripe: "stripe",
  webmoney: "webmoney",
  stub: "stub",
};

export function getPaymentProvider() {
  const provider = providers[env.PAYMENT_PROVIDER];
  if (!provider) {
    throw new AppError(`Unsupported payment provider: ${env.PAYMENT_PROVIDER}`, 500);
  }
  return provider;
}

export function getProviderByCode(code: string) {
  const provider = providers[code];
  if (!provider) {
    throw new AppError(`Payment provider not found: ${code}`, 400);
  }
  return provider;
}

export function resolveProviderCodeByPaymentMethod(paymentMethod?: string | null) {
  const raw = String(paymentMethod || "").trim().toLowerCase();
  if (!raw) return env.PAYMENT_PROVIDER;
  const mapped = paymentMethodToProviderCode[raw] || raw;
  if (!providers[mapped]) {
    throw new AppError(`Unsupported payment method: ${raw}`, 400);
  }
  return mapped;
}

export function normalizePaymentMethodCode(paymentMethod: string | null | undefined, providerCode: string) {
  const raw = String(paymentMethod || "").trim().toLowerCase();
  if (raw) return raw;
  if (providerCode === "gateway") return "enot";
  return providerCode;
}
