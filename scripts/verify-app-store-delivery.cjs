const assert = require("node:assert/strict");
const fs = require("node:fs");
const { JSDOM } = require("jsdom");
const { spawnSync } = require("node:child_process");
const backend = spawnSync(process.execPath, ["--import", "tsx", "--test",
  "apps/admin-backend/src/modules/orders/app-store-delivery.test.ts",
  "apps/admin-backend/src/modules/products/public-itunes-products.test.ts"], { encoding: "utf8" });
if (backend.status !== 0) { process.stderr.write(backend.stdout + backend.stderr); process.exit(backend.status || 1); }
const html = fs.readFileSync("itunes.html", "utf8");
const script = fs.readFileSync("assets/js/itunes-page.js", "utf8");
const tick = () => new Promise(setImmediate);

async function check(lang, forbidden = false) {
  const dom = new JSDOM(html, { url: "http://localhost/itunes?lang=" + lang + "&order_id=demo-appstore&t=local-demo", runScripts: "outside-only", pretendToBeVisual: true });
  const w = dom.window, timers = [];
  let clock = 0, ready = false, reads = 0;
  w.Date.now = () => clock;
  w.setTimeout = (fn, ms) => { timers.push({ fn, ms }); return timers.length; };
  w.fetch = async (url) => {
    if (String(url).includes("/itunes-products")) return { ok: true, json: async () => ({ items: [{ region: "ru", denomination: 500, price: 628, slug: "itunes-ru-500" }] }) };
    reads++;
    return { ok: !forbidden, status: forbidden ? 403 : 200, json: async () => ({
      deliveryMode: "code", status: ready ? "code_ready" : "processing", product: "itunes-ru-500",
      paidAmount: 628, currency: "RUB", ...(ready ? { code: "XDEMO12345678901" } : {}),
    }) };
  };
  w.eval(script); await tick(); await tick();
  const d = w.document;
  if (forbidden) {
    assert.equal(d.querySelector("#itunesDeliveryResult").dataset.state, "error");
    assert.equal(d.querySelector("#itunesDeliveryCode").hidden, true);
    assert.equal(d.querySelector(".itunes-delivery-card__eyebrow").textContent.includes("confirmed"), false);
  } else {
    assert.equal(d.querySelector("#itunesDeliveryResult").dataset.state, "processing");
    assert.match(d.querySelector("#itunesDeliveryDescription").textContent, /5/);
    assert.equal(d.querySelector("#itunesModalPrice").textContent, "628 ₽");
    assert.equal(d.querySelector("#itunesDeliveryCode").hidden, true);
    for (let index = 0; index < 65; index++) {
      const timer = timers.shift();
      assert.ok(timer, "Polling must continue after 45 seconds and after five minutes");
      clock += timer.ms; timer.fn(); await tick(); await tick();
    }
    assert.ok(clock > 300000);
    assert.equal(d.querySelector("#itunesDeliveryResult").dataset.state, "processing");
    ready = true;
    timers.shift().fn(); await tick(); await tick();
    assert.equal(d.querySelector("#itunesDeliveryResult").dataset.state, "ready");
    assert.equal(d.querySelector("#itunesDeliveryCode strong").textContent, "XDEMO12345678901");
    assert.equal(d.querySelector("#itunesDeliveryCopy").hidden, false);
    assert.ok(reads > 65);
  }
  w.dispatchEvent(new w.Event("pagehide"));
  dom.window.close();
}
(async () => {
  for (const lang of ["ru", "en"]) { await check(lang); await check(lang, true); }
  console.log("App Store: RU/EN waiting state persists, manual code appears without reload, invalid access exposes no code.");
})().catch((error) => { console.error(error); process.exitCode = 1; });
