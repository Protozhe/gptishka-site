import assert from "node:assert/strict";
import fs from "node:fs";
import { setImmediate } from "node:timers/promises";
import { JSDOM } from "jsdom";
import { assertAssetReference } from "./release-assets.mjs";

const analytics = fs.readFileSync("assets/js/analytics-init.js", "utf8");
const checkout = fs.readFileSync("assets/js/codex-credits.js", "utf8");
const products = [250, 500, 1000].map((credits, index) => ({
  id: `fixture-${credits}`, slug: `codex-${credits}-link`,
  price: [1500, 2500, 4500][index], tags: [`credits:${credits}`]
}));
const campaignQuery = "utm_source=yandex&utm_medium=cpc&utm_campaign=714510350&utm_content=ad-fixture&utm_term=codex&yclid=123456789";

for (const file of ["codex-credits.html", "chatgpt.html", "en/codex-credits.html", "en/chatgpt.html"]) {
  const html = fs.readFileSync(file, "utf8");
  assertAssetReference(html, "assets/js/analytics-init.js", file);
  assertAssetReference(html, "assets/js/codex-credits.js", file);
  const dom = new JSDOM(html, {
    url: `https://gptishka.shop/${file}?${campaignQuery}&email=private-fixture&session=private-session#credits`,
    runScripts: "outside-only"
  });
  const { window } = dom;
  try {
    const calls = [], requests = [];
    let releasePayment;
    window.fetch = async (url, options) => {
      if (String(url).startsWith("/api/public/products")) {
        return { ok: true, json: async () => ({ items: products }) };
      }
      requests.push({ url, options, body: JSON.parse(options.body) });
      return new Promise(resolve => { releasePayment = () => resolve({ ok: false, json: async () => ({ error: "fixture-only rejection" }) }); });
    };
    window.gptishkaTrackEvent = (...args) => calls.push(args);
    window.eval(analytics);
    const init = new URL(window.ym.a[0][2].url);
    assert.equal(init.searchParams.get("yclid"), "123456789");
    assert.equal(init.searchParams.get("utm_campaign"), "714510350");
    assert.equal(init.searchParams.has("email"), false);
    assert.equal(init.searchParams.has("session"), false);
    assert.equal(init.hash, "");
    window.eval(checkout);
    await setImmediate();
    const form = window.document.querySelector("[data-codex-order-form]");
    const submit = form.querySelector("[data-codex-submit]");
    const send = () => form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
    send();
    await setImmediate();
    assert.equal(requests.length, 0, "Invalid contact details must not create payments.");
    assert.equal(calls.length, 0, "Validation failure is not checkout intent.");

    form.elements.email.value = "fixture@example.invalid";
    form.elements.telegram.value = "@fixture_bot";
    const option = form.querySelector('input[name="credits"][value="500"]');
    option.checked = true;
    option.dispatchEvent(new window.Event("change"));
    assert.equal(option.dataset.price, "2500");
    send();
    send();
    await setImmediate();
    assert.equal(requests.length, 1, "Repeated submit while payment is pending must not duplicate requests.");
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], "checkout_start");
    assert.equal(calls[0][1].source, "codex_credits_page");
    assert.equal(calls[0][1].amount, 2500);
    assert.equal(JSON.stringify(calls).includes("fixture@example.invalid"), false, "Analytics events must not include contact details.");
    assert.equal(requests[0].body.plan_id, "fixture-500");
    assert.deepEqual(requests[0].body.order_details, requests[0].body.orderDetails);
    const touch = requests[0].body.order_details.attribution.lastTouch;
    assert.equal(touch.utm_campaign, "714510350");
    assert.equal(touch.yclid, "123456789");
    assert.equal(touch.landingPage.includes("?"), false, "Stored landing URL must remain stripped of private parameters.");
    assert.equal(submit.disabled, true);
    releasePayment();
    await setImmediate();
    assert.equal(submit.disabled, false, "A failed payment attempt must be retryable.");

    // An unavailable analytics helper must not block a later payment attempt.
    window.gptishkaGetAttribution = () => { throw new Error("fixture storage unavailable"); };
    window.gptishkaTrackEvent = () => { throw new Error("fixture analytics unavailable"); };
    send();
    await setImmediate();
    assert.equal(requests.length, 2);
    assert.equal(requests[1].body.order_details.attribution, undefined);
    releasePayment();
    await setImmediate();
    assert.equal(submit.disabled, false);

    const support = window.document.querySelector(".codex-supporting").textContent;
    assert.match(support, /12 (?:месяцев|months)/);
    assert.doesNotMatch(support, /не сгорают|do not expire/);
    console.log(`${file}: advertising URL, order attribution, checkout event, submit guard and account terms verified.`);
  } finally {
    window.close();
  }
}

for (const path of ["/success.html?t=private", "/redeem-start.html", "/codex-credits?t=private"]) {
  const dom = new JSDOM("<!doctype html>", { url: `https://gptishka.shop${path}`, runScripts: "outside-only" });
  try {
    dom.window.eval(analytics);
    assert.equal(dom.window.ym, undefined, "Private links must not initialize external analytics.");
    assert.equal(dom.window._tmr, undefined);
  } finally {
    dom.window.close();
  }
}
console.log("Codex attribution regression checks passed without network requests or real orders.");
