import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";

// Execute the shipped TypeScript with isolated DB and HTTP transports.
const root = new URL("../", import.meta.url);
function load(name, mocks = {}, suffix = "") {
  const file = new URL(name, root), module = { exports: {} }, nativeRequire = createRequire(file);
  const code = ts.transpileModule(fs.readFileSync(file, "utf8") + suffix, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(code, {
    module, exports: module.exports, URL, __dirname: "fixture",
    require: name => Object.hasOwn(mocks, name) ? mocks[name] : nativeRequire(name),
  }, { filename: file.pathname });
  return module.exports;
}
const base = "apps/admin-backend/src/";
const errors = load(base + "common/errors/app-error.ts");
const sites = load(base + "common/utils/activation-site.ts");
const products = load(base + "common/utils/product-key.ts");
const supplierHelpers = load(base + "modules/cdks/codex-key-suppliers.ts", {
  "../../common/errors/app-error": errors, "../../common/utils/activation-site": sites,
  "../../common/utils/product-key": products,
});
const keys = [], audits = [];
let nextId = 0, transactionTail = Promise.resolve();
const keyModel = {
  async findMany({ where, take }) {
    return keys.filter(row => where.keyValue ? where.keyValue.in.includes(row.keyValue)
      : row.productKey === where.productKey && row.orderId === where.orderId && where.status.in.includes(row.status)).slice(0, take);
  },
  async createMany({ data }) {
    let count = 0;
    for (const row of data) if (!keys.some(key => key.keyValue === row.keyValue)) {
      keys.push({ ...row, id: `fixture-${++nextId}`, createdAt: new Date(nextId), updatedAt: new Date(nextId), usedAt: null, reservedAt: null, orderId: null, email: null });
      count++;
    }
    return { count };
  },
  async updateMany({ where, data }) {
    const row = keys.find(key => key.id === where.id && key.status === where.status
      && (!Object.hasOwn(where,'activationSiteUrl') || key.activationSiteUrl === where.activationSiteUrl)
      && (!Object.hasOwn(where,'orderId') || key.orderId === where.orderId));
    if (!row) return { count: 0 };
    Object.assign(row, data); return { count: 1 };
  },
  async findUnique({ where }) { return keys.find(key => key.id === where.id) || null; },
};
const tx = {
  licenseKey: keyModel,
  licenseKeyAuditLog: { async create({ data }) { audits.push(data); }, async findFirst({where}) { return audits.find(row=>row.keyId===where.keyId&&row.action===where.action)||null; } },
  async $queryRaw(strings, ...values) {
    const sql = strings.join("?");
    if (sql.includes("pg_advisory_xact_lock")) { assert.match(sql, /hashtext/); return []; }
    if (sql.includes('WHERE id =')) return [];
    assert.match(sql, /FOR UPDATE SKIP LOCKED/);
    assert.match(sql, /status = 'available'/);
    assert.match(sql, /ORDER BY CASE/);
    const [productKey, primary, secondary, exclude, sameExclude, priority] = values;
    assert.equal(exclude, sameExclude); assert.equal(priority, primary);
    return keys.filter(key => key.productKey === productKey && [primary, secondary].includes(key.activationSiteUrl)
      && key.status === "available" && (!exclude || key.keyValue !== exclude))
      .sort((a, b) => Number(b.activationSiteUrl === primary) - Number(a.activationSiteUrl === primary) || a.createdAt - b.createdAt)
      .slice(0, 1).map(({ id }) => ({ id }));
  },
};
const prisma = {
  ...tx, product: { async findUnique() { return null; } },
  async $transaction(fn) {
    const previous = transactionTail; let release;
    transactionTail = new Promise(resolve => { release = resolve; });
    await previous;
    try { return await fn(tx); } finally { release(); }
  },
};
const { licenseService } = load(base + "services/licenseService.ts", {
  "../config/prisma": { prisma }, "../common/errors/app-error": errors,
  "../common/utils/activation-site": sites, "../common/utils/product-key": products,
  "../modules/cdks/chatgpt-plus-pool-validation": { validateChatGptPlusKeyImport: () => null },
  "../modules/cdks/codex-key-suppliers": supplierHelpers,
});
const { cdkKeysStore } = load(base + "modules/cdks/cdk-keys.store.ts", {
  "../../services/licenseService": { licenseService }, "./codex-key-suppliers": supplierHelpers,
  "../../common/utils/activation-site": sites, "../../common/utils/product-key": products,
});
const origins = ["https://aichongzhi.fun", "https://aiee.fun"];
for (const size of [250, 500, 1000]) {
  for (const [index, supplier] of ["aibuy", "aisou"].entries()) {
    const result = await cdkKeysStore.importCodes({ productKey: `codex-${size}`, supplier, codes: [`FIXTURE-${supplier}-${size}`] });
    assert.equal(result.inserted, 1); assert.equal(result.activationSiteUrl, origins[index]);
  }
}
for (const bad of [
  { productKey: "codex-2500", supplier: "aibuy" },
  { productKey: "chatgpt-plus-1", supplier: "aisou" },
  { productKey: "codex-500", supplier: "aibuy", activationSiteUrl: origins[1] },
  { productKey: "codex-500", supplier: "aisou", activationSiteUrl: "invalid" },
]) await assert.rejects(() => cdkKeysStore.importCodes({ ...bad, codes: ["FIXTURE-INVALID"] }), e => e.statusCode === 400);
assert.ok(!keys.some(row => row.keyValue === "FIXTURE-INVALID"));
const duplicate = await cdkKeysStore.importCodes({ productKey: "codex-250", supplier: "aisou", codes: ["FIXTURE-aibuy-250"] });
assert.equal(duplicate.inserted, 0); assert.equal(duplicate.conflicts, 1);
assert.equal(keys.find(row => row.keyValue === "FIXTURE-AIBUY-250").activationSiteUrl, origins[0]);
const held500 = keys.find(row => row.keyValue === "FIXTURE-AISOU-500"); held500.status = "reserved";
function reserve(size, orderId) {
  return cdkKeysStore.assignNextUnused({ productKey: `codex-${size}`, orderId, email: "fixture@example.invalid", activationSiteUrls: origins });
}
for (const size of [250, 500, 1000]) {
  const [first, repeat] = await Promise.all([reserve(size, `fixture-order-${size}`), reserve(size, `fixture-order-${size}`)]);
  assert.equal(first.activationSiteUrl, origins[0], "AI-BUY stock takes priority over AISOU");
  assert.equal(repeat.id, first.id, "A repeated or interrupted start reuses its assignment");
  assert.equal(audits.filter(row => row.action === "assign" && row.meta.orderId === `fixture-order-${size}`).length, 1);
}
const fallback = await reserve(250, "fixture-second-250");
assert.equal(fallback.activationSiteUrl, origins[1]);
assert.equal(audits.at(-1).meta.activationSiteUrl, origins[1], "Audit records the actual supplier");
assert.equal(await reserve(500, "fixture-second-500"), null, "Do not use held500 or another denomination");
assert.equal(held500.status, "reserved"); assert.equal(held500.orderId, null);
assert.equal(await reserve(2500, "fixture-2500"), null, "Do not substitute 1000 for 2500");
keys.push({ ...keys[0], id: "fixture-extra-bound", keyValue: "FIXTURE-EXTRA", orderId: "fixture-order-250", status: "used" });
await assert.rejects(() => reserve(250, "fixture-order-250"), e => e.statusCode === 409);

// The HTTP contract accepts supplier-only imports, preserves legacy URL imports,
// and rejects unknown sources and contradictory supplier/site pairs.
const validation = load(base + "common/middleware/validation.ts", { "../errors/app-error": errors });
const asyncHandlers = load(base + "common/http/async-handler.ts");
const { cdkKeysRouter } = load(base + "modules/cdks/cdks.routes.ts", {
  "./cdk-keys.store": { cdkKeysStore }, "../../services/licenseService": { licenseService },
  "../auth/auth.middleware": { requireAuth: (_req, _res, next) => next(), allowRoles: () => (_req, _res, next) => next() },
  "../../common/middleware/validation": validation, "../../common/http/async-handler": asyncHandlers,
});
const require = createRequire(import.meta.url), express = require("express");
const app = express(); app.use(express.json()); app.use("/cdks", cdkKeysRouter);
app.use((error, _req, res, _next) => res.status(error.status || error.statusCode || 500).json({ message: error.message }));
const server = await new Promise(resolve => { const server = app.listen(0, "127.0.0.1", () => resolve(server)); });
try {
  for (const [body, expected] of [
    [{ productKey: "codex-1000", supplier: "aibuy", text: "FIXTURE-HTTP-1000" }, 201],
    [{ productKey: "codex-250", activationSiteUrl: origins[1] + "/", text: "FIXTURE-LEGACY-250" }, 201],
    [{ productKey: "codex-500", supplier: "unknown", text: "FIXTURE-REJECTED" }, 422],
    [{ productKey: "codex-500", supplier: "aibuy", activationSiteUrl: origins[1], text: "FIXTURE-REJECTED" }, 400],
    [{ productKey: "codex-2500", supplier: "aibuy", text: "FIXTURE-REJECTED" }, 400],
  ]) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/cdks/import`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    assert.equal(response.status, expected, JSON.stringify(body));
  }
  const legacyKey=keys.find(row=>row.keyValue==='FIXTURE-LEGACY-250');
  for(const [id,body,status] of [
    [legacyKey.id,{supplier:'aibuy',expectedActivationSiteUrl:origins[1]},200],
    [legacyKey.id,{supplier:'aisou',expectedActivationSiteUrl:origins[1]},409],
    [held500.id,{supplier:'aibuy',expectedActivationSiteUrl:origins[1]},409],
  ]) {
    const response=await fetch(`http://127.0.0.1:${server.address().port}/cdks/${id}/supplier`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    assert.equal(response.status,status);
  }
} finally { await new Promise(resolve => server.close(resolve)); }
assert.ok(!keys.some(row => row.keyValue === "FIXTURE-REJECTED"));
const editable = keys.find(row => row.keyValue === 'FIXTURE-HTTP-1000');
assert.equal((await licenseService.changeUnusedCodexSupplier(editable.id,'aisou',origins[0])).activationSiteUrl,origins[1]);
await assert.rejects(()=>licenseService.changeUnusedCodexSupplier(editable.id,'aibuy',origins[0]),e=>e.statusCode===409);
for(const protectedKey of [held500,keys.find(row=>row.status==='used')]) {
  await assert.rejects(()=>licenseService.changeUnusedCodexSupplier(protectedKey.id,'aibuy',protectedKey.activationSiteUrl),e=>e.statusCode===409);
}
const marketKey=keys.find(row=>row.status==='used');
audits.push({keyId:marketKey.id,action:'assign_marketplace_stock'});
await assert.rejects(()=>licenseService.returnToAvailable(marketKey.id),e=>e.statusCode===409);
assert.equal(marketKey.status,'used');

