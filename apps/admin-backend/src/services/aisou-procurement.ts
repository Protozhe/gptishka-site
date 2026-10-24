import path from "path";
import { prisma } from "../config/prisma";
import { activationStore } from "../modules/orders/activation.store";
import { AppError } from "../common/errors/app-error";
import { sendTelegramNotification } from "../modules/notifications/notifications.service";

export function verifiedAieeGrokProduct(payload:unknown):string|null {
  return require(path.resolve(__dirname,"../../../../ops/supplier-procurement/aisou-core.cjs")).grokProductFromProvider(payload);
}

/** Only the selected account-type route may request an empty-pool purchase. */
export async function procureSelectedWebsiteKey(input: {
  orderId: string; productKey: string; accountPlan: string; activationSiteUrl: string;
}) {
  const modulePath = path.resolve(__dirname, "../../../../ops/supplier-procurement/aisou-live.cjs");
  const { procureWebsiteKey, notifyHoldOnce } = require(modulePath);
  const progress = async (event: {phase:string;product?:string}) => {
    const a = activationStore.findByOrderId(input.orderId);
    if (!a || a.status === "success" || a.taskId) return;
    activationStore.upsert({...a,lastProviderPayload:{...(a.lastProviderPayload||{}),supplierProcurement:{managed:true,provider:"aisou",phase:event.phase,product:event.product||input.productKey,updatedAt:new Date().toISOString()}},updatedAt:new Date().toISOString()});
    if(event.phase==='purchasing') await notifyHoldOnce(input.orderId,'supplier_purchase_started',()=>sendTelegramNotification(
      `🛒 <b>AISOU · Автозакупка ключа</b>\n\n🧾 Заказ: <code>${input.orderId}</code>\nТовар: <b>${input.productKey}</b>\n\nСтатус: <b>покупаем подходящий ключ</b>\n\nВ локальном пуле ключа нет. После получения и проверки номинала активация продолжится автоматически.`
    )).catch(()=>{});
  };
  try {
    const result = await procureWebsiteKey({ ...input, prisma, activationStore, notifyFunds: sendTelegramNotification, onProgress:progress });
    if (!result) {
      const a=activationStore.findByOrderId(input.orderId);
      if(a?.lastProviderPayload?.supplierProcurement)activationStore.upsert({...a,lastProviderPayload:{...(a.lastProviderPayload||{}),supplierProcurement:{managed:false,phase:'disabled'}},updatedAt:new Date().toISOString()});
      return null;
    }
    if (result.stockAvailable) return activationStore.reserveCdkRecordForOrder({
      productKey: input.productKey, activationSiteUrl: input.activationSiteUrl,
      orderId: input.orderId, email: activationStore.findByOrderId(input.orderId)?.email || "",
    });
    return { keyId: result.keyId as string, code: result.code as string, activationSiteUrl: result.activationSiteUrl as string };
  } catch (error) {
    const code = error instanceof Error && /^supplier_[a-z_]{1,70}$/.test(error.message) ? error.message : "supplier_requires_review";
    await progress({phase:code==='supplier_human_verification_required'?'human_required':code==='supplier_balance_insufficient'?'funds_wait':'requires_review'});
    if (code === "supplier_balance_insufficient") {
      // No provider attempt has been made. Keep the native demand resumable;
      // pending/processing here would short-circuit startActivationUnsafe.
      const a = activationStore.findByOrderId(input.orderId);
      if (a && !a.taskId && !a.attempts && a.status !== "success") activationStore.upsert({
        ...a, lastProviderMessage: "Заказ сохранён. Автоматическая обработка продолжится после устранения задержки; повторная оплата не требуется.",
        lastProviderPayload: { ...(a.lastProviderPayload || {}), fundsWait: (error as any).fundsWait },
        updatedAt: new Date().toISOString(),
      });
      throw new AppError("Заказ сохранён. Автоматически продолжим после устранения задержки; повторная оплата не требуется.", 409);
    }
    const reason = code==='supplier_human_verification_required' ? "AISOU запросил проверку человеком. Откройте AISOU и подтвердите покупку либо добавьте уже купленный ключ. Автоматический повтор закупки заблокирован до сверки исходного запроса."
      : /balance_insufficient/.test(code) ? "Недостаточно баланса AISOU для нужного товара. После пополнения обработчик повторит проверку."
      : /uncertain|sending/.test(code) ? "Ответ на покупку не подтверждён. Повторная покупка остановлена."
      : /wrong_product|quarantined/.test(code) ? "Тип или состояние полученного ключа требует проверки. Ключ сохранён в закрытом журнале."
      : /cost|margin/.test(code) ? "Не удалось подтвердить стоимость, комиссию или положительную прибыль заказа."
      : "Не удалось безопасно завершить закупку подходящего ключа.";
    await notifyHoldOnce(input.orderId, code, () => sendTelegramNotification(
      `⚠️ <b>AISOU · ${code==='supplier_human_verification_required'?'Нужно подтверждение':/uncertain|sending/.test(code)?'Проверяем результат закупки':'Автозакупка приостановлена'}</b>\n\n🧾 Заказ: <code>${input.orderId}</code>\n\n<b>Причина</b>\n<blockquote>${reason}</blockquote>\n\nСтатус: <b>повторная покупка заблокирована</b>`,
      code==='supplier_human_verification_required'?{inline_keyboard:[[{text:'Открыть AISOU',url:'https://aisou.pro/'}]]}:undefined
    )).catch(() => {});
    // Raw merchant errors can contain a secret receipt. Never expose them.
    throw new AppError("Автоматическая активация ожидает проверки. Заказ сохранён; повторная оплата не требуется.", 409);
  }
}

let fundsDeadlineRunning = false;
export async function notifyPendingAisouFunds() {
  if (fundsDeadlineRunning) return;
  fundsDeadlineRunning = true;
  try {
    const waitingIds = activationStore.list().filter(r => r.status !== "success" && r.verificationState !== "success" && r.lastProviderPayload?.fundsWait).map(r=>r.orderId);
    if (!waitingIds.length) return;
    const paid = await prisma.order.findMany({where:{id:{in:waitingIds},source:"site",status:"PAID"},select:{id:true}});
    const { notifyDueFunds } = require(path.resolve(__dirname,"../../../../ops/supplier-procurement/aisou-live.cjs"));
    await notifyDueFunds(paid.map(r=>r.id),sendTelegramNotification);
  } finally { fundsDeadlineRunning = false; }
}

export async function pendingAisouNativeOrders(): Promise<string[]> {
  const { pendingNativeOrders } = require(path.resolve(__dirname, "../../../../ops/supplier-procurement/aisou-live.cjs"));
  return pendingNativeOrders(activationStore.list().filter(r => !r.externalFulfillmentOwner && !r.taskId && !Number(r.attempts || 0) && r.status !== "success" && r.verificationState !== "success").map(r => r.orderId));
}
