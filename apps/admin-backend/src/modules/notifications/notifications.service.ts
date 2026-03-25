import nodemailer from "nodemailer";
import { env } from "../../config/env";

function getTransporter() {
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASSWORD) {
    return null;
  }

  return nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASSWORD,
    },
  });
}

export function getEmailTransportStatus() {
  const host = String(env.SMTP_HOST || "").trim();
  const user = String(env.SMTP_USER || "").trim();
  const password = String(env.SMTP_PASSWORD || "").trim();
  const fromAddress = resolveFromAddress();

  return {
    configured: Boolean(host && user && password),
    host,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    from: fromAddress,
    hasUser: Boolean(user),
    hasPassword: Boolean(password),
  };
}

export async function sendAdminTestEmail(to: string, context?: { requestedBy?: string | null }) {
  const transporter = getTransporter();
  if (!transporter) {
    return { sent: false as const, reason: "smtp_not_configured" as const };
  }

  const fromAddress = resolveFromAddress();
  const nowLabel = new Date().toLocaleString("ru-RU");
  const safeTo = String(to || "").trim().toLowerCase();
  const safeRequestedBy = String(context?.requestedBy || "").trim() || "admin";

  try {
    await transporter.sendMail({
      from: fromAddress,
      to: safeTo,
      subject: "GPTishka: тестовое письмо",
      text: [
        "Это тестовое письмо из админ-панели GPTishka.",
        "",
        `Время отправки: ${nowLabel}`,
        `Получатель: ${safeTo}`,
        `Инициатор: ${safeRequestedBy}`,
      ].join("\n"),
      html: `
        <div style="font-family: Arial, sans-serif; color:#1f2937; line-height:1.5;">
          <h2 style="margin:0 0 12px;">Тестовое письмо GPTishka</h2>
          <p style="margin:0 0 8px;">Это проверка отправки почты из админ-панели.</p>
          <p style="margin:0 0 6px;"><strong>Время:</strong> ${escapeHtml(nowLabel)}</p>
          <p style="margin:0 0 6px;"><strong>Получатель:</strong> ${escapeHtml(safeTo)}</p>
          <p style="margin:0;"><strong>Инициатор:</strong> ${escapeHtml(safeRequestedBy)}</p>
        </div>
      `,
    });

    return { sent: true as const };
  } catch (error) {
    return {
      sent: false as const,
      reason: "smtp_send_failed" as const,
      error: String((error as Error)?.message || "smtp_send_failed"),
    };
  }
}

export async function sendOrderPaidEmail(
  to: string,
  payload: { orderId: string; amount: number; currency: string }
) {
  const transporter = getTransporter();
  if (!transporter) {
    console.warn("SMTP not configured. Skip email:", to, payload);
    return;
  }

  const siteOrigin = resolveSiteOrigin();
  // Activation access is protected by a link secret. For emails, the storefront success redirect includes it.
  // If SMTP is enabled, this URL will still work for legacy orders without a secret.
  const activationUrl = `${siteOrigin}/redeem-start.html?order_id=${encodeURIComponent(payload.orderId)}`;
  const successUrl = `${siteOrigin}/success.html?order_id=${encodeURIComponent(payload.orderId)}`;
  const supportEmail = "support@gptishka.shop";
  const fromAddress = resolveFromAddress();
  const amountLabel = `${Number(payload.amount).toLocaleString("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${payload.currency}`;

  await transporter.sendMail({
    from: fromAddress,
    to,
    subject: `Оплата подтверждена — заказ ${payload.orderId}`,
    text: [
      `Оплата подтверждена.`,
      ``,
      `Заказ: ${payload.orderId}`,
      `Сумма: ${amountLabel}`,
      ``,
      `Перейти к активации: ${activationUrl}`,
      `Проверка статуса оплаты: ${successUrl}`,
      ``,
      `Если возникнут вопросы: ${supportEmail}`,
    ].join("\n"),
    html: `
      <div style="font-family: Arial, sans-serif; color:#1f2937; line-height:1.5;">
        <h2 style="margin:0 0 12px;">Оплата подтверждена</h2>
        <p style="margin:0 0 12px;">Спасибо за покупку в GPTишка.</p>
        <p style="margin:0 0 6px;"><strong>Заказ:</strong> ${escapeHtml(payload.orderId)}</p>
        <p style="margin:0 0 16px;"><strong>Сумма:</strong> ${escapeHtml(amountLabel)}</p>
        <p style="margin:0 0 14px;">
          <a href="${escapeHtml(activationUrl)}" style="display:inline-block; background:#1a8f7b; color:#ffffff; text-decoration:none; padding:10px 14px; border-radius:8px;">
            Перейти к вводу токена и активации
          </a>
        </p>
        <p style="margin:0 0 8px;">Если кнопка не открывается, используйте ссылку:</p>
        <p style="margin:0 0 12px;"><a href="${escapeHtml(activationUrl)}">${escapeHtml(activationUrl)}</a></p>
        <p style="margin:0 0 8px;">Проверка статуса оплаты:</p>
        <p style="margin:0 0 12px;"><a href="${escapeHtml(successUrl)}">${escapeHtml(successUrl)}</a></p>
        <p style="margin:0;">Поддержка: <a href="mailto:${supportEmail}">${supportEmail}</a></p>
      </div>
    `,
  });
}

