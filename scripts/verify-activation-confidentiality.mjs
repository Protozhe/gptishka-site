import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import crypto from "node:crypto";
import ts from "typescript";

class AppError extends Error { constructor(message, status) { super(message); this.status = status; } }
const base = "apps/admin-backend/src/";
function load(path, dependencies, extras = {}) {
  const context = vm.createContext({ exports: {}, Buffer, Date, console, ...extras, require: name => {
    if (name === "crypto") return crypto;
    assert.ok(name in dependencies, `Unexpected dependency ${name}`); return dependencies[name];
  }});
  vm.runInContext(ts.transpileModule(fs.readFileSync(base + path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, context);
  return context.exports;
}
const recovery = load("common/security/activation-recovery-token.ts", { "../../config/env": { env: { JWT_ACCESS_SECRET: "fixture-secret" } } });
const { assertOrderLinkAccess } = load("common/security/order-link-access.ts", {
  "../errors/app-error": { AppError }, "./activation-recovery-token": recovery,
});
const now = Date.now(); const hash = crypto.createHash("sha256").update("original-fixture").digest("hex");
const order = { id: "order-fixture", redeemTokenHash: hash, createdAt: new Date(now - 1000) };
const token = recovery.createActivationRecoveryToken(order.id, hash, now);
assert.match(token, /^r2\./); assertOrderLinkAccess(order, token); assertOrderLinkAccess(order, "original-fixture");
assert.throws(() => assertOrderLinkAccess(order), error => error.status === 401);
assert.throws(() => assertOrderLinkAccess(order, "wrong"), error => error.status === 403);
assert.throws(() => assertOrderLinkAccess({ ...order, redeemTokenHash: null }, "anything"));
assert.throws(() => assertOrderLinkAccess({ ...order, id: "other-order" }, token));
assert.throws(() => assertOrderLinkAccess({ ...order, redeemTokenHash: "f".repeat(64) }, token));
assert.throws(() => assertOrderLinkAccess({ ...order, createdAt: new Date(now - recovery.ACTIVATION_LINK_TTL_MS - 1000) }, "original-fixture"));
assert.equal(recovery.isActivationRecoveryTokenValid(order.id, hash, token, order.createdAt, now + recovery.ACTIVATION_LINK_TTL_MS), false);
assert.equal(recovery.isActivationRecoveryTokenValid(order.id, hash, token.replace(/r2\.\d+/, "r2.9999999999"), order.createdAt), false);
const oldSignature = crypto.createHmac("sha256", "fixture-secret").update("gptishka-order-activation-recovery\0").update(order.id).update("\0").update(hash).digest("base64url");
assert.equal(recovery.isActivationRecoveryTokenValid(order.id, hash, "r1." + oldSignature, order.createdAt), true);
assert.equal(recovery.isActivationRecoveryTokenValid(order.id, hash, "r1." + oldSignature, new Date(now - 8 * 86400000)), false);
assert.equal(recovery.isActivationRecoveryTokenValid(order.id, hash, "r1." + oldSignature), false);

// Normal recovery initializes a formerly unprotected legacy order. Revocation
// rotates the hash and makes every previous token fail while a new link works.
let row = { ...order, status: "PAID", redeemTokenHash: null, items: [] }; let audit;
const prisma = { order: {
  findUnique: async () => ({ ...row }),
  updateMany: async query => { assert.equal(query.where.redeemTokenHash, row.redeemTokenHash); row = { ...row, ...query.data }; return { count: 1 }; },
}};
const { buildOrderActivationRecoveryLink } = load("modules/orders/activation-recovery.service.ts", {
  "@prisma/client": { OrderStatus: { PAID: "PAID" } }, "../../common/errors/app-error": { AppError },
  "../../common/security/activation-recovery-token": recovery,
  "../../common/utils/product-delivery": { resolveOrderDeliveryType: () => "activation" },
  "../../config/env": { env: { APP_BASE_URL: "https://fixture.invalid" } }, "../../config/prisma": { prisma },
  "../audit/audit.service": { writeAuditLog: async value => { audit = value; } },
}, { URL });
const first = await buildOrderActivationRecoveryLink(row.id); const previous = new URL(first.activationUrl).searchParams.get("t");
assertOrderLinkAccess(row, previous);
const revoked = await buildOrderActivationRecoveryLink(row.id, { rotate: true, audit: true });
assert.equal(audit.action, "activation_links_revoked"); assert.throws(() => assertOrderLinkAccess(row, previous));
assertOrderLinkAccess(row, new URL(revoked.activationUrl).searchParams.get("t"));

// Execute status/reconcile methods to prove authorization precedes payment
// probes and that a token is preserved on internal calls.
const source = fs.readFileSync(base + "modules/orders/orders.service.ts", "utf8");
const ast = ts.createSourceFile("orders.ts", source, ts.ScriptTarget.Latest, true); const methods = new Map();
function visit(node) { if (ts.isMethodDeclaration(node)) methods.set(node.name.getText(ast), node.getText(ast)); ts.forEachChild(node, visit); } visit(ast);
let probes = 0; let tokenSeen;
const context = vm.createContext({ assertOrderId() {}, assertOrderLinkAccess, AppError,
  assertOrderTokenAccess: async (_id, provided) => { assertOrderLinkAccess(row, provided); return row; },
  prisma: { order: { findUnique: async () => ({ ...row, payments: [] }) } },
  tryReconcilePendingOrderPayment: async () => { probes++; },
});
vm.runInContext(ts.transpileModule(`globalThis.service = {${methods.get("reconcilePublicStatus")}}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
context.service.getPublicStatus = async (_id, provided) => { tokenSeen = provided; return {}; };
await assert.rejects(context.service.reconcilePublicStatus(row.id)); assert.equal(probes, 0);
const fresh = new URL(revoked.activationUrl).searchParams.get("t"); await context.service.reconcilePublicStatus(row.id, fresh);
assert.equal(probes, 1); assert.equal(tokenSeen, fresh);
const publicStatus = methods.get("getPublicStatus");
vm.runInContext(ts.transpileModule(`globalThis.readService = {${publicStatus}}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
await assert.rejects(context.readService.getPublicStatus(row.id));
await assert.rejects(context.readService.getPublicStatus(row.id, "wrong"));

assert.ok(publicStatus.indexOf("assertOrderLinkAccess(order, orderToken)") < publicStatus.indexOf("const firstItem"));
assert.ok(!source.includes("supportUrl: DEFAULT_SUPPORT_URL"));

// A private link must not initialize third-party collectors, even when query
// parameters are absent on a saved activation page.
const analytics = fs.readFileSync("assets/js/analytics-init.js", "utf8");
for (const href of ["https://fixture.invalid/success.html?t=private-fixture", "https://fixture.invalid/redeem-start.html", "https://fixture.invalid/?t=private-fixture"]) {
  const location = new URL(href); const window = { location };
  vm.runInNewContext(analytics, { window, location, URL, Date, document: { referrer: "" } });
  assert.equal(window.ym, undefined); assert.equal(window._tmr, undefined);
}
let format;
load("common/security/apply-security.ts", {
  helmet: () => () => {}, cors: () => () => {}, "cookie-parser": () => () => {},
  morgan: Object.assign(value => { format = value; return () => {}; }, { token(_name, callback) { assert.equal(callback({ url: "/api/orders/id?t=private-fixture&other=1" }), "/api/orders/id"); } }),
  "../../config/env": { env: {} }, "./origins": { getAllowedOrigins: () => new Set() },
}).applySecurity({ use() {} });
assert.ok(!format.includes(":url") && !format.includes(":referrer"));
assert.match(fs.readFileSync("success.html", "utf8"), /reconcile\?t=/);
assert.match(fs.readFileSync("server.js", "utf8"), /reconcile\$\{extractQuerySuffix\(req\)\}/);
console.log("Order access, expiry, legacy recovery, revocation, authorized reconciliation and private analytics/logging pass.");
