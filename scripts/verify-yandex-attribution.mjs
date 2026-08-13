import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const analyticsSource = fs.readFileSync("assets/js/analytics-init.js", "utf8");
const appSource = fs.readFileSync("assets/js/app.js", "utf8");
const appMinSource = fs.readFileSync("assets/js/app.min.js", "utf8");
const successSource = fs.readFileSync("success.html", "utf8");
const ordersSource = fs.readFileSync("apps/admin-ui/src/pages/OrdersPage.tsx", "utf8");

function createStorage(seed = new Map()) {
  return {
    getItem(key) {
      return seed.has(key) ? seed.get(key) : null;
    },
    setItem(key, value) {
      seed.set(key, String(value));
    },
    removeItem(key) {
      seed.delete(key);
    },
  };
}

function runAnalytics({ href, referrer, localSeed = new Map(), sessionSeed = new Map() }) {
  const listeners = new Map();
  const localStorage = createStorage(localSeed);
  const sessionStorage = createStorage(sessionSeed);
  const windowMock = {
    location: { href },
    localStorage,
    sessionStorage,
    addEventListener(name, callback) {
      listeners.set(name, callback);
    },
    removeEventListener() {},
    setTimeout() {
      return 1;
    },
    clearTimeout() {},
  };
  const documentMock = {
    readyState: "loading",
    referrer,
    scripts: [],
    head: { appendChild() {} },
    createElement(tagName) {
      return { tagName };
    },
    getElementById() {
      return null;
    },
    getElementsByTagName() {
      return [{ parentNode: { insertBefore() {} } }];
    },
  };

  vm.runInNewContext(analyticsSource, {
    window: windowMock,
    document: documentMock,
    location: windowMock.location,
    URL,
    Date,
  });

  return { snapshot: windowMock.gptishkaGetAttribution(), localSeed, sessionSeed };
}

const localSeed = new Map();
const sessionSeed = new Map();
const campaignLanding = runAnalytics({
  href: "https://gptishka.shop/chatgpt?utm_source=yandex&utm_medium=cpc&utm_campaign=42&utm_content=84&utm_term=chatgpt&yclid=abc123#plans",
  referrer: "https://yandex.ru/search/?text=chatgpt",
  localSeed,
  sessionSeed,
});

assert.equal(campaignLanding.snapshot.firstTouch.source, "yandex");
assert.equal(campaignLanding.snapshot.lastTouch.medium, "cpc");
assert.equal(campaignLanding.snapshot.lastTouch.utm_campaign, "42");
assert.equal(campaignLanding.snapshot.lastTouch.utm_content, "84");
assert.equal(campaignLanding.snapshot.lastTouch.utm_term, "chatgpt");
assert.equal(campaignLanding.snapshot.lastTouch.yclid, "abc123");
assert.equal(campaignLanding.snapshot.lastTouch.landingPage.includes("#"), false);
assert.equal(campaignLanding.snapshot.lastTouch.landingPage.includes("?"), false);
assert.equal(campaignLanding.snapshot.lastTouch.referrer.includes("?"), false);

const internalPage = runAnalytics({
  href: "https://gptishka.shop/payment.html",
  referrer: "https://gptishka.shop/chatgpt",
  localSeed,
  sessionSeed,
});
assert.equal(internalPage.snapshot.lastTouch.yclid, "abc123", "Internal navigation must keep the campaign touch.");
assert.equal(internalPage.snapshot.session.utm_campaign, "42");

assert.equal(appSource, appMinSource, "Storefront bundles must stay identical.");
assert.ok(appSource.includes('checkout_start: "ym-begin-checkout"'));
assert.ok(appSource.includes('payment_method_selected: "ym-add-payment-info"'));
assert.ok(appSource.includes("attribution,"), "Checkout must attach attribution to order details.");
assert.ok(successSource.includes('status === "PAID"'));
assert.ok(successSource.includes('paymentStatus === "SUCCESS"'));
assert.ok(successSource.includes('"reachGoal", "ym-purchase"'));
assert.ok(successSource.includes("ecommerce:"));
assert.ok(successSource.includes("gptishka_ym_purchase_tracked:"));
assert.ok(ordersSource.includes("Рекламная атрибуция"));
assert.ok(ordersSource.includes("Yandex Click ID"));

const purchaseFunctions = successSource.slice(
  successSource.indexOf("function trackConfirmedPurchase"),
  successSource.indexOf("function trackPurchaseRecord"),
);
const purchaseStorage = createStorage();
const ymCalls = [];
const purchaseWindow = {
  dataLayer: [],
  localStorage: purchaseStorage,
  sessionStorage: createStorage(),
  gptishkaGetAttribution() {
    return campaignLanding.snapshot;
  },
  ym(...args) {
    ymCalls.push(args);
  },
};
vm.runInNewContext(
  `${purchaseFunctions}\ntrackConfirmedPurchase("order-1", { finalAmount: 718, currency: "RUB", product: { id: "chatgpt", title: "ChatGPT" } });\n` +
    `trackConfirmedPurchase("order-1", { finalAmount: 718, currency: "RUB", product: { id: "chatgpt", title: "ChatGPT" } });`,
  {
    window: purchaseWindow,
    localStorage: purchaseStorage,
    sessionStorage: purchaseWindow.sessionStorage,
    METRIKA_COUNTER_ID: 106969126,
    Date,
  },
);
assert.equal(purchaseWindow.dataLayer.length, 1, "A paid order must produce one ecommerce purchase.");
assert.equal(purchaseWindow.dataLayer[0].ecommerce.purchase.actionField.id, "order-1");
assert.equal(purchaseWindow.dataLayer[0].ecommerce.purchase.actionField.revenue, 718);
assert.equal(ymCalls.length, 1, "A paid order must produce one Metrika goal.");
assert.equal(ymCalls[0][2], "ym-purchase");
assert.equal(ymCalls[0][3].source, "yandex");

const htmlFiles = [];
function collectHtml(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (
      [".git", "node_modules", "dist", ".codex-transfer"].includes(entry.name) ||
      entry.name.startsWith("_") ||
      entry.name.toLowerCase().includes("backup")
    ) continue;
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) collectHtml(path);
    else if (entry.name.endsWith(".html")) htmlFiles.push(path);
  }
}
collectHtml(".");

for (const file of htmlFiles) {
  const html = fs.readFileSync(file, "utf8");
  if (html.includes("/assets/js/analytics-init.js?v=")) {
    assert.ok(html.includes("analytics-init.js?v=20260813-yandex-attribution1"), `${file}: stale analytics asset`);
  }
  if (html.includes("app.min.js?v=")) {
    assert.ok(html.includes("app.min.js?v=20260813-yandex-attribution1"), `${file}: stale storefront asset`);
  }
}

console.log("Yandex attribution, checkout goals and confirmed purchase wiring verified.");
