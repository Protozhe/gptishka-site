export type TelegramOrderSummary = {
  id: string;
  status: string;
  productTitle?: string | null;
  amount?: number | null;
  currency?: string | null;
  promoCode?: string | null;
  deliveryType?: string | null;
  activationStatus?: string | null;
  createdAt?: Date | string | null;
  paidAt?: Date | string | null;
};

export type TelegramActivationPayload = {
  deliveryMode?: string | null;
  status?: string | null;
  message?: string | null;
  accessLink?: string | null;
  deeplinkUrl?: string | null;
  subscriptionConfig?: unknown;
  expiresAt?: Date | string | null;
  plan?: string | null;
  supportUrl?: string | null;
  supportEmail?: string | null;
  credentials?: { login?: string | null; password?: string | null } | null;
  activationFlow?: string | null;
  verificationState?: string | null;
  lastProviderMessage?: string | null;
};

const PAID_STATUSES = new Set(["paid", "completed", "activated", "fulfilled", "delivered"]);

const STATUS_LABELS: Record<string, string> = {
  new: "новый",
  pending: "ожидает оплаты",
  waiting_payment: "ожидает оплаты",
  awaiting_payment: "ожидает оплаты",
  paid: "оплачен",
  completed: "выполнен",
  activated: "активирован",
  fulfilled: "выполнен",
  delivered: "доставлен",
  cancelled: "отменён",
  canceled: "отменён",
  failed: "ошибка",
  refunded: "возврат",
};

const DELIVERY_LABELS: Record<string, string> = {
  vpn: "VPN",
  credentials: "логин и пароль",
  manual_login: "ручная обработка менеджером",
  token: "активация по токену",
  support: "через поддержку",
};

function clean(value: string | null | undefined): string {
  return String(value ?? "").trim();
}

function isPaidOrder(order: TelegramOrderSummary): boolean {
  return PAID_STATUSES.has(clean(order.status).toLowerCase());
}

function labelStatus(status: string | null | undefined): string {
  const normalized = clean(status).toLowerCase();
  return (STATUS_LABELS[normalized] ?? clean(status)) || "неизвестен";
}

function labelDelivery(type: string | null | undefined): string {
  const normalized = clean(type).toLowerCase();
  return DELIVERY_LABELS[normalized] ?? clean(type);
}

