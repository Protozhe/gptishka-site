type UnknownRecord = Record<string, unknown>;

export type TelegramOrderContext = {
  source: "telegram";
  botType?: "claude" | "chatgpt" | "grok";
  telegramUserId: string;
  telegramChatId: string;
  telegramUsername: string | null;
};

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as UnknownRecord) : {};
}

function normalizeTelegramId(value: unknown) {
  const normalized = String(value || "").trim();
  return /^-?\d+$/.test(normalized) ? normalized : "";
}

function normalizeTelegramUsername(value: unknown) {
  const normalized = String(value || "").trim().replace(/^@+/, "");
  return /^[a-z0-9_]{5,32}$/i.test(normalized) ? normalized : null;
}

export function resolveTelegramOrderContext(input: {
  email?: unknown;
  orderDetails?: unknown;
}): TelegramOrderContext | null {
  const emailMatch = String(input.email || "")
    .trim()
    .toLowerCase()
    .match(/^tg_(claude|chatgpt|grok)_(-?\d+)@(?:gptishka\.)?telegram\.local$/);
  const contact = asRecord(asRecord(input.orderDetails).contact);
  const telegramUserId = normalizeTelegramId(contact.telegramUserId || contact.telegramId || emailMatch?.[2]);

  if (!telegramUserId) return null;

  return {
    source: "telegram",
    ...(emailMatch?.[1] ? { botType: emailMatch[1] as NonNullable<TelegramOrderContext["botType"]> } : {}),
    telegramUserId,
    telegramChatId: normalizeTelegramId(contact.telegramChatId) || telegramUserId,
    telegramUsername: normalizeTelegramUsername(contact.telegramUsername),
  };
}