export async function sendCustomerMagicLinkEmail(
  to: string,
  payload: { magicUrl: string; expiresAt: Date; nextPath?: string }
) {
  const transporter = getTransporter();
  if (!transporter) {
    console.warn("SMTP not configured. Skip account magic-link email:", to);
    return false;
  }

  const fromAddress = resolveFromAddress();
  const expiresAtLabel = new Date(payload.expiresAt).toLocaleString("ru-RU");
  const supportEmail = "support@gptishka.shop";
  const safeMagicUrl = String(payload.magicUrl || "").trim();
  const safeNextPath = String(payload.nextPath || "").trim() || "/account.html";

  await transporter.sendMail({
    from: fromAddress,
    to,
    subject: "Вход в личный кабинет GPTishka",
    text: [
      "Ссылка для входа в личный кабинет:",
      safeMagicUrl,
      "",
      `Ссылка действует до: ${expiresAtLabel}`,
      `После входа вы попадете на: ${safeNextPath}`,
      "",
      `Если это были не вы, просто проигнорируйте письмо.`,
      `Поддержка: ${supportEmail}`,
    ].join("\n"),
    html: `
      <div style="font-family: Arial, sans-serif; color:#1f2937; line-height:1.5;">
        <h2 style="margin:0 0 12px;">Вход в личный кабинет</h2>
        <p style="margin:0 0 12px;">
          Нажмите на кнопку ниже, чтобы войти в кабинет и посмотреть статус подписки и VPN-ключ.
        </p>
        <p style="margin:0 0 14px;">
          <a href="${escapeHtml(safeMagicUrl)}" style="display:inline-block; background:#1a8f7b; color:#ffffff; text-decoration:none; padding:10px 14px; border-radius:8px;">
            Войти в личный кабинет
          </a>
        </p>
        <p style="margin:0 0 8px;">Если кнопка не открывается, используйте ссылку:</p>
        <p style="margin:0 0 8px;"><a href="${escapeHtml(safeMagicUrl)}">${escapeHtml(safeMagicUrl)}</a></p>
        <p style="margin:0 0 8px;"><strong>Ссылка действует до:</strong> ${escapeHtml(expiresAtLabel)}</p>
        <p style="margin:0 0 8px;"><strong>Целевая страница:</strong> ${escapeHtml(safeNextPath)}</p>
        <p style="margin:0;">Поддержка: <a href="mailto:${supportEmail}">${supportEmail}</a></p>
      </div>
    `,
  });

  return true;
}

