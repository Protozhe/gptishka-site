import { env } from "../../config/env";
import { AppError } from "../../common/errors/app-error";
import { PaymentProvider } from "./payment-provider";
import { StubProvider } from "./providers/stub.provider";
import { WebMoneyProvider } from "./providers/webmoney.provider";
import { StripeProvider } from "./providers/stripe.provider";
import { GatewayProvider } from "./providers/gateway.provider";

const providers: Record<string, PaymentProvider> = {
  gateway: new GatewayProvider(),
  stub: new StubProvider(),
  webmoney: new WebMoneyProvider(),
  stripe: new StripeProvider(),
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
