// Opt-in integration check. The caller creates and later drops an isolated DB.
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { PrismaClient, OrderStatus, PaymentStatus, PartnerEarningStatus } from "@prisma/client";

const url = new URL(process.env.PAYMENT_TEST_DATABASE_URL || "http://missing");
assert.match(url.pathname, /^\/payments_audit_[a-z0-9_]+$/, "Requires an explicitly named disposable payment test database");
const prisma = new PrismaClient({ datasources: { db: { url: url.toString() } } });
class AppError extends Error { constructor(message, status) { super(message); this.status = status; } }
let deliveries = 0, refunds = 0, timeout = false;
const quiet = { info() {}, error() {}, warn() {} };
const env = { ENOT_API_KEY: "fixture", ENOT_SHOP_ID: "fixture", PAYMENT_API_BASE_URL: "https://fixture.invalid" };
const context = vm.createContext({ exports: {}, URL, AbortSignal, Date, console: quiet,
  fetch: async () => ({ ok: true, json: async () => ({ status_check: true, data: { order_id: "payment-race-fixture", status: "success", invoice_amount: 100, currency: "RUB" } }) }),
  require: name => {
    const dependencies = {
      "@prisma/client": { OrderStatus, PaymentStatus, PartnerEarningStatus },
      "../../config/prisma": { prisma }, "../../config/env": { env }, "crypto": {},
      "../../common/errors/app-error": { AppError }, "./pally-verification": {}, "./lava.credentials": {},
      "../notifications/notifications.service": { sendOrderPaidEmail: async () => {}, sendOrderPaidManagerNotification: async () => {} },
      "../orders/delivery.service": { deliverProduct: async () => { deliveries++; } },
      "../customers/customer-sheet.service": { syncWebsiteCustomerToSheet: async () => {} },
    };
    assert.ok(name in dependencies); return dependencies[name];
  },
});
const compile = text => ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
vm.runInContext(compile(fs.readFileSync("apps/admin-backend/src/modules/payments/payment-webhook.service.ts", "utf8")), context);
const webhook = context.exports.paymentWebhookService;
const source = ts.createSourceFile("service.ts", fs.readFileSync("apps/admin-backend/src/modules/payments/payments.service.ts", "utf8"), ts.ScriptTarget.Latest, true);
const service = source.statements.flatMap(n => ts.isVariableStatement(n) ? [...n.declarationList.declarations] : []).find(n => n.name.getText(source) === "paymentsService");
const method = service.initializer.properties.find(n => n.name?.getText(source) === "refund");
const refundContext = vm.createContext({ prisma, OrderStatus, PaymentStatus, PartnerEarningStatus, AppError, Date,
  getProviderByCode: () => ({ refundPayment: async () => { refunds++; if (timeout) throw Error("fixture timeout"); return { ok: true, providerRef: "fixture-refund" }; } }),
});
vm.runInContext(compile(`const service = { ${method.getText(source)} };`) + "\nglobalThis.refund = service.refund;", refundContext);
async function reset(status) {
  await prisma.auditLog.deleteMany({ where: { entityId: "payment-race-fixture" } });
  await prisma.order.deleteMany({ where: { id: "payment-race-fixture" } });
  await prisma.order.create({ data: { id: "payment-race-fixture", email: "fixture@example.invalid", status, totalAmount: 100, currency: "RUB",
    payments: { create: { id: "payment-fixture", provider: "gateway", providerRef: "fixture-bill", amount: 100, currency: "RUB", status: status === "PAID" ? "SUCCESS" : "PROCESSING" } } } });
  deliveries = refunds = 0;
}
try {
  const payload = { paymentId: "fixture-bill", orderId: "payment-race-fixture", status: "success", amount: 100, currency: "RUB" };
  await reset("PENDING");
  const outcomes = await Promise.all(Array.from({ length: 12 }, () => webhook.handle(payload, "gateway")));
  assert.equal(outcomes.filter(r => !r.duplicate).length, 1);
  assert.equal(deliveries, 1);
  assert.equal((await prisma.order.findUnique({ where: { id: payload.orderId } })).status, "PAID");
  await reset("PENDING");
  await Promise.all(Array.from({ length: 12 }, (_, i) => webhook.handle(i % 2 ? payload : { ...payload, status: "failed" }, "gateway")));
  assert.equal((await prisma.order.findUnique({ where: { id: payload.orderId } })).status, "PAID");
  assert.equal(deliveries, 1);
  await reset("PAID");
  await Promise.allSettled(Array.from({ length: 12 }, () => refundContext.refund(payload.orderId)));
  assert.equal(refunds, 1);
  assert.equal(await prisma.auditLog.count({ where: { entityId: payload.orderId, action: "refund_requested" } }), 1);
  assert.equal((await prisma.payment.findUnique({ where: { id: "payment-fixture" } })).status, "REFUNDED");
  await reset("PAID"); timeout = true;
  await assert.rejects(refundContext.refund(payload.orderId));
  timeout = false;
  await assert.rejects(refundContext.refund(payload.orderId), /reconcile/);
  assert.equal(refunds, 1);
  console.log("PostgreSQL: 12 concurrent successes, 12 mixed events, 12 refunds and persisted timeout intent pass; provider/notification/delivery calls isolated.");
} finally { await prisma.$disconnect(); }
