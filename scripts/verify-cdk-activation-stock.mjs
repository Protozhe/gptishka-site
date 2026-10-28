import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";

const root = new URL("../", import.meta.url);
function load(name, mocks = {}) {
  const file = new URL(name, root), module = { exports: {} }, require = createRequire(file);
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(code, {
    module, exports: module.exports, URL,
    require: name => Object.hasOwn(mocks, name) ? mocks[name] : require(name),
  }, { filename: file.pathname });
  return module.exports;
}
const plain = value => JSON.parse(JSON.stringify(value));
const base = "apps/admin-backend/src/";
const sites = load(base + "common/utils/activation-site.ts");
const rows = [
  ["codex-250", "https://aiee.fun", "available", 250],
  ["codex-250", "https://aiee.fun/#/", "available", 5],
  ["codex-250", "https://aiee.fun", "reserved", 2],
  ["codex-250", "https://aiee.fun", "used", 9],
  ["codex-250", "https://aiee.fun", "revoked", 4],
  ["codex-250", "https://aichongzhi.fun", "available", 7],
  ["codex-500", "https://aichongzhi.fun", "available", 3],
  ["codex-1000", "", "available", 8],
  ["codex-1000", "invalid-site", "available", 1],
  ["chatgpt-plus-1", "https://vip.sxzfd.com", "available", 4],
  ["chatgpt-plus-1", "https://9977ai.vip/go.php", "available", 2],
  ["chatgpt-plus-1", "https://aiee.fun", "used", 1],
  ["grok-1-sdk4", "", "available", 12],
  ["claude-pro-sdk5", "", "available", 13],
].map(([productKey, activationSiteUrl, status, count]) => ({ productKey, activationSiteUrl, status, _count: { _all: count } }));
let queries = 0;
const { readCdkInventory } = load(base + "modules/cdks/cdk-inventory.ts", {
  "../../common/utils/activation-site": sites,
  "../../config/prisma": { prisma: { licenseKey: {
    async groupBy(query) {
      queries++;
      assert.deepEqual(plain(query), { by: ["productKey", "activationSiteUrl", "status"], _count: { _all: true } });
      return rows;
    },
    findMany() { throw new Error("Stock summaries must never read key values or customer rows"); },
  } } },
});
const result = await readCdkInventory();
assert.equal(queries, 1, "One aggregation covers all products and all pages");
assert.deepEqual(plain(result.stats.byProduct["codex-250"]), { unused: 262, used: 15, total: 277 });
assert.deepEqual(plain(result.stats.byActivationSite["codex-250"]["https://aiee.fun"]), { unused: 255, used: 9, reserved: 2, archived: 4, total: 270 });
assert.equal(result.stats.byActivationSite["codex-250"]["https://aichongzhi.fun"].unused, 7);
assert.equal(result.stats.byActivationSite["chatgpt-plus-1"]["https://vip.sxzfd.com"].unused, 6);
assert.equal(result.stats.byActivationSite["codex-1000"][""].unused, 9, "Unknown bindings remain separate from both known suppliers");
assert.doesNotMatch(JSON.stringify(result), /keyValue|orderId|email|token/i);

const ui = load("apps/admin-ui/src/components/CdkStockBreakdown.tsx");
const codex = ui.activationPools("codex-250", result.stats.byActivationSite);
assert.equal(codex.length, 2);
assert.equal(codex[0].title, "AISOU / AIEE"); assert.equal(codex[0].unused, 255);
assert.equal(codex[1].title, "AI-BUY"); assert.equal(codex[1].unused, 7);
const plus = ui.activationPools("chatgpt-plus-1", result.stats.byActivationSite);
assert.equal(plus[0].unused, 6); assert.match(plus[0].title, /iOS/);
assert.equal(plus[1].unused, 0); assert.match(plus[1].title, /Free/);
for (const product of ["codex-250", "codex-500", "codex-1000", "chatgpt-plus-1"]) {
  const empty = ui.activationPools(product, {});
  assert.equal(empty.length, 2, `${product}: both empty activation channels must remain visible`);
  assert.ok(empty.every(pool => pool.unused === 0));
}
assert.equal(ui.activationPools("codex-1000", result.stats.byActivationSite).find(pool => pool.siteUrl === "").title, "Способ не указан");
assert.equal(ui.activationPoolLabel("grok-1-sdk4", "").title, "SDK · Grok");
assert.equal(ui.activationPoolLabel("claude-pro-sdk5", "").title, "SDK · Claude");
assert.equal(ui.activationPoolLabel("gemini-pro-18", "").title, "Ссылки Gemini");
assert.equal(ui.activationPools("other-product", {}, "https://example.invalid/activate/")[0].unused, 0);
assert.equal(ui.CdkStockBreakdown({ productKey: "codex-250", inventory: undefined }), null, "Missing statistics must not be rendered as empty stock");

// The new count-only endpoint shares the existing CDK authentication and roles.
const guards = [(_req, _res, next) => next(), (_req, _res, next) => next()];
const { cdkKeysRouter } = load(base + "modules/cdks/cdks.routes.ts", {
  "./cdk-inventory": { readCdkInventory },
  "./cdk-keys.store": { cdkKeysStore: {} }, "../../services/licenseService": { licenseService: {} },
  "../auth/auth.middleware": {
    requireAuth: guards[0],
    allowRoles(roles) { assert.deepEqual(plain(roles), ["OWNER", "ADMIN", "MANAGER"]); return guards[1]; },
  },
  "../../common/middleware/validation": { validateBody: () => guards[0], validateQuery: () => guards[0] },
  "../../common/http/async-handler": { asyncHandler: handler => handler },
});
assert.equal(cdkKeysRouter.stack[0].handle, guards[0]);
assert.equal(cdkKeysRouter.stack[1].handle, guards[1]);
const inventoryRoute = cdkKeysRouter.stack.find(layer => layer.route?.path === "/inventory").route;
let body;
await inventoryRoute.stack[0].handle({}, { json(value) { body = value; } });
assert.deepEqual(plain(body), plain(result));
assert.ok(queries === 2);
console.log("CDK activation stock: complete supplier counts, zero pools, unknown bindings, reservation/archive separation and guarded count-only HTTP contract passed.");
