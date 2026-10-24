import path from "path";
import { prisma } from "../config/prisma";
import { activationStore } from "../modules/orders/activation.store";
import { AppError } from "../common/errors/app-error";
import { sendTelegramNotification } from "../modules/notifications/notifications.service";

/** Only the selected account-type route may request an empty-pool purchase. */
export async function procureSelectedWebsiteKey(input: {
  orderId: string; productKey: string; accountPlan: string; activationSiteUrl: string;
}) {
  const modulePath = path.resolve(__dirname, "../../../../ops/supplier-procurement/aisou-live.cjs");
  const { procureWebsiteKey, notifyHoldOnce } = require(modulePath);
  try {
    const result = await procureWebsiteKey({ ...input, prisma, activationStore });
    if (!result) return null;
    if (result.stockAvailable) return activationStore.reserveCdkRecordForOrder({
      productKey: input.productKey, activationSiteUrl: input.activationSiteUrl,
      orderId: input.orderId, email: activationStore.findByOrderId(input.orderId)?.email || "",
    });
    return { keyId: result.keyId as string, code: result.code as string, activationSiteUrl: result.activationSiteUrl as string };
  } catch (error) {
    const code = error instanceof Error && /^supplier_[a-z_]{1,70}$/.test(error.message) ? error.message : "supplier_requires_review";
    const reason = /balance_insufficient/.test(code) ? "Недостаточно баланса AISOU для нужного товара. После пополнения обработчик повторит проверку."
      : /uncertain|sending/.test(code) ? "Ответ на покупку не подтверждён. Повторная покупка остановлена."
      : /wrong_product|quarantined/.test(code) ? "Тип или состояние полученного ключа требует проверки. Ключ сохранён в закрытом журнале."
      : /cost|margin/.test(code) ? "Не удалось подтвердить стоимость, комиссию или положительную прибыль заказа."
      : "Не удалось безопасно завершить закупку подходящего ключа.";
    await notifyHoldOnce(input.orderId, code, () => sendTelegramNotification(
      `⚠️ <b>AISOU · Требуется проверка</b>\n\n🧾 Заказ: <code>${input.orderId}</code>\n\n<b>Причина</b>\n<blockquote>${reason}</blockquote>\n\nСтатус: <b>повторная покупка заблокирована</b>`
    )).catch(() => {});
    // Raw merchant errors can contain a secret receipt. Never expose them.
    throw new AppError("Автоматическая активация ожидает проверки. Заказ сохранён; повторная оплата не требуется.", 409);
  }
}

export async function pendingAisouNativeOrders(): Promise<string[]> {
  const { pendingNativeOrders } = require(path.resolve(__dirname, "../../../../ops/supplier-procurement/aisou-live.cjs"));
  return pendingNativeOrders(activationStore.list().filter(r => !r.externalFulfillmentOwner && !r.taskId && !Number(r.attempts || 0) && r.status !== "success" && r.verificationState !== "success").map(r => r.orderId));
}
