import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url), React = require("react"), { JSDOM } = require("jsdom");
const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: "http://localhost/admin/workspace/chats" });
const globals = { window: dom.window, document: dom.window.document, navigator: dom.window.navigator, MutationObserver: dom.window.MutationObserver, IS_REACT_ACT_ENVIRONMENT: true };
const previous = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
function load(name, mocks = {}) {
  const file = new URL(`../apps/admin-ui/src/${name}`, import.meta.url), module = { exports: {} }, localRequire = createRequire(file);
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, URL, window: dom.window, document: dom.window.document, MutationObserver: dom.window.MutationObserver, require: name => Object.hasOwn(mocks, name) ? mocks[name] : localRequire(name) }, { filename: file.pathname });
  return module.exports;
}
const workspace = load("lib/workspace.ts");
const appearance = load("lib/workspace-appearance.ts", { "./workspace": workspace, "../styles/embedded-tools.css?url": { default: "/admin/assets/fixture-tool-theme.css" } });
const { AdminSectionFrame, adminSections } = load("components/AdminSectionFrame.tsx");
const { WorkspacePanels } = load("components/WorkspacePanels.tsx", { "../lib/workspace": workspace, "../lib/workspace-appearance": appearance });
const { createRoot } = require("react-dom/client"), { Simulate } = require("react-dom/test-utils");
const container = dom.window.document.getElementById("root"), root = createRoot(container);
const render = async element => { await React.act(async () => root.render(element)); };
const tick = async () => React.act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
let submissions = 0;
try {
  for (const [pathname, section] of Object.entries(adminSections)) {
    await render(React.createElement(AdminSectionFrame, { pathname }, React.createElement("button", { type: "button" }, "fixture-action")));
    assert.equal(container.querySelector(".admin-page-heading h2").textContent, section.title);
    assert.equal(container.querySelectorAll("button").length, 1, "A heading must not remove or duplicate page actions");
  }
  for (const pathname of ["/orders", "/cdks", "/workspace/chats", "/workspace/profit"]) {
    await render(React.createElement(AdminSectionFrame, { pathname }, React.createElement("input", { defaultValue: "fixture-draft" })));
    assert.equal(container.querySelector(".admin-page-heading"), null, "Existing page headers and tool frames are not duplicated");
  }
  await render(React.createElement(WorkspacePanels, { section: "chats" }));
  const chat = container.querySelector("iframe"); assert(chat);
  const src = chat.getAttribute("src"); assert.equal(src, "/chats/");
  const doc = chat.contentDocument;
  doc.open(); doc.write('<!doctype html><html><head></head><body><div class="brand">FunPay <span>Pulse</span></div><form><textarea id="draft"></textarea><button>fixture-send</button></form><section hidden>fixture-hidden</section></body></html>'); doc.close();
  const draft = doc.getElementById("draft"); draft.value = "Fixture unsent message"; draft.focus();
  doc.querySelector("form").addEventListener("submit", event => { event.preventDefault(); submissions++; });
  await React.act(async () => Simulate.load(chat));
  assert(doc.body.classList.contains("gptishka-tool-theme"));
  assert.equal(doc.body.dataset.workspaceTool, "chats");
  assert.equal(doc.querySelector(".brand").textContent, "GPTishka");
  assert.equal(doc.querySelectorAll("link#gptishka-admin-tool-appearance").length, 1);
  assert.equal(doc.querySelector("link").href, "http://localhost/admin/assets/fixture-tool-theme.css");
  assert.equal(draft.value, "Fixture unsent message"); assert.equal(doc.activeElement, draft);
  assert.equal(doc.querySelector("section").hidden, true, "Appearance must preserve hidden sections");
  appearance.applyWorkspaceToolAppearance(chat);
  assert.equal(doc.querySelectorAll("link#gptishka-admin-tool-appearance").length, 1, "Repeated loads must not duplicate stylesheets");
  const guardedBrand = doc.createElement("div"); guardedBrand.className = "brand";
  guardedBrand.innerHTML = '<button>FunPay Pulse</button>'; doc.body.appendChild(guardedBrand);
  const guardedButton = guardedBrand.querySelector("button");
  appearance.applyWorkspaceToolAppearance(chat);
  assert.equal(guardedBrand.querySelector("button"), guardedButton, "Brand cleanup must never replace an interactive control");
  await render(React.createElement(WorkspacePanels, { section: "profit" }));
  assert.equal(container.querySelectorAll("iframe").length, 2);
  assert.equal(container.querySelector('iframe[src="/chats/"]'), chat);
  assert.equal(chat.parentElement.hidden, true);
  await render(React.createElement(WorkspacePanels, { section: "chats" }));
  assert.equal(chat.parentElement.hidden, false); assert.equal(chat.getAttribute("src"), src);
  assert.equal(draft.value, "Fixture unsent message", "Switching tools must preserve the original draft and document");
  dom.window.document.documentElement.classList.add("dark"); await tick();
  assert(doc.body.classList.contains("gptishka-tool-dark"));
  dom.window.document.documentElement.classList.remove("dark"); await tick();
  assert.equal(doc.body.classList.contains("gptishka-tool-dark"), false);
  const other = new JSDOM('<html><head></head><body><form></form></body></html>', { url: "https://example.invalid/chats/" });
  appearance.applyWorkspaceToolAppearance({ contentDocument: other.window.document, contentWindow: other.window });
  assert.equal(other.window.document.querySelector("link"), null, "Cross-origin pages never receive injected assets"); other.window.close();
  const login = new JSDOM('<html><head></head><body></body></html>', { url: "http://localhost/admin/login" });
  appearance.applyWorkspaceToolAppearance({ contentDocument: login.window.document, contentWindow: login.window });
  assert.equal(login.window.document.querySelector("link"), null, "Authentication pages keep their existing login flow"); login.window.close();
  assert.equal(submissions, 0, "Changing appearance or switching sections must not submit any form");
} finally {
  await React.act(async () => root.unmount()); dom.window.close();
  for (const [key, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
}
console.log("Admin appearance: section headings, retained tool documents and drafts, scoped stylesheet, hidden states, theme sync and login/origin boundaries passed.");
