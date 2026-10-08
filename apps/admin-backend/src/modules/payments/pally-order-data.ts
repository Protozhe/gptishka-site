import { AppError } from "../../common/errors/app-error";
import { PaymentCreateInput } from "./payment-provider";

type Details = Record<string, any> | null;

function value(input: unknown): string {
  return typeof input === "string" ? input.trim() : "";
}

function money(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function buildPallyOrderData(input: {
  title: string;
  slug: string;
  category: string;
  quantity: number;
  amount: number;
  email: string;
  orderDetails: Details;
  telegramUsername?: string | null;
  telegramUserId?: string | null;
}): NonNullable<PaymentCreateInput["orderData"]> {
  const payerEmail = value(input.email).toLowerCase();
  if (!payerEmail || /@(?:telegram|example)\.local$/i.test(payerEmail)) {
    throw new AppError("A real buyer email is required for Pally", 422);
  }

  const details = input.orderDetails;
  const isSteam = ["steam-mannco-key", "steam-login"].includes(input.slug) || input.category.toLowerCase() === "steam";
  const rawCategory = value(input.category);
  const service = value(input.slug).toLowerCase().split("-")[0].replace(/[^a-z0-9]/g, "") || "other";
  const category = isSteam
    ? "steam"
    : /^digital\//i.test(rawCategory)
      ? rawCategory
      : `digital/${/пополн|top.?up/i.test(rawCategory) ? "topup" : "subscription"}/${service}`;
  const extra: Record<string, string> = {};
  if (isSteam) {
    const steamAccount = value(details?.steam?.account || details?.selection?.steamAccount);
    if (!steamAccount) throw new AppError("Steam account is required for Pally", 422);
    extra.steam_account = steamAccount;
  } else {
    const targetAccount = value(details?.gift?.recipientContact || details?.targetAccount || payerEmail);
    if (targetAccount) extra.account = targetAccount;
  }
  const telegram = value(input.telegramUsername || details?.contact?.telegram).replace(/^@+/, "");
  if (telegram) extra.telegram_username = telegram;
  const telegramId = value(input.telegramUserId);
  if (telegramId) extra.telegram_id = telegramId;

  const quantity = Math.max(1, Math.trunc(input.quantity));
  const amountCents = Math.round(input.amount * 100);
  if (!Number.isSafeInteger(amountCents) || amountCents < quantity) {
    throw new AppError("Invalid Pally order amount", 422);
  }
  const unitCents = Math.floor(amountCents / quantity);
  const remainder = amountCents % quantity;
  const itemName = value(input.title) || "Digital product";
  const item = (priceCents: number, count: number) => ({
    name: itemName,
    price: money(priceCents),
    quantity: String(count),
    category,
    ...(Object.keys(extra).length ? { extra } : {}),
  });
  const items = remainder
    ? [
        ...(quantity > remainder ? [item(unitCents, quantity - remainder)] : []),
        item(unitCents + 1, remainder),
      ]
    : [item(unitCents, quantity)];
  return {
    name: itemName,
    type: "normal",
    payer_email: payerEmail,
    items,
  };
}
