import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { JSDOM } from "jsdom";
import { assertAssetReference } from "./release-assets.mjs";

const expectedTitle = "Купить ChatGPT Plus — 2 290 ₽ за месяц";
const html = fs.readFileSync("chatgpt.html", "utf8");
const dom = new JSDOM(html);
assert.equal(dom.window.document.title, expectedTitle);
for (const selector of [
  'meta[name="description"]',
  'meta[property="og:title"]',
  'meta[property="og:description"]',
]) {
  const content = dom.window.document.querySelector(selector)?.content || "";
  assert.ok(content.includes("2 290 ₽"), `${selector}: current advertised price required`);
  assert.ok(!content.includes("2 190 ₽"), `${selector}: old advertised price must not return`);
}
dom.window.close();
assertAssetReference(html, "assets/js/app.min.js", "chatgpt.html");

for (const file of ["assets/js/app.js", "assets/js/app.min.js"]) {
  const source = fs.readFileSync(file, "utf8");
  assert.ok(!source.includes("Купить ChatGPT Plus — 2 190 ₽ за месяц"), `${file}: old runtime title`);
  assert.ok(!source.includes("Купить ChatGPT Plus за 2 190 ₽ на месяц"), `${file}: old runtime description`);
  assert.ok(source.includes(`document.title = ${JSON.stringify(expectedTitle)};`), `${file}: service hero title`);
  const start = source.indexOf("  function updatePublicMeta() {");
  const end = source.indexOf("\n  function createComplianceNote()", start);
  assert.ok(start >= 0 && end > start, `${file}: metadata runtime function must exist`);
  const runtime = source.slice(start, end);
  for (const path of ["/chatgpt", "/chatgpt.html", "/chatgpt/"]) {
    const document = { title: "stale title" };
    const meta = {};
    vm.runInNewContext(`${runtime}\nupdatePublicMeta();`, {
      document,
      window: { location: { pathname: path } },
      isEnglishPage: () => false,
      setMeta: (name, value) => { meta[name] = value; },
    }, { timeout: 1000 });
    assert.equal(document.title, expectedTitle, `${file}: ${path} runtime title`);
    for (const name of ["description", "og:title", "og:description", "twitter:title", "twitter:description"]) {
      assert.ok(meta[name]?.includes("2 290 ₽"), `${file}: ${path} ${name}`);
    }
  }
  const document = { title: "stale title" };
  vm.runInNewContext(`${runtime}\nupdatePublicMeta();`, {
    document,
    window: { location: { pathname: "/en/chatgpt.html" } },
    isEnglishPage: () => true,
    setMeta: () => {},
  }, { timeout: 1000 });
  assert.equal(document.title, "ChatGPT assistance — independent GPTishka service");
}

assert.deepEqual(fs.readFileSync("assets/js/app.js"), fs.readFileSync("assets/js/app.min.js"));
console.log("ChatGPT advertised price verified in HTML, social metadata, and runtime for RU/EN routes.");