export async function sendCustomerSubscriptionReminderEmail(
  to: string,
  payload: {
    type: "7d" | "3d" | "1d" | "expired";
    plan: string;
    expiresAt: Date;
    accountUrl: string;
    renewUrl: string;
    daysLeft?: number | null;
  }
) {
  const transporter = getTransporter();
  if (!transporter) {
    console.warn("SMTP not configured. Skip subscription reminder email:", to, payload.type);
    return false;
  }

  const fromAddress = resolveFromAddress();
  const supportEmail = "support@gptishka.shop";
  const expiresAtLabel = new Date(payload.expiresAt).toLocaleString("ru-RU");
  const planLabel = String(payload.plan || "VPN").trim() || "VPN";
  const accountUrl = String(payload.accountUrl || "").trim() || `${resolveSiteOrigin()}/account.html`;
  const renewUrl = String(payload.renewUrl || "").trim() || `${resolveSiteOrigin()}/store/vpn`;
  const daysLeft = Number(payload.daysLeft);

  const subject =
    payload.type === "expired"
      ? "VPN подписка истекла — восстановите доступ"
      : Number.isFinite(daysLeft)
      ? `VPN подписка истекает через ${Math.max(0, Math.floor(daysLeft))} дн.`
      : "Скоро истечет VPN подписка";

  const leadLine =
    payload.type === "expired"
      ? "Срок вашей VPN подписки уже истек."
      : Number.isFinite(daysLeft)
      ? `До окончания подписки осталось примерно ${Math.max(0, Math.floor(daysLeft))} дн.`
      : "Срок VPN подписки скоро подойдет к концу.";

  await transporter.sendMail({
    from: fromAddress,
    to,
    subject,
    text: [
      leadLine,
      "",
      `Тариф: ${planLabel}`,
      `Дата окончания: ${expiresAtLabel}`,
      "",
      `Продлить подписку: ${renewUrl}`,
      `Личный кабинет: ${accountUrl}`,
      "",
      `Поддержка: ${supportEmail}`,
    ].join("\n"),
    html: `
      <div style="font-family: Arial, sans-serif; color:#1f2937; line-height:1.5;">
        <h2 style="margin:0 0 12px;">${escapeHtml(subject)}</h2>
        <p style="margin:0 0 12px;">${escapeHtml(leadLine)}</p>
        <p style="margin:0 0 6px;"><strong>Тариф:</strong> ${escapeHtml(planLabel)}</p>
        <p style="margin:0 0 14px;"><strong>Дата окончания:</strong> ${escapeHtml(expiresAtLabel)}</p>
        <p style="margin:0 0 12px;">
          <a href="${escapeHtml(renewUrl)}" style="display:inline-block; background:#1a8f7b; color:#ffffff; text-decoration:none; padding:10px 14px; border-radius:8px; margin-right:8px;">
            Продлить подписку
          </a>
          <a href="${escapeHtml(accountUrl)}" style="display:inline-block; background:#2563eb; color:#ffffff; text-decoration:none; padding:10px 14px; border-radius:8px;">
            Открыть кабинет
          </a>
        </p>
        <p style="margin:0 0 8px;">Если кнопки не открываются:</p>
        <p style="margin:0 0 4px;">Продлить: <a href="${escapeHtml(renewUrl)}">${escapeHtml(renewUrl)}</a></p>
        <p style="margin:0 0 12px;">Кабинет: <a href="${escapeHtml(accountUrl)}">${escapeHtml(accountUrl)}</a></p>
        <p style="margin:0;">Поддержка: <a href="mailto:${supportEmail}">${supportEmail}</a></p>
      </div>
    `,
  });

  return true;
}

export async function sendTelegramNotification(message: string) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return;

  const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: env.TELEGRAM_CHAT_ID,
      text: message,
    }),
  });

  if (!response.ok) {
    console.error("Telegram notification failed", await response.text());
  }
}

function resolveSiteOrigin() {
  try {
    return new URL(env.PAYMENT_SUCCESS_URL).origin;
  } catch {
    return "https://gptishka.shop";
  }
}

function resolveFromAddress() {
  const raw = String(env.SMTP_FROM || "").trim();
  if (!raw || raw.endsWith("@gptishka.local")) {
    return "support@gptishka.shop";
  }
  return raw;
}

function escapeHtml(value: string) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
