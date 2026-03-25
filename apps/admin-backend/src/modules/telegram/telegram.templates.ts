export type TelegramReminderType = "7d" | "3d" | "1d" | "expired";

export function buildTelegramReminderText(input: {
  type: TelegramReminderType;
  planName: string;
  expiresAt: Date;
  renewUrl: string;
}) {
  const planName = String(input.planName || "VPN").trim() || "VPN";
  const renewUrl = String(input.renewUrl || "").trim();
  const expiresAtLabel = new Date(input.expiresAt).toLocaleDateString("ru-RU", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  if (input.type === "7d") {
    return [
      "Напоминание: до окончания вашей подписки осталось 7 дней.",
      `Тариф: ${planName}`,
      `Дата окончания: ${expiresAtLabel}`,
      `Продлить доступ: ${renewUrl}`,
    ].join("\n");
  }

  if (input.type === "3d") {
    return [
      "До окончания подписки осталось 3 дня.",
      `Тариф: ${planName}`,
      `Дата окончания: ${expiresAtLabel}`,
      "Чтобы не потерять доступ, продлите подписку заранее:",
      renewUrl,
    ].join("\n");
  }

  if (input.type === "1d") {
    return [
      "Подписка заканчивается завтра.",
      `Тариф: ${planName}`,
      `Дата окончания: ${expiresAtLabel}`,
      `Продлить: ${renewUrl}`,
    ].join("\n");
  }

  return [
    "Срок вашей подписки истек.",
    `Тариф: ${planName}`,
    "Чтобы восстановить доступ, продлите подписку:",
    renewUrl,
  ].join("\n");
}

