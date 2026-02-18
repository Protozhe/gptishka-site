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
