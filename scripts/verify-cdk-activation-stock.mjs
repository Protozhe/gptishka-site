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
assert.equal(ui.matchesActivationStockFilter("codex-250", result.stats.byActivationSite, "empty"), false);
assert.equal(ui.matchesActivationStockFilter("codex-500", result.stats.byActivationSite, "low"), true);
assert.equal(ui.matchesActivationStockFilter("chatgpt-plus-1", result.stats.byActivationSite, "empty"), true);
assert.equal(ui.matchesActivationStockFilter(null, result.stats.byActivationSite, "empty"), false);
assert.equal(ui.matchesActivationStockFilter("codex-250", undefined, "empty"), false);
const historicalFixture = plain(result.stats.byActivationSite);
historicalFixture["chatgpt-plus-1"][""] = {unused:0,used:8,reserved:0,archived:1,total:9};
const beforePresentation=JSON.stringify(historicalFixture);
const presentation=ui.visibleActivationPools("chatgpt-plus-1",historicalFixture);
assert.equal(presentation.current.length,2,"Both configured channels remain visible even with zero stock");
assert.equal(presentation.historical.length,1,"Used-only unbound keys must not create a false empty-channel warning");
assert.equal(JSON.stringify(historicalFixture),beforePresentation,"Presentation never mutates stock");

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

// Exercise filtering on the real page while an import draft is open.
const require=createRequire(import.meta.url), React=require("react"), {JSDOM}=require("jsdom");
const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:"http://localhost/"});
const globals={window:dom.window,document:dom.window.document,navigator:dom.window.navigator,IS_REACT_ACT_ENVIRONMENT:true};
const previous=new Map(Object.keys(globals).map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
for(const [key,value] of Object.entries(globals))Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});
const {createRoot}=require("react-dom/client"),{Simulate}=require("react-dom/test-utils");
const fixtures=[250,500,1000].map(size=>({id:`fixture-${size}`,slug:`codex-${size}`,title:`Codex ${size}`,deliveryType:"activation"}));
let writes=0;
const Page=load("apps/admin-ui/src/pages/CdkKeysPage.tsx",{
  "../components/CdkStockBreakdown":ui,
  "../components/ProductDurationEditor":{compareProductsByFamilyAndDuration:()=>0,getProductDurationLabel:()=>"",ProductDurationEditor:()=>React.createElement("span",null,"fixture-duration-editor")},
  "../lib/api":{api:{post(){writes++;throw Error("Unexpected write during filtering");}}},
  "@tanstack/react-query":{
    useQueryClient:()=>({invalidateQueries(){}}),
    useQuery:({queryKey})=>({isLoading:false,isFetching:false,isError:false,data:queryKey[0]==="products"?{items:fixtures}:queryKey[1]==="all-pool-stats"?result:{items:[],total:0},refetch(){}}),
    useMutation:()=>({isPending:false,mutate(){writes++;throw Error("Unexpected mutation during filtering");}}),
  },
}).default;
const container=dom.window.document.getElementById("root"),reactRoot=createRoot(container);
const mainRows=()=>[...container.querySelectorAll(".cdk-page > .cdk-inventory-section .cdk-product-row")];
const rowFor=name=>mainRows().find(row=>row.textContent.includes(name));
try{
  await React.act(async()=>reactRoot.render(React.createElement(Page)));
  assert.equal(mainRows().length,3);
  await React.act(async()=>rowFor("Codex 250").querySelector("button").click());
  const textarea=container.querySelector("textarea");
  await React.act(async()=>Simulate.change(textarea,{target:{value:"FIXTURE-UNSAVED-DRAFT"}}));
  const emptyButton=[...container.querySelectorAll(".cdk-stock-filters button")].find(button=>button.textContent.includes("Пустые каналы"));
  await React.act(async()=>emptyButton.click());
  assert(rowFor("Codex 250"),"Open product stays mounted outside its stock filter");
  assert.equal(container.querySelector("textarea").value,"FIXTURE-UNSAVED-DRAFT");
  assert(container.querySelector(".cdk-pinned-notice"));
  const search=container.querySelector('input[placeholder="Название товара или номинал"]');
  await React.act(async()=>Simulate.change(search,{target:{value:"500"}}));
  assert.equal(mainRows().length,2,"Search keeps only its match and the open form");
  assert.equal(container.querySelector("textarea").value,"FIXTURE-UNSAVED-DRAFT");
  await React.act(async()=>rowFor("Codex 250").querySelector("button").click());
  assert.equal(mainRows().length,1);
  assert(rowFor("Codex 500"));
  assert.equal(writes,0,"Search, filters and disclosure must not write or activate anything");
}finally{
  await React.act(async()=>reactRoot.unmount());dom.window.close();
  for(const [key,descriptor] of previous){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}
}
console.log("CDK activation stock: complete supplier counts, zero pools, unknown bindings, reservation/archive separation and guarded count-only HTTP contract passed.");