// Exercise the real native activation start, stopping at the mocked provider.
const orderSource = fs.readFileSync(new URL(base + "modules/orders/orders.service.ts", root), "utf8");
const ast = ts.createSourceFile("orders.ts", orderSource, ts.ScriptTarget.Latest, true);
const start = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "startActivationUnsafe").getText(ast);
let stored, providerRequest, procurementCalls = 0, wrongToken = false;
const context = vm.createContext({
  ...errors, MAX_CLIENT_TOKEN_LENGTH: 50000, MAX_ACTIVATION_START_ATTEMPTS: 3,
  CHATGPT_PLUS_PRODUCT_KEY: "chatgpt-plus-1", env: { ACTIVATION_PROVIDER: "chongzhi" },
  ordersService: { getActivation: async () => ({ productSlug: stored.productKey }) },
  assertTokenActivationDeliveryMode() {}, ensureActivationRecordForTokenFlow: async () => stored,
  parseClientTokenInput: raw => ({ raw, extracted: "fixture-session", json: { account: { planType: "pro" } } }),
  isCodexCreditsProductKey: value => /^codex-(250|500|1000|2500)$/.test(value), validateAieeSessionJson: () => null,
  isSupportTokenActivationMode: () => false, isAisouGrokProduct: () => false,
  buildStoredClientTokenPatch: () => ({ clientTokenCiphertext: "fixture-encrypted" }),
  normalizeActivationRecordForRead: value => value, buildTokenMeta: () => ({}),
  isTokenBoundToAnotherFingerprint: () => wrongToken,
  getOrderWithFirstItem: async () => ({ source: "site" }), resolveExternalCodexOwner: () => null,
  resolveChatGptPlanType: () => "pro",
  readActivationSiteUrlFromOrderDetails: () => "",
  selectChatGptPlusCandidate: async record => ({ record, forceOverwrite: false }),
  assertPaidOrderAccess: async orderId => ({ id: orderId, email: "fixture@example.invalid" }),
  activationStore: {
    findByOrderId: () => stored, upsert: row => { stored = row; },
    reserveCdkRecordForOrder: async input => {
      const row = await cdkKeysStore.assignNextUnused(input);
      return row ? { code: row.code, activationSiteUrl: row.activationSiteUrl } : null;
    },
  },
  procureSelectedWebsiteKey: async () => { procurementCalls++; return null; },
  buildUpstreamUserCandidates: () => ["fixture-session"], isIosProviderBase: () => false,
  isAieeProviderBase: site => site === origins[1],
  startOutstockTaskWithRetry: async input => {
    providerRequest = input; input.beforeSubmit(); throw new Error("fixture-provider-reached");
  },
});
vm.runInContext(ts.transpileModule(start, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
await cdkKeysStore.importCodes({productKey:'codex-500',supplier:'aibuy',codes:['FIXTURE-START-AIBUY']});
stored={orderId:'fixture-no-aisou',productKey:'codex-500',status:'issued',attempts:0,activationSiteUrl:origins[1],cdk:''};
await assert.rejects(()=>context.startActivationUnsafe(stored.orderId,'{"fixture":true}'),e=>e.statusCode===409);
assert.equal(providerRequest,undefined,'Empty AISOU stock does not use an AI-BUY key');
assert.equal(procurementCalls,0,'Empty AISOU stock must not start supplier purchases');
await cdkKeysStore.importCodes({productKey:'codex-500',supplier:'aisou',codes:['FIXTURE-START-AISOU']});
const legacyKey=await cdkKeysStore.assignNextUnused({productKey:'codex-500',activationSiteUrl:origins[0],orderId:'fixture-existing-aibuy',email:'fixture@example.invalid'});
for (const [supplier,cdk,site] of [['aisou','',origins[1]],['aibuy',legacyKey.code,origins[0]]]) {
  stored = { orderId: `fixture-start-${supplier}`, productKey: "codex-500", status: "issued", attempts: 0, activationSiteUrl: site, cdk };
  await assert.rejects(() => context.startActivationUnsafe(stored.orderId, '{"fixture":true}'), /fixture-provider-reached/);
  assert.equal(providerRequest.activationSiteUrl, site, "New starts use AISOU; an already-bound AI-BUY key retains its site");
  assert.equal(providerRequest.cdk, `FIXTURE-START-${supplier.toUpperCase()}`);
  assert.equal(stored.status, "processing"); assert.equal(stored.attempts, 1);
  const before = keys.filter(row => row.status === "used").length;
  assert.equal((await context.startActivationUnsafe(stored.orderId, '{"fixture":true}')).reused, true);
  assert.equal(keys.filter(row => row.status === "used").length, before);
  wrongToken = true;
  await assert.rejects(() => context.startActivationUnsafe(stored.orderId, '{"fixture":true}'), e => e.statusCode === 409);
  wrongToken = false;
}
assert.equal(procurementCalls, 0, "Existing matching stock avoids any new purchase");

let previousSupplier,aisouRecovery=0,aibuyRecovery=0,aibuyEnabled=true;
const recovery=load(base+'services/aisou-procurement.ts',{
  path:{default:{resolve:(...parts)=>parts.at(-1).split('/').at(-1)}},
  '../config/prisma':{prisma:{order:{findUnique:async()=>({id:'fixture-paid'})}}},
  '../modules/orders/activation.store':{activationStore:{findByOrderId:()=>previousSupplier?{lastProviderPayload:{supplierProcurement:{provider:previousSupplier}}}:null}},
  '../common/errors/app-error':errors,
  '../modules/notifications/notifications.service':{sendTelegramNotification:()=>{throw Error('No real notifications')}},
  'aisou-live.cjs':{procureWebsiteKey:async()=>{aisouRecovery++;return {keyId:'fixture-aisou',code:'FIXTURE',activationSiteUrl:origins[1]}}},
  'aibuy-live.cjs':{policy:()=>({}),managed:()=>aibuyEnabled,procure:async()=>{aibuyRecovery++;return {keyId:'fixture-aibuy',code:'FIXTURE',activationSiteUrl:origins[0]}}},
});
for(const size of [250,500,1000])assert.equal(await recovery.procureSelectedWebsiteKey({orderId:'fixture-paid',productKey:'codex-'+size,accountPlan:'pro',activationSiteUrl:origins[1]}),null);
assert.equal(aisouRecovery+aibuyRecovery,0,'Fresh Codex requests cannot start a new supplier purchase');
for(const supplier of ['aisou','aibuy']){
  previousSupplier=supplier;
  const result=await recovery.procureSelectedWebsiteKey({orderId:'fixture-paid',productKey:'codex-500',accountPlan:'pro',activationSiteUrl:origins[1]});
  assert.equal(result.activationSiteUrl,supplier==='aisou'?origins[1]:origins[0],'An existing purchase recovers with the same supplier');
}
aibuyEnabled=false;previousSupplier='aibuy';
assert.equal(await recovery.procureSelectedWebsiteKey({orderId:'fixture-paid',productKey:'codex-500',accountPlan:'pro',activationSiteUrl:origins[1]}),null);
assert.equal(aisouRecovery,1,'A blocked legacy AI-BUY purchase must not switch suppliers');

// Interact with the actual React import form using fixture keys and a mock API.
const { JSDOM } = require("jsdom"), React = require("react");
const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: "http://localhost/" });
const globals = { window: dom.window, document: dom.window.document, navigator: dom.window.navigator, IS_REACT_ACT_ENVIRONMENT: true };
const previousGlobals = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
const { createRoot } = require("react-dom/client"), { Simulate } = require("react-dom/test-utils");
const posts = [];
const { KeyProductColumn, ActivationTable } = load("apps/admin-ui/src/pages/CdkKeysPage.tsx", {
  "../lib/api": { api: { async post(path, body) { posts.push({ path, body }); return { data: { inserted: 1, skipped: 0 } }; } } },
  "@tanstack/react-query": {
    useQueryClient: () => ({ invalidateQueries() {} }),
    useQuery: () => ({ data: { items: [], stats: { unused: 0, used: 0 } }, isLoading: false }),
    useMutation: options => ({ mutate: async () => { const data = await options.mutationFn(); options.onSuccess?.(data); }, isPending: false }),
  },
  "../components/ProductDurationEditor": { getProductDurationLabel: () => "", compareProductsByFamilyAndDuration: () => 0, ProductDurationEditor: () => null },
}, "\nexport { KeyProductColumn, ActivationTable };\n");
const container = dom.window.document.getElementById("root"), reactRoot = createRoot(container);
try {
  for (const size of [250, 500, 1000]) {
    await React.act(async () => reactRoot.render(React.createElement(KeyProductColumn, {
      key: size, product: { id: `fixture-${size}`, slug: `codex-${size}`, title: `Codex ${size}` }, search: "",
    })));
    assert.equal(container.querySelectorAll('input[type="radio"]').length, 2);
    const textarea = container.querySelector("textarea"), form = container.querySelector("form");
    await React.act(async () => Simulate.change(textarea, { target: { value: "FIXTURE-UI" } }));
    const before = posts.length;
    await React.act(async () => Simulate.submit(form));
    assert.equal(posts.length, before, "An explicit supplier choice is required");
    assert.match(container.textContent, /Выберите поставщика ключей/);
    for (const [index, supplier] of ["aibuy", "aisou"].entries()) {
      await React.act(async () => Simulate.change(container.querySelectorAll('input[type="radio"]')[supplier==='aisou'?0:1]));
      await React.act(async () => Simulate.change(textarea, { target: { value: "FIXTURE-UI" } }));
      await React.act(async () => Simulate.submit(form));
      assert.equal(posts.at(-1).path, "/cdks/import");
      assert.equal(posts.at(-1).body.supplier, supplier);
      assert.equal(posts.at(-1).body.activationSiteUrl, origins[index]);
      assert.equal(posts.at(-1).body.productKey, `codex-${size}`);
    }
  }
  let changedSupplier;
  const item={id:'fixture-edit',code:'FIXTURE-UI',productKey:'codex-500',status:'unused',activationSiteUrl:origins[1],createdAt:new Date().toISOString()};
  await React.act(async()=>reactRoot.render(React.createElement(ActivationTable,{items:[item],loading:false,onChangeSupplier:(row,supplier)=>{changedSupplier={row,supplier};}})));
  await React.act(async()=>Simulate.change(container.querySelector('select[aria-label="Поставщик ключа"]'),{target:{value:'aibuy'}}));
  assert.equal(changedSupplier.supplier,'aibuy');assert.equal(changedSupplier.row.id,item.id);
  await React.act(async()=>reactRoot.render(React.createElement(ActivationTable,{items:[{...item,status:'used'}],loading:false,onChangeSupplier(){throw Error('Used key must not be editable')}})));
  assert.equal(container.querySelector('select[aria-label="Поставщик ключа"]'),null);
} finally {
  await React.act(async () => reactRoot.unmount()); dom.window.close();
  for (const [key, descriptor] of previousGlobals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
  }
}
console.log("Codex supplier import API, exact pools, held stock, atomic priority, recovery, native routes and duplicate protection verified.");
