import type { PrismaClient } from "@prisma/client";
import { AppError } from "../../common/errors/app-error";
import { appStoreCard, normalizeAppStoreCode } from "../../common/utils/app-store-card";
import type { ActivationRecord } from "./activation.store";

type Dependencies = {
  db: PrismaClient;
  records: {
    findByOrderId(id: string): ActivationRecord | null | undefined;
    upsert(record: ActivationRecord): unknown;
  };
  isTrustedPaid(order: any): boolean;
  notify(input: { orderId: string; email: string; productTitle: string; code: string }): Promise<unknown>;
};

const orderInclude = { payments: true, items: { include: { product: true }, orderBy: { id: "asc" as const }, take: 2 } };

export function createAppStoreDeliveryService({ db, records, isTrustedPaid, notify }: Dependencies) {
  function assertCardOrder(order: any) {
    if (!order) throw new AppError("Order not found", 404);
    if (!isTrustedPaid(order)) throw new AppError("Код можно выдать только после подтверждённой оплаты", 409);
    const item = order.items?.[0];
    const card = appStoreCard(item?.product);
    if (!card || order.items.length !== 1 || Number(item.quantity) !== 1) {
      throw new AppError("Выдача доступна только для одного товара App Store", 409);
    }
    return { card, product: item.product };
  }

  function recordCode(order: any, code: string, issuedAt: string) {
    const previous = records.findByOrderId(order.id);
    records.upsert({
      ...previous, orderId: order.id, email: order.email, productKey: order.items[0].product.slug,
      cdk: code, activationSiteUrl: "", status: "success", verificationState: "success",
      attempts: 0, taskId: null, issuedAt, updatedAt: issuedAt,
      lastProviderMessage: "Код App Store выдан клиенту.",
    });
  }

  return {
    async read(orderId: string) {
      const order = await db.order.findUnique({ where: { id: orderId }, include: orderInclude });
      const { card, product } = assertCardOrder(order);
      const snapshot = records.findByOrderId(orderId);
      const previous = snapshot?.productKey === product.slug ? snapshot : null;
      const assigned = previous?.cdk ? null : await db.licenseKey.findFirst({
        where: { orderId, productKey: product.slug, status: "used" },
      });
      const code = previous?.cdk || assigned?.keyValue || "";
      if (assigned) recordCode(order, code, assigned.usedAt?.toISOString() || new Date().toISOString());
      return {
        orderId, deliveryMode: "code", status: code ? "code_ready" : "processing",
        product: product.slug, productSlug: product.slug, activationFlow: null, productTitle: product.title, ...card,
        paidAmount: Number(order!.totalAmount), currency: order!.currency,
        ...(code ? { code, issuedAt: previous?.issuedAt || assigned?.usedAt } : { estimatedMinutes: 5 }),
        message: code ? "Код готов к использованию." : "Заказ в обработке. Обычно выдача занимает до 5 минут.",
      };
    },

    async issue(orderId: string, rawCode: string, userId: string) {
      const code = normalizeAppStoreCode(rawCode);
      if (!code) throw new AppError("Введите код Apple из 16 латинских букв и цифр", 422);
      const previous = records.findByOrderId(orderId);
      if (previous?.cdk && previous.cdk !== code) throw new AppError("Код по этому заказу уже выдан", 409);
      let fulfilled: any;
      try {
        fulfilled = await db.$transaction(async (tx) => {
          // Lock the order row: repeated submissions and status/refund updates cannot race issuance.
          await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`;
          const order = await tx.order.findUnique({ where: { id: orderId }, include: orderInclude });
          const { card, product } = assertCardOrder(order);
          const existing = await tx.licenseKey.findMany({ where: { orderId, status: { in: ["used", "reserved"] } }, take: 2 });
          if (existing.length) {
            if (existing.length !== 1 || existing[0].keyValue !== code || existing[0].productKey !== product.slug || existing[0].status !== "used") {
              throw new AppError("Код по этому заказу уже выдан; повторная выдача заблокирована", 409);
            }
            return { order, code, issuedAt: existing[0].usedAt?.toISOString() || new Date().toISOString() };
          }
          const stock = await tx.licenseKey.findUnique({ where: { keyValue: code } });
          if (stock && (stock.status !== "available" || stock.orderId || stock.productKey !== product.slug || stock.activationSiteUrl)) {
            throw new AppError("Код уже используется или относится к другому региону и номиналу", 409);
          }
          const usedAt = new Date();
          const data = { productKey: product.slug, productId: product.id, activationSiteUrl: "", status: "used" as const, orderId, email: order!.email, usedAt };
          let key;
          if (stock) {
            const claimed = await tx.licenseKey.updateMany({ where: { id: stock.id, status: "available", orderId: null }, data });
            if (claimed.count !== 1) throw new AppError("Этот код уже выдан другому заказу", 409);
            key = stock;
          } else {
            key = await tx.licenseKey.create({ data: { ...data, keyValue: code } });
          }
          await tx.licenseKeyAuditLog.create({
            data: { keyId: key.id, action: "issue_app_store_order", userId,
              meta: { orderId, productKey: product.slug, ...card } },
          });
          return { order, code, issuedAt: usedAt.toISOString() };
        }, { isolationLevel: "Serializable" });
      } catch (error: any) {
        if (error?.code === "P2002") throw new AppError("Этот код уже используется", 409);
        if (error?.code === "P2034") throw new AppError("Заказ обновился. Повторите выдачу.", 409);
        throw error;
      }
      recordCode(fulfilled.order, fulfilled.code, fulfilled.issuedAt);
      await notify({ orderId, email: fulfilled.order.email, productTitle: fulfilled.order.items[0].product.title, code }).catch(() => {});
      return { orderId, status: "code_ready" };
    },
  };
}
