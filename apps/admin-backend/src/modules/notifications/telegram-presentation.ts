// Only Telegram's supported HTML tags are emitted. All external text is escaped
// before being placed in a card; callers must never pass customer HTML through.
export function telegramText(value: unknown, limit = 500) {
  const text = String(value ?? "").replace(/\r/g, "");
  const bounded = text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
  return bounded.replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

export function telegramCard(title: string, sections: string[]) {
  return [`<b>${telegramText(title, 160)}</b>`, ...sections.filter(section => section.trim())].join("\n\n");
}

export function paidManagerCard(order: { id: string; email: string; totalAmount: unknown; currency: string }, activationUrl: string) {
  const amount = Number(order.totalAmount).toLocaleString("ru-RU", { maximumFractionDigits: 2 });
  return telegramCard("✅ Оплата подтверждена", [
    `🧾 <b>Заказ</b>\n<code>${telegramText(order.id, 100)}</code>\n👤 Клиент: ${telegramText(order.email, 254)}`,
    `💰 Сумма: <b>${telegramText(amount)} ${telegramText(order.currency, 10)}</b>\nСтатус: <b>Оплачен</b>`,
    `🔗 <b>Активация</b>\n<a href="${telegramText(activationUrl, 2000)}">Резервная ссылка для клиента</a>`,
  ]);
}

export function activationReviewCard(review: { rating: number; productTitle: string; orderId: string; text: string }, status: "pending" | "approved" | "rejected" = "pending") {
  const title = { pending: "⭐ Новый отзыв", approved: "✅ Отзыв опубликован", rejected: "❌ Отзыв отклонён" }[status];
  const label = { pending: "Ожидает модерации", approved: "Одобрен", rejected: "Отклонён" }[status];
  const rating = Math.max(1, Math.min(5, Number(review.rating) || 1));
  return telegramCard(title, [
    `Статус: <b>${label}</b>\n${"★".repeat(rating)}${"☆".repeat(5 - rating)} · <b>${rating} из 5</b>`,
    `🛍 Товар: <b>${telegramText(review.productTitle, 180)}</b>\n🧾 Заказ: <code>${telegramText(review.orderId, 100)}</code>`,
    `<b>Комментарий</b>\n<blockquote>${telegramText(review.text || "Без комментария", 1000)}</blockquote>`,
  ]);
}

export function botAdminEventCard(title: string, lines: string[]) {
  const context: string[] = [], order: string[] = [], details: string[] = [];
  let remaining = 3000;
  for (const line of lines.filter(line => line.trim()).slice(0, 12)) {
    if (remaining <= 0) break;
    const boundedLine = line.slice(0, remaining);
    remaining -= boundedLine.length;
    const match = /^([^:\n]{1,40}):\s*([\s\S]*)$/.exec(boundedLine);
    if (!match) { details.push(telegramText(boundedLine, 200)); continue; }
    const key = match[1], value = match[2];
    if (["Бот", "Пользователь"].includes(key)) {
      context.push(`${key === "Бот" ? "🤖 Бот" : "👤 Клиент"}: ${telegramText(value, 180)}`);
    } else if (["Order", "Заказ", "Промокод", "Сумма", "Скидка", "К оплате"].includes(key)) {
      const isCode = ["Order", "Заказ", "Промокод"].includes(key);
      const tag = isCode ? "code" : "b";
      order.push(`${key === "Order" ? "🧾 Заказ" : telegramText(key)}: <${tag}>${telegramText(value, 180)}</${tag}>`);
    } else if (["Текст", "Ошибка", "Результат"].includes(key)) {
      details.push(`<b>${telegramText(key)}</b>\n<blockquote>${telegramText(value, 500)}</blockquote>`);
    } else {
      details.push(`${telegramText(key)}: ${telegramText(value, 180)}`);
    }
  }
  return telegramCard(title, [context.join("\n"), order.join("\n"), details.join("\n")]);
}
