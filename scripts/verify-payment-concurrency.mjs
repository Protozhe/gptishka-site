import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

class AppError extends Error { constructor(message, status) { super(message); this.status = status; } }
const statuses = Object.fromEntries(["PENDING", "PAID", "FAILED", "REFUNDED", "SUCCESS", "PROCESSING", "REVERSED"].map(x => [x, x]));
let order, payment, deliveries, refunds, intents, unlock, tail;
function reset(status = "PENDING") {
  order = { id: "order-1", status, totalAmount: 100, currency: "RUB", email: "fixture@example.invalid" };
  payment = { id: "payment-1", orderId: order.id, provider: "gateway", providerRef: "bill-1", status: status === "PAID" ? "SUCCESS" : "PROCESSING", amount: 100, currency: "RUB", payload: {} };
  deliveries = refunds = 0; intents = []; tail = Promise.resolve();
}
const copy = value => structuredClone(value);
const prisma = {
  payment: {
    findFirst: async q => q.where.id?.not || q.where.OR && !q.where.OR.some(x => x.providerRef === payment.providerRef || x.id === payment.id) ? null : { ...copy(payment), order: copy(order) },
    findUnique: async () => copy(payment),
    update: async q => Object.assign(payment, q.data),
  },
  order: {
    findUnique: async () => ({ ...copy(order), payments: [copy(payment)] }),
    update: async q => Object.assign(order, q.data),
  },
  auditLog: {
    findFirst: async () => intents[0] || null,
    create: async q => { const record = { id: String(intents.length), ...q.data }; intents.push(record); return record; },
  },
  partnerEarning: { updateMany: async () => ({ count: 0 }) },
  $queryRaw: async () => { const before = tail; tail = new Promise(r => { unlock = r; }); await before; return []; },
  $transaction: async action => {
    if (Array.isArray(action)) return Promise.all(action);
    // A transaction owns its row lock until its callback finishes.
    let release;
    const tx = { ...prisma, $queryRaw: async () => { const before = tail; tail = new Promise(r => { release = r; }); await before; return []; } };
    try { return await action(tx); } finally { release?.(); }
  },
};
function load(file, dependencies) {
  const source = fs.readFileSync(file, "utf8");
  const context = vm.createContext({ exports: {}, require: name => {
    assert.ok(name in dependencies, `Unexpected dependency ${name}`); return dependencies[name];
  }, URL, AbortSignal, Date, console: { info() {}, warn() {}, error() {} }, fetch: async () => ({ ok: true, json: async () => ({ status_check: true, data: { order_id: order.id, status: "success", invoice_amount: 100, currency: "RUB" } }) }) });
  vm.runInContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return context.exports;
}
const env = { ENOT_API_KEY: "fixture", ENOT_SHOP_ID: "fixture", PAYMENT_API_BASE_URL: "https://enot.example" };
const common = { "@prisma/client": { OrderStatus: statuses, PaymentStatus: statuses, PartnerEarningStatus: statuses }, "../../config/prisma": { prisma }, "../../config/env": { env }, "../../common/errors/app-error": { AppError } };
const { paymentWebhookService } = load("apps/admin-backend/src/modules/payments/payment-webhook.service.ts", {
  ...common, crypto: {}, "./pally-verification": {}, "./lava.credentials": {},
  "../notifications/notifications.service": { sendOrderPaidEmail: async () => {}, sendOrderPaidManagerNotification: async () => {} },
  "../orders/delivery.service": { deliverProduct: async () => { deliveries++; } },
  "../customers/customer-sheet.service": { syncWebsiteCustomerToSheet: async () => {} },
});
const payload = { paymentId: "bill-1", orderId: "order-1", status: "success", amount: 100, currency: "RUB" };
reset();
await Promise.all([paymentWebhookService.handle(payload), paymentWebhookService.handle(payload)]);
assert.equal(deliveries, 1, "Concurrent success callbacks must dispatch once");
assert.equal(order.status, "PAID");
reset();
await Promise.all([paymentWebhookService.handle(payload), paymentWebhookService.handle({ ...payload, status: "failed" })]);
assert.equal(order.status, "PAID", "A stale failure must not overwrite a paid order");
assert.equal(payment.status, "SUCCESS");
reset();
await assert.rejects(paymentWebhookService.handle({ ...payload, paymentId: "foreign", status: "failed" }), /reference|not found/i);
assert.equal(payment.providerRef, "bill-1");
reset();
await assert.rejects(paymentWebhookService.handle(payload, "lava"), /provider/i);
reset("PAID");
await assert.rejects(paymentWebhookService.handle({ ...payload, status: "refund", refund_amount: "10.00" }), /partial|amount/i);
assert.equal(order.status, "PAID");

const source = fs.readFileSync("apps/admin-backend/src/modules/payments/payments.service.ts", "utf8");
const ast = ts.createSourceFile("service.ts", source, ts.ScriptTarget.Latest, true);
const service = ast.statements.flatMap(n => ts.isVariableStatement(n) ? [...n.declarationList.declarations] : []).find(n => n.name.getText(ast) === "paymentsService");
const method = service.initializer.properties.find(n => n.name?.getText(ast) === "refund");
let providerFails = false;
const context = vm.createContext({ prisma, OrderStatus: statuses, PaymentStatus: statuses, PartnerEarningStatus: statuses, AppError,
  Date, console: { error() {} }, writeAuditLog: async () => {},
  getProviderByCode: () => ({ refundPayment: async () => { refunds++; if (providerFails) throw Error("timeout"); return { ok: true, providerRef: "refund-1" }; } }),
});
vm.runInContext(ts.transpileModule(`const service = { ${method.getText(ast)} };`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText + "\nglobalThis.refund = service.refund;", context);
reset("PAID");
await Promise.allSettled([context.refund(order.id), context.refund(order.id)]);
assert.equal(refunds, 1, "Concurrent refunds must call provider once");
await context.refund(order.id);
assert.equal(refunds, 1, "A completed refund must not be sent again");
reset(); await assert.rejects(context.refund(order.id)); assert.equal(refunds, 0, "Unpaid order cannot be refunded");
reset("PAID"); providerFails = true;
await assert.rejects(context.refund(order.id));
providerFails = false;
await assert.rejects(context.refund(order.id), /reconcil|progress|already/i);
assert.equal(refunds, 1, "An uncertain refund must never be blindly retried");
reset("PAID"); payment.provider = "pally";
await assert.rejects(context.refund(order.id)); assert.equal(refunds, 0);
reset("PAID"); payment.status = "PROCESSING";
await assert.rejects(context.refund(order.id)); assert.equal(refunds, 0);
console.log("Concurrent settlement, stale events, reference/provider binding, partial refund and durable refund retry guards pass.");