function formatDate(value: Date | string | null | undefined): string {
  if (!value) {
    return "";
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return clean(String(value));
  }

  return date.toLocaleString("ru-RU", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatMoney(amount: number | null | undefined, currency: string | null | undefined): string {
  const currencyLabel = clean(currency);

  if (typeof amount !== "number" || !Number.isFinite(amount)) {
    return currencyLabel;
  }

  const amountLabel = Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
  return clean(`${amountLabel} ${currencyLabel}`);
}

function formatProductTitle(order: TelegramOrderSummary): string {
  return clean(order.productTitle) || "Покупка GPTishka";
}

function pushIfPresent(lines: string[], label: string, value: string | null | undefined) {
  const text = clean(value);
  if (text) {
    lines.push(`${label}: ${text}`);
  }
}

function formatSubscriptionConfig(config: unknown): string {
  if (typeof config === "string") {
    return clean(config);
  }

  if (config && typeof config === "object") {
    const candidate = config as {
      accessLink?: unknown;
      vless?: unknown;
      url?: unknown;
      link?: unknown;
      config?: unknown;
    };

    for (const value of [candidate.accessLink, candidate.vless, candidate.url, candidate.link, candidate.config]) {
      if (typeof value === "string" && clean(value)) {
        return clean(value);
      }
    }
  }

  return "";
}

export function buildTelegramOrdersText(orders: TelegramOrderSummary[]): string {
  if (orders.length === 0) {
    return [
      "Мои покупки GPTishka",
      "",
      "У вас покупок пока нет в Telegram-кабинете.",
      "Если вы уже оплатили заказ на сайте, откройте Telegram-ссылку из страницы успешной оплаты или письма с заказом.",
      "После привязки покупка появится здесь.",
    ].join("\n");
  }

  const lines = ["Мои покупки GPTishka", ""];

  orders.forEach((order, index) => {
    const dateLabel = formatDate(order.paidAt) || formatDate(order.createdAt);
    const dateTitle = order.paidAt ? "Оплачен" : "Создан";
    const amount = formatMoney(order.amount, order.currency);

    lines.push(`${index + 1}. ${formatProductTitle(order)}`);
    lines.push(`Заказ: ${order.id}`);
    lines.push(`Статус: ${labelStatus(order.status)}`);
    pushIfPresent(lines, "Сумма", amount);
    pushIfPresent(lines, "Промокод", order.promoCode);
    pushIfPresent(lines, "Доставка", labelDelivery(order.deliveryType));
    pushIfPresent(lines, "Активация", labelStatus(order.activationStatus));
    pushIfPresent(lines, dateTitle, dateLabel);

    if (isPaidOrder(order)) {
      lines.push(`Проверить доступ: /check ${order.id}`);
    }

    if (index < orders.length - 1) {
      lines.push("");
    }
  });

  return lines.join("\n");
}

export function buildTelegramLinkedOrderText(order: TelegramOrderSummary): string {
  const lines = [
    "Заказ привязан к вашему Telegram-кабинету.",
    `Покупка: ${formatProductTitle(order)}`,
    `Заказ: ${order.id}`,
    `Статус: ${labelStatus(order.status)}`,
  ];

  if (isPaidOrder(order)) {
    lines.push(`Чтобы проверить доступ, используйте /check ${order.id}`);
  } else {
    lines.push("Заказ ещё не оплачен. После оплаты доступ появится в разделе /orders.");
  }

  return lines.join("\n");
}

export function buildTelegramOrderDetailsText(input: {
  order: TelegramOrderSummary;
  activation?: TelegramActivationPayload | null;
}): string {
  const { order, activation } = input;
  const baseLines = [
    `Покупка: ${formatProductTitle(order)}`,
    `Заказ: ${order.id}`,
    `Статус заказа: ${labelStatus(order.status)}`,
  ];

  if (!isPaidOrder(order)) {
    return [
      ...baseLines,
      "",
      "Заказ пока не оплачен.",
      "После оплаты откройте Telegram-ссылку с сайта или проверьте покупку командой /orders.",
    ].join("\n");
  }

  const deliveryMode = clean(activation?.deliveryMode).toLowerCase();
  const activationFlow = clean(activation?.activationFlow).toLowerCase();

  if (deliveryMode === "vpn") {
    const lines = [...baseLines, "", "Данные VPN-доступа:"];
    pushIfPresent(lines, "План", activation?.plan);
    pushIfPresent(lines, "Действует до", formatDate(activation?.expiresAt));
    pushIfPresent(
      lines,
      "VLESS/accessLink",
      clean(activation?.accessLink) || formatSubscriptionConfig(activation?.subscriptionConfig)
    );
    pushIfPresent(lines, "Deeplink", activation?.deeplinkUrl);
    pushIfPresent(lines, "Сообщение", activation?.message);
    lines.push("");
    lines.push(`Если ссылка потерялась, откройте /orders или используйте /check ${order.id}.`);
    return lines.join("\n");
  }

  if (deliveryMode === "credentials") {
    const lines = [...baseLines, "", "Данные для входа:"];
    pushIfPresent(lines, "Логин", activation?.credentials?.login);
    pushIfPresent(lines, "Пароль", activation?.credentials?.password);
    pushIfPresent(lines, "Сообщение", activation?.message);
    lines.push("");
    lines.push(`Если данные не подходят, проверьте заказ через /check ${order.id} или напишите в поддержку.`);
    return lines.join("\n");
  }

  if (deliveryMode === "manual_login") {
    const lines = [
      ...baseLines,
      "",
      "Заказ оплачен. Менеджер обработает доступ вручную и свяжется с вами.",
    ];
    pushIfPresent(lines, "Статус активации", labelStatus(activation?.status));
    pushIfPresent(lines, "Сообщение", activation?.message);
    return lines.join("\n");
  }

  const lines = [...baseLines, "", "Для завершения активации может понадобиться токен входа."];
  pushIfPresent(lines, "Статус активации", labelStatus(activation?.status));
  pushIfPresent(lines, "Проверка", activation?.verificationState);
  pushIfPresent(lines, "Сообщение провайдера", activation?.lastProviderMessage);
  pushIfPresent(lines, "Сообщение", activation?.message);
  pushIfPresent(lines, "Поддержка", activation?.supportUrl);
  pushIfPresent(lines, "Email поддержки", activation?.supportEmail);

  if (activationFlow === "support") {
    lines.push("Если токен не появится, обратитесь в поддержку и укажите номер заказа.");
  }

  lines.push(`Отправьте токен командой: /token ${order.id} <токен>`);
  return lines.join("\n");
}
