import { Currency } from "@prisma/client";
import { env } from "../../config/env";

const RUB_RATES: Record<Currency, number> = {
  RUB: 1,
  USD: env.FX_USD_RUB,
  EUR: env.FX_EUR_RUB,
  USDT: env.FX_USDT_RUB,
};

export function toRub(amount: number, currency: Currency): number {
  const rate = RUB_RATES[currency] || 1;
  return Number((amount * rate).toFixed(2));
}
