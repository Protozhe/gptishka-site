import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";

// Run the real orders page with isolated transports. Never contact a payment,
// activation provider, customer or production API from this regression check.
const require = createRequire(import.meta.url), React = require("react");
const { JSDOM } = require("jsdom"), query = require("@tanstack/react-query");
const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: "http://localhost/admin/orders" });
const globals = { window: dom.window, document: dom.window.document, navigator: dom.window.navigator, IS_REACT_ACT_ENVIRONMENT: true };
const previous = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
const { createRoot } = require("react-dom/client"), { Simulate } = require("react-dom/test-utils");
const fixtures = [
  { id: "fixture-paid", status: "PAID", paymentStatus: "SUCCESS", activation: { status: "issued", tokenStored: true, tokenValidationAttempts: 4, attempts: 0 }, checkoutDetails: { contact: { email: "buyer@example.invalid", telegram: "@fixture_buyer" }, account: { status: "has_account", credentialsEncrypted: true, password: "FIXTURE-NEVER-RENDER" }, attribution: { lastTouch: { source: "yandex", medium: "cpc", yclid: "fixture-click" } } } },
  { id: "fixture-retry", status: "FAILED", paymentStatus: "PROCESSING", activation: { status: "failed" } },
  { id: "fixture-done", status: "PAID", paymentStatus: "SUCCESS", activation: { status: "success" } },
  { id: "fixture-pending", status: "PENDING", paymentStatus: "PROCESSING", source: "telegram", botType: "chatgpt", email: "tg_chatgpt_12345678@telegram.local", telegramUsername: "fixture_user" },
  { id: "fixture-refunded", status: "REFUNDED", paymentStatus: "REFUNDED" },
].map(order => ({ createdAt: "2026-10-28T09:00:00Z", source: "site", currency: "RUB", totalAmount: 2290, email: "buyer@example.invalid", paymentMethod: "pally", product: { title: "Тестовый продукт", slug: "fixture-product", quantity: 1, unitPrice: 2290 }, ...order }));
const requests = [], copied = [];
let confirm = false, proofDeferred, proofFailure = false;
dom.window.confirm = () => confirm;
Object.defineProperty(dom.window.navigator, "clipboard", { value: { async writeText(value) { copied.push(value); } } });
const response = data => Promise.resolve({ data });
const api = {
  get(url, config) {
    requests.push({ method: "GET", url, params: config?.params });
    if (url === "/orders") {
      const { status, q } = config?.params || {};
      return response({ items: fixtures.filter(order => (!status || status === order.status) && (!q || `${order.id} ${order.email}`.includes(q))), total: fixtures.length });
    }
    const id = url.split("/")[2];
    if (url.endsWith("/activation-proof")) {
      if (proofFailure) return Promise.reject(Object.assign(new Error("fixture error"), { isAxiosError: true, response: { status: 403, data: { message: "Нет доступа к тестовой проверке" } } }));
      if (proofDeferred) return proofDeferred;
      return response({ certainty: { code: "ACTIVATED_CONFIRMED_PROVIDER" }, activation: { lastProviderMessage: "fixture stale message" } });
    }
    if (url.endsWith("/activation-token")) return response({ orderId: id, token: `FIXTURE-TOKEN-${id}` });
    if (url.endsWith("/activation-link")) return response({ orderId: id, activationUrl: `https://example.invalid/activate/${id}` });
    if (url.endsWith("/manual-login-credentials")) return response({ login: "fixture-login", password: "fixture-password" });
    throw Error(`Unexpected isolated GET: ${url}`);
  },
  post(url, body) {
    requests.push({ method: "POST", url, body });
    if (url.endsWith("/activation-link/revoke")) return response({ orderId: url.split("/")[2], activationUrl: "https://example.invalid/reissued", deliveryType: "activation" });
    assert.match(url, /^\/orders\/fixture-[a-z]+\/(refund|activation\/manual-complete)$/);
    return response({ ok: true });
  },
  patch(url, body) { requests.push({ method: "PATCH", url, body }); assert.match(url, /^\/orders\/fixture-[a-z]+\/status$/); return response({ ok: true }); },
};
function load(name, mocks = {}) {
  const file = new URL(`../${name}`, import.meta.url), module = { exports: {} }, localRequire = createRequire(file);
  const source = fs.readFileSync(file, "utf8").replaceAll("import.meta.env", "({})");
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, window: dom.window, navigator: dom.window.navigator, setTimeout, clearTimeout, require: name => Object.hasOwn(mocks, name) ? mocks[name] : localRequire(name) }, { filename: file.pathname });
  return module.exports;
}
const Page = load("apps/admin-ui/src/pages/OrdersPage.tsx", { "../lib/api": { api }, "../lib/format": load("apps/admin-ui/src/lib/format.ts") }).default;
const client = new query.QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
const container = dom.window.document.getElementById("root"), root = createRoot(container);
const row = id => container.querySelector(`[aria-label="Заказ ${id}"]`);
const button = (scope, label) => [...scope.querySelectorAll("button")].find(el => el.textContent.trim() === label);
const settle = async (ms = 20) => React.act(async () => { await new Promise(resolve => setTimeout(resolve, ms)); });
async function click(scope, label) { const el = button(scope, label); assert(el, `Button missing: ${label}`); assert.equal(el.disabled, false, `Button disabled: ${label}`); await React.act(async () => el.click()); await settle(); }
const last = () => requests.at(-1);
const writes = () => requests.filter(item => item.method !== "GET");
async function change(el, value, delay = 20) { await React.act(async () => Simulate.change(el, { target: { value } })); await settle(delay); await settle(); }
try {
  await React.act(async () => root.render(React.createElement(query.QueryClientProvider, { client }, React.createElement(Page)))); await settle();
  assert.equal(container.querySelectorAll(".orders-order-card").length, 5);
  assert.equal(writes().length, 0, "Rendering never changes an order");
  assert.equal(container.querySelector('a[href="/api/admin/orders/export/csv"]').textContent, "Экспорт CSV");
  assert.equal(row("fixture-pending").textContent.includes("tg_chatgpt_"), false, "Synthetic Telegram addresses remain hidden");
  assert.match(row("fixture-pending").textContent, /@fixture_user/);
  assert.equal(button(row("fixture-done"), "Отметить активированным").disabled, true);
  assert.equal(button(row("fixture-pending"), "Ссылка активации"), undefined);
  assert(button(row("fixture-paid"), "Ссылка активации"));
  assert.equal(button(row("fixture-done"), "Логин и пароль Devin"), undefined);
  assert(button(row("fixture-paid"), "Логин и пароль Devin"));
  assert.equal(button(row("fixture-pending"), "Вернуть в ожидание"), undefined);
  assert(button(row("fixture-retry"), "Вернуть в ожидание"));
  assert.equal(button(row("fixture-pending"), "Все данные клиента"), undefined);
  assert.equal(container.textContent.includes("FIXTURE-NEVER-RENDER"), false, "Customer password must not leak into previews");
  const details = row("fixture-paid").querySelector("details");
  assert.equal(details.open, false); assert.match(details.textContent, /fixture-click/); assert.match(details.textContent, /repeated \(4x\)/);
  assert.equal(row("fixture-paid").querySelector(".orders-actions details"), null, "Actions stay outside collapsed diagnostics");
  await click(row("fixture-paid"), "Все данные клиента");
  assert.match(container.querySelector(".fixed").textContent, /buyer@example.invalid/);
  assert.equal(container.textContent.includes("FIXTURE-NEVER-RENDER"), false);
  await click(container.querySelector(".fixed"), "Закрыть");
  await click(row("fixture-paid"), "Токен клиента");
  assert.equal(last().url, "/orders/fixture-paid/activation-token");
  assert.equal(container.querySelector(".fixed textarea").readOnly, true);
  await click(container.querySelector(".fixed"), "Скопировать"); assert.equal(copied.at(-1), "FIXTURE-TOKEN-fixture-paid");
  await click(container.querySelector(".fixed"), "Готово");
  await click(row("fixture-paid"), "Ссылка активации");
  assert.equal(last().url, "/orders/fixture-paid/activation-link");
  await click(container.querySelector(".fixed"), "Скопировать ссылку"); assert.equal(copied.at(-1), "https://example.invalid/activate/fixture-paid");
  const beforeCancel = writes().length;
  await click(container.querySelector(".fixed"), "Отозвать старые и выдать новую"); assert.equal(writes().length, beforeCancel, "Cancel preserves existing links");
  confirm = true;
  await click(container.querySelector(".fixed"), "Отозвать старые и выдать новую"); assert.equal(last().url, "/orders/fixture-paid/activation-link/revoke");
  assert.equal(container.querySelector(".fixed textarea").value, "https://example.invalid/reissued");
  await click(container.querySelector(".fixed"), "Закрыть");
  await click(row("fixture-paid"), "Логин и пароль Devin");
  assert.equal(last().url, "/orders/fixture-paid/manual-login-credentials");
  assert.deepEqual([...container.querySelectorAll(".fixed input")].map(el => [el.value, el.readOnly]), [["fixture-login", true], ["fixture-password", true]]);
  await click(container.querySelector(".fixed"), "Закрыть");
  for (const [id, label, method, suffix, body] of [
    ["fixture-paid", "Отметить активированным", "POST", "activation/manual-complete"],
    ["fixture-retry", "Отметить оплаченным", "PATCH", "status", { status: "PAID" }],
    ["fixture-paid", "Отметить как ошибка", "PATCH", "status", { status: "FAILED" }],
    ["fixture-retry", "Вернуть в ожидание", "PATCH", "status", { status: "PENDING" }],
    ["fixture-refunded", "Возврат", "POST", "refund"],
  ]) {
    await click(row(id), label);
    const mutation = writes().at(-1);
    assert.equal(mutation.method, method); assert.equal(mutation.url, `/orders/${id}/${suffix}`);
    assert.deepEqual(JSON.parse(JSON.stringify(mutation.body ?? null)), body ?? null, "Each button retains the correct order and payload");
  }
  let releaseProof;
  proofDeferred = new Promise(resolve => { releaseProof = resolve; });
  await click(row("fixture-paid"), "Проверить активацию");
  assert.equal(button(row("fixture-retry"), "Проверить активацию").disabled, true, "Concurrent forced checks remain blocked");
  const checkRequest = last(); assert.equal(checkRequest.url, "/orders/fixture-paid/activation-proof"); assert.equal(checkRequest.params.forceCheck, 1);
  releaseProof({ data: { certainty: { code: "ACTIVATED_CONFIRMED_PROVIDER" } } }); await settle(); proofDeferred = undefined;
  assert.match(container.querySelector('[role="status"]').textContent, /Активация подтверждена провайдером/);
  proofFailure = true; await click(row("fixture-paid"), "Проверить активацию");
  assert.match(container.querySelector('[role="status"]').textContent, /Нет доступа к тестовой проверке/); proofFailure = false;
  const beforeFilters = writes().length;
  const filters = container.querySelectorAll(".orders-toolbar select");
  for (const [i, value, param] of [[0, "PAID", "status"], [1, "telegram", "source"], [2, "chatgpt", "botType"], [3, "gateway", "paymentMethod"]]) {
    await change(filters[i], value); assert.equal(last().url, "/orders"); assert.equal(last().params[param], value);
  }
  for (const el of filters) await change(el, "");
  await change(container.querySelector("#orders-search"), "fixture-done", 330);
  assert.equal(last().params.q, "fixture-done"); assert.equal(last().params.page, 1); assert.equal(last().params.limit, 100);
  assert.equal(container.querySelectorAll(".orders-order-card").length, 1);
  await change(container.querySelector("#orders-search"), "fixture-no-match", 330);
  assert.match(container.querySelector(".orders-empty").textContent, /Заказы не найдены/);
  await click(container, "Обновить заказы"); assert.equal(last().url, "/orders");
  assert.equal(writes().length, beforeFilters, "Search, filters, refresh and disclosure do not mutate orders");
  assert.ok(requests.every(item => item.url.startsWith("/orders")), "All requests stay inside the isolated orders transport");
} finally {
  await React.act(async () => root.unmount()); client.clear(); dom.window.close();
  for (const [key, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
}
console.log("Orders workspace: isolated action routing, disabled states, protected read dialogs, revoke confirmation, filters, CSV, errors and privacy passed.");
