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
  const aibuy = require(path.resolve(__dirname,"../../../../ops/supplier-procurement/aibuy-live.cjs"));
  const paidOrder = /^codex-(250|500|1000)$/.test(input.productKey)
    ? await prisma.order.findUnique({where:{id:input.orderId},include:{items:{include:{product:true}}}}) : null;
  const viaAibuy = aibuy.managed(aibuy.policy(),paidOrder);
  const supplier = viaAibuy ? "AI-BUY" : "AISOU";
  const progress = async (event: {phase:string;product?:string;provider?:string}) => {
    const a = activationStore.findByOrderId(input.orderId);
    if (!a || a.status === "success" || a.taskId) return;
    activationStore.upsert({...a,lastProviderPayload:{...(a.lastProviderPayload||{}),supplierProcurement:{managed:true,provider:viaAibuy?"aibuy":"aisou",phase:event.phase,product:event.product||input.productKey,updatedAt:new Date().toISOString()}},updatedAt:new Date().toISOString()});
    if(event.phase==='purchasing') await notifyHoldOnce(input.orderId,'supplier_purchase_started',()=>sendTelegramNotification(
      `🛒 <b>${supplier} · Автозакупка ключа</b>\n\n🧾 Заказ: <code>${input.orderId}</code>\nТовар: <b>${input.productKey}</b>\n\nСтатус: <b>покупаем подходящий ключ</b>\n\nВ локальном пуле ключа нет. После получения и проверки номинала активация продолжится автоматически.`
    )).catch(()=>{});
  };
  try {
    const result = await (viaAibuy ? aibuy.procure : procureWebsiteKey)({ ...input, prisma, activationStore, notifyFunds: sendTelegramNotification, onProgress:progress });
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
    await progress({phase:code==='supplier_human_verification_required'?'human_required':code==='supplier_balance_insufficient'?'funds_wait':code==='supplier_checkout_not_ready'?'waiting_checkout':'requires_review'});
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
    const reason = code==='supplier_checkout_not_ready' ? "Платёжная форма поставщика не успела загрузиться. Запрос оплаты не отправлен, списания нет. Обработчик автоматически повторит подготовку формы."
      : code==='supplier_owner_topup_pause' ? "Закупка временно приостановлена владельцем для пополнения. Заказ сохранён; после возобновления продолжим автоматически."
      : code==='supplier_login_required' ? "Нужно восстановить единственную серверную сессию AI-BUY. Для пополнения используйте отдельную платёжную ссылку, чтобы не прерывать сессию закупок."
      : code==='supplier_human_verification_required' ? `${supplier} запросил проверку человеком. Требуется подтверждение владельца. Исходный запрос сохранён без повторной закупки.`
      : code==='supplier_api_ip_not_allowed' ? "AISOU отклонил доступ к покупкам по API с адреса сервера. Проверьте официальный белый список API в AISOU. Исходный запрос сохранён, повторная закупка заблокирована до сверки."
      : code==='supplier_api_access_refused' ? "AISOU отклонил права или подпись запроса покупки. Проверьте доступ мерчанта к покупке с баланса; исходный запрос сохранён без повторной закупки."
      : /balance_insufficient/.test(code) ? "Недостаточно баланса AISOU для нужного товара. После пополнения обработчик повторит проверку."
      : /uncertain|sending|unconfirmed/.test(code) ? "Ответ на покупку не подтверждён. Повторная покупка остановлена."
      : /wrong_product|quarantined/.test(code) ? "Тип или состояние полученного ключа требует проверки. Ключ сохранён в закрытом журнале."
      : /cost|margin/.test(code) ? "Не удалось подтвердить стоимость, комиссию или положительную прибыль заказа."
      : "Не удалось безопасно завершить закупку подходящего ключа.";
    await notifyHoldOnce(input.orderId, code, () => sendTelegramNotification(
      `⚠️ <b>${supplier} · ${code==='supplier_human_verification_required'?'Нужно подтверждение':/uncertain|sending|unconfirmed/.test(code)?'Проверяем результат закупки':'Автозакупка приостановлена'}</b>\n\n🧾 Заказ: <code>${input.orderId}</code>\n\n<b>Причина</b>\n<blockquote>${reason}</blockquote>\n\nСтатус: <b>заказ сохранён, результат проверяется</b>`,
      !viaAibuy&&code==='supplier_human_verification_required'?{inline_keyboard:[[{text:'Открыть AISOU',url:'https://aisou.pro/'}]]}:undefined
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
    await require(path.resolve(__dirname,"../../../../ops/supplier-procurement/aibuy-live.cjs")).due(paid.map(r=>r.id),sendTelegramNotification);
  } finally { fundsDeadlineRunning = false; }
}

export async function pendingAisouNativeOrders(): Promise<string[]> {
  const { pendingNativeOrders } = require(path.resolve(__dirname, "../../../../ops/supplier-procurement/aisou-live.cjs"));
  const activeIds=activationStore.list().filter(r => !r.externalFulfillmentOwner && !r.taskId && !Number(r.attempts || 0) && r.status !== "success" && r.verificationState !== "success").map(r => r.orderId);
  return [...new Set<string>([...await pendingNativeOrders(activeIds),...await require(path.resolve(__dirname,"../../../../ops/supplier-procurement/aibuy-live.cjs")).pending(activeIds)])];
}

export async function notifyAibuyActivationResult(orderId:string, productKey:string, completed:boolean) {
  if(!/^[a-z0-9]{20,40}$/.test(orderId)||!/^codex-(250|500|1000)$/.test(productKey))return;
  const order=await prisma.order.findUnique({where:{id:orderId},select:{source:true,status:true}});
  const a=activationStore.findByOrderId(orderId);
  if(order?.source!=="site"||order.status!=="PAID"||a?.activationSiteUrl!=="https://aichongzhi.fun")return;
  if(completed&&a.status!=="success"&&a.verificationState!=="success")return;
  const {notifyHoldOnce}=require(path.resolve(__dirname,"../../../../ops/supplier-procurement/aisou-live.cjs"));
  await notifyHoldOnce(orderId,completed?"aibuy_activation_completed":"aibuy_activation_review",()=>sendTelegramNotification(
    `${completed?'✅':'⚠️'} <b>AI-BUY · ${completed?'Кредиты зачислены':'Нужно проверить пополнение'}</b>\n\n`
    + `🧾 Заказ: <code>${orderId}</code>\n🛍 Товар: <b>Codex ${productKey.slice(6)}</b>\n\n`
    + `Статус: <b>${completed?'Выполнен':'Требуется проверка'}</b>\n\n`
    + (completed?'Поставщик подтвердил завершение пополнения.':'Исходная заявка сохранена. Повторная закупка и повторная отправка остановлены до проверки результата.')
  ));
}
