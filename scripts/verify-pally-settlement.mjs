import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

class AppError extends Error { constructor(message, status) { super(message); this.status = status; } }
let bill, payments, calls;
const input = { paymentRef: "bill-1", orderId: "order-1", expectedAmount: 2299, expectedCurrency: "RUB" };
function reset() {
  bill = { success: true, id: "bill-1", order_id: "order-1", status: "SUCCESS", amount: 2330.64, currency_in: "RUB" };
  payments = { success: true, data: [{ bill_id: "bill-1", bill_order_id: "order-1", status: "SUCCESS", amount: 2330.64, bill_amount: 2299, currency_in: "RUB", refunded_amount: 0 }], links: { next: null } };
  calls = [];
}
const env = { PALLY_API_TOKEN: "fixture", PALLY_API_BASE_URL: "https://pally.example" };
function load(file, dependencies) {
  const source = fs.readFileSync(file, "utf8");
  const context = vm.createContext({ exports: {}, require: name => {
    assert.ok(name in dependencies, `Unexpected dependency ${name}`); return dependencies[name];
  }, URL, AbortSignal, console: { info() {}, warn() {}, error() {} }, Date, fetch: async (url, options) => {
    assert.equal(options.headers.Authorization, "Bearer fixture");
    const parsed = new URL(url); assert.equal(parsed.searchParams.get("id"), "bill-1");
    calls.push(parsed.pathname);
    return { ok: true, json: async () => parsed.pathname.endsWith("/status") ? bill : payments };
  }});
  vm.runInContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return context.exports;
}
const { verifyPallyPaidBill } = load("apps/admin-backend/src/modules/payments/pally-verification.ts", {
  "../../config/env": { env }, "../../common/errors/app-error": { AppError },
});
reset(); assert.equal((await verifyPallyPaidBill({ ...input, reportedAmount: 2330.64 })).amount, 2299);
assert.equal(calls.length, 2);
assert.equal((await verifyPallyPaidBill({ ...input, reportedAmount: 2299 })).chargedAmount, 2330.64);
reset(); bill.amount = "2299.00"; await verifyPallyPaidBill(input); assert.equal(calls.length, 1);
for (const [field, value] of [["id", "foreign"], ["order_id", "foreign"], ["status", "PROCESS"], ["status", "UNDERPAID"], ["status", "OVERPAID"], ["success", false], ["currency_in", "USD"], ["amount", 2200], ["amount", null], ["amount", ""]]) {
  reset(); bill[field] = value; await assert.rejects(verifyPallyPaidBill(input));
}
for (const [field, value] of [["bill_id", "foreign"], ["bill_order_id", "foreign"], ["bill_amount", 2000], ["bill_amount", null], ["amount", 2300], ["currency_in", "USD"], ["refunded_amount", 1], ["refunded_amount", null], ["status", "FAIL"]]) {
  reset(); payments.data[0][field] = value; await assert.rejects(verifyPallyPaidBill(input));
}
reset(); payments.data.push({ ...payments.data[0] }); await assert.rejects(verifyPallyPaidBill(input));
reset(); payments.links.next = "cursor"; await assert.rejects(verifyPallyPaidBill(input));
reset(); payments.success = false; await assert.rejects(verifyPallyPaidBill(input));
reset(); await assert.rejects(verifyPallyPaidBill({ ...input, reportedAmount: 2400 }));

// Exercise the actual shared settlement service, including its amount gate and replay guard.
let order, payment, deliveries;
function resetOrder(provider = "pally") {
  reset(); deliveries = 0;
  order = { id: "order-1", status: "PENDING", totalAmount: 2299, currency: "RUB" };
  payment = { id: "payment-1", orderId: "order-1", provider, providerRef: "bill-1", status: "PROCESSING", order, payload: {} };
}
const prisma = {
  payment: {
    findFirst: async query => query.where.id?.not ? null : payment,
    findUnique: async () => payment,
    update: async query => (payment = { ...payment, ...query.data }),
  },
  order: { findUnique: async () => order, update: async query => (order = { ...order, ...query.data }) },
  $queryRaw: async () => [],
  $transaction: async values => typeof values === "function" ? values(prisma) : Promise.all(values),
};
const statuses = Object.fromEntries(["PENDING", "PAID", "FAILED", "REFUNDED", "SUCCESS", "PROCESSING"].map(x => [x, x]));
const { paymentWebhookService } = load("apps/admin-backend/src/modules/payments/payment-webhook.service.ts", {
  "@prisma/client": { OrderStatus: statuses, PaymentStatus: statuses, PartnerEarningStatus: {} },
  crypto: {}, "../../config/prisma": { prisma }, "../../config/env": { env },
  "../../common/errors/app-error": { AppError }, "./pally-verification": { verifyPallyPaidBill },
  "./lava.credentials": {}, "../customers/customer-sheet.service": { syncWebsiteCustomerToSheet: async () => {} },
  "../notifications/notifications.service": { sendOrderPaidEmail: async () => {}, sendOrderPaidManagerNotification: async () => {} },
  "../orders/delivery.service": { deliverProduct: async () => { deliveries++; } },
});
const payload = { paymentId: "bill-1", orderId: "order-1", status: "success", amount: 2330.64, currency: "RUB" };
resetOrder(); await paymentWebhookService.handle(payload);
assert.equal(order.status, "PAID"); assert.equal(payment.status, "SUCCESS"); assert.equal(deliveries, 1);
assert.equal((await paymentWebhookService.handle(payload)).duplicate, true); assert.equal(deliveries, 1);
resetOrder(); payments.data[0].bill_amount = 2000;
await assert.rejects(paymentWebhookService.handle(payload)); assert.equal(order.status, "PENDING");
resetOrder("gateway"); await assert.rejects(paymentWebhookService.handle(payload), /Webhook amount mismatch/);
assert.equal(order.status, "PENDING");

const orderSource = fs.readFileSync("apps/admin-backend/src/modules/orders/orders.service.ts", "utf8");
const ast = ts.createSourceFile("orders.ts", orderSource, ts.ScriptTarget.Latest, true);
const reconcile = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "tryReconcilePendingOrderPayment");
let reconciled = false;
resetOrder();
const context = vm.createContext({ OrderStatus: statuses, prisma: { order: { findUnique: async () => ({ totalAmount: 2299, currency: "RUB" }) } },
  verifyPallyPaidBill, paymentWebhookService: { handle: async value => { assert.equal(value.amount, 2299); reconciled = true; } },
  probeGatewayInvoiceStatus: () => { throw Error("Pally must not use the gateway API"); }, console,
});
vm.runInContext(ts.transpileModule(reconcile.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
await context.tryReconcilePendingOrderPayment("order-1", { id: "order-1", status: "PENDING", payments: [{ provider: "pally", providerRef: "bill-1" }] });
assert.equal(reconciled, true);
console.log("Pally surcharge settlement, strict API binding, rejection cases, replay guard and pending-order reconciliation pass.");
