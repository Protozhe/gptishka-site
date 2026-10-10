import { OrderStatus, PaymentStatus } from "@prisma/client";
import { prisma } from "../src/config/prisma";
import { campaignConversionIdentifier, conversionCsv } from "../src/modules/analytics/metrika-offline-conversion";

// Run once per day. Dry-run is the default; --upload requires a separate goal
// and a Metrika OAuth token. Never use the existing browser purchase goal here.
async function main() {
  const args = process.argv.slice(2);
  const upload = args.includes("--upload");
  const campaignArg = args.find(arg => arg.startsWith("--campaign="));
  const campaign = campaignArg?.slice("--campaign=".length) || "";
  const orderIds = args.filter(arg => arg.startsWith("--order-id=")).map(arg => arg.slice("--order-id=".length));
  if (args.some(arg => arg !== "--upload" && !arg.startsWith("--campaign=") && !arg.startsWith("--order-id="))
    || args.filter(arg => arg.startsWith("--campaign=")).length > 1
    || (campaign && !/^[a-zA-Z0-9_-]{1,100}$/.test(campaign))
    || orderIds.some(id => !/^[a-zA-Z0-9_-]{1,128}$/.test(id))
    || new Set(orderIds).size !== orderIds.length) {
    throw new Error("Invalid arguments. Use --campaign=NAME and optional --order-id=ID; --upload requires explicit approval.");
  }
  if (!campaign) throw new Error("--campaign=NAME is required to prevent mixing unrelated orders");
  if (upload && campaign !== "chatgpt_plus_hot_search") {
    throw new Error("--upload is limited to the reviewed ChatGPT Plus campaign");
  }
  // Until a separately reviewed release enables automation, every upload is
  // explicitly scoped to named orders. A missing list must never mean "all".
  if (upload && orderIds.length === 0) {
    throw new Error("--upload requires at least one explicit --order-id=ID");
  }
  const token = process.env.METRIKA_OAUTH_TOKEN || "";
  const counter = process.env.METRIKA_COUNTER_ID || "";
  const target = process.env.METRIKA_OFFLINE_TARGET || "";
  if (upload && (!token || counter !== "106969126" || target !== "paid_order_server")) {
    throw new Error("Set METRIKA_OAUTH_TOKEN, METRIKA_COUNTER_ID=106969126 and METRIKA_OFFLINE_TARGET=paid_order_server before --upload");
  }

  // Metrika links offline events to visits only within its 21-day window.
  const cutoff = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000);
  const orders = await prisma.order.findMany({
    where: { status: OrderStatus.PAID, source: "site", createdAt: { gte: cutoff },
      ...(orderIds.length ? { id: { in: orderIds } } : {}),
      payments: { some: { status: PaymentStatus.SUCCESS, processedAt: { gte: cutoff } } } },
    select: { id: true, orderDetails: true, totalAmount: true, currency: true,
      payments: { where: { status: PaymentStatus.SUCCESS, processedAt: { gte: cutoff } },
        orderBy: { processedAt: "asc" }, take: 1, select: { processedAt: true } } },
    orderBy: { createdAt: "desc" },
    take: 5000,
  });
  const eligible = orders.flatMap(order => {
    const identifier = campaignConversionIdentifier(order.orderDetails, campaign);
    const paidAt = order.payments[0]?.processedAt;
    return identifier && paidAt ? [{ order, identifier, paidAt }] : [];
  });
  if (upload && eligible.length !== orderIds.length) {
    const eligibleIds = new Set(eligible.map(item => item.order.id));
    throw new Error(`Refusing partial upload; ineligible order IDs: ${orderIds.filter(id => !eligibleIds.has(id)).join(", ")}`);
  }
  if (!upload) {
    console.info(`Dry run: ${eligible.length} eligible paid site orders for campaign ${campaign}; ${orders.length - eligible.length} without a matching campaign click ID or payment time. No data uploaded.`);
    if (orderIds.length) {
      const eligibleIds = new Set(eligible.map(item => item.order.id));
      const selectedIds = new Set(orders.map(order => order.id));
      for (const id of orderIds) {
        const result = eligibleIds.has(id) ? "eligible" : selectedIds.has(id)
          ? "no matching visitor/campaign click ID" : "not a paid site order with a recent successful payment";
        console.info(`${id}: ${result}`);
      }
    }
    return;
  }
  if (eligible.length === 0) {
    console.info("No paid site orders with a Metrika visitor ID in the attribution window.");
    return;
  }

  await prisma.metrikaOfflineConversion.createMany({
    data: eligible.map(item => ({ orderId: item.order.id })), skipDuplicates: true,
  });
  const pending = await prisma.metrikaOfflineConversion.findMany({
    where: { orderId: { in: eligible.map(item => item.order.id) }, status: "PENDING" },
    select: { orderId: true },
  });
  const byId = new Map(eligible.map(item => [item.order.id, item]));
  let submitted = 0;
  for (const entry of pending) {
    const item = byId.get(entry.orderId);
    if (!item) continue;
    const claimed = await prisma.metrikaOfflineConversion.updateMany({
      where: { orderId: entry.orderId, status: "PENDING" }, data: { status: "SENDING" },
    });
    if (claimed.count !== 1) continue;
    const csv = conversionCsv({ identifier: item.identifier, target, paidAt: item.paidAt,
      price: Number(item.order.totalAmount), currency: String(item.order.currency) });
    const form = new FormData();
    form.append("file", new Blob([csv], { type: "text/csv;charset=utf-8" }), `${entry.orderId}.csv`);
    let response: Response;
    try {
      response = await fetch(`https://api-metrika.yandex.net/management/v1/counter/${counter}/offline_conversions/upload`, {
        method: "POST", headers: { Authorization: `OAuth ${token}` }, body: form,
      });
    } catch (error) {
      // A network error is ambiguous: Yandex may have accepted the upload.
      // Keep SENDING until the upload list is checked, avoiding automatic duplicates.
      console.error(`Upload outcome unknown for order ${entry.orderId}`, error);
      continue;
    }
    if (!response.ok) {
      await prisma.metrikaOfflineConversion.update({
        where: { orderId: entry.orderId }, data: { status: "PENDING" },
      });
      console.error(`Metrika rejected order ${entry.orderId}: HTTP ${response.status}`);
      continue;
    }
    let payload: { uploading?: { id?: number } };
    try {
      payload = await response.json() as { uploading?: { id?: number } };
    } catch {
      console.error(`Metrika accepted order ${entry.orderId}, but the upload ID was unreadable; check uploads before retrying.`);
      continue;
    }
    if (!payload.uploading?.id) {
      console.error(`Metrika returned no upload ID for order ${entry.orderId}; check uploads before retrying.`);
      continue;
    }
    await prisma.metrikaOfflineConversion.update({
      where: { orderId: entry.orderId },
      data: { status: "SUBMITTED", uploadId: String(payload.uploading.id), sentAt: new Date() },
    });
    submitted += 1;
  }
  console.info(`Submitted ${submitted} paid orders; check matching in Metrika's Offline conversions report.`);
}

main().catch(error => { console.error(error); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });
