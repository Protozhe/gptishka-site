import { assertAssetReference } from "./release-assets.mjs";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (file) => fs.readFileSync(file, "utf8");
const plans = read("apps/admin-backend/scripts/upsert-suno-product.js");
const orders = read("apps/admin-backend/src/modules/orders/orders.service.ts");
const payments = read("apps/admin-backend/src/modules/payments/public-payments.routes.ts");
const success = read("success.html");
const redeem = read("redeem-start.html");
const app = read("assets/js/app.min.js");
const link = read("assets/js/suno-link.js");
const linkPage = read("suno-link.html");
const adminOrders = read("apps/admin-ui/src/pages/OrdersPage.tsx");
const page = read("suno.html");
const enPage = read("en/suno.html");
const modalCss = read("assets/css/home-stability-hotfix.css");
const sunoModalScope = '.service-page:is([data-service-page="chatgpt"], [data-service-page="midjourney"], [data-service-page="suno"]) ~ .chatgpt-go-order-modal';

assert.match(plans, /slug: "suno-pro-1-month", name: "Pro", price: 1490/);
assert.match(plans, /slug: "suno-premier-1-month", name: "Premier", price: 3290/);
assert.match(plans, /activation-pool:\$\{plan\.slug\}/);
assert.match(app, /serviceKey === "suno" \? "suno-v1"/);
assert.match(app, /SUNO_ORDER_MODAL_PLAN_KEYS = new Set\(\["pro", "premier"\]\)/);
assert.match(payments, /"\/suno-link\.html"/);
assert.match(success, /if \(serviceKey === "suno"\) \{[\s\S]*?new URL\("\/suno-link\.html", window\.location\.origin\)/);
assert.match(success, /if \(serviceKey === "suno"\) return "\/suno-link\.html"/);
assert.match(redeem, /deliveryMode === 'payment_link' && \/\^suno-\(pro\|premier\)-1-month\$\/\.test\([\s\S]*?new URL\('\/suno-link\.html', window\.location\.origin\)/);
assert.match(orders, /isSunoPaymentLinkOrder\(productSlug, fullOrder\?\.orderDetails\)/);
assert.match(orders, /validateSunoPaymentLink\(tokenInfo\.raw\)/);
assert.match(link, /\/g\\\/pay\\\/cs_live_/);
assert.match(link, /suno-\(pro\|premier\)-1-month/);
assert.match(link, /activation\/store-token/);
assert.match(linkPage, /id="linkForm"/);
assert.match(linkPage, /Как получить ссылку на оплату Suno/);
assert.ok(linkPage.indexOf('class="suno-steps"') < linkPage.indexOf('id="linkForm"'), "Suno instructions must appear before the payment-link form");
assert.match(linkPage, /в поле ниже и нажмите «Отправить ссылку»/);
assert.match(linkPage, /«Аккаунт» → «Подписка»/);
assert.match(linkPage, /«Ежемесячно»/);
assert.match(linkPage, /«Subscribe»/);
assert.doesNotMatch(link, /Оплата заказа подтверждена\. Отправьте ссылку Stripe Checkout для выбранного тарифа\./);
assert.match(adminOrders, /activation-token/);
assert.match(page, /suno-onboarding\.js/);
assert.ok(modalCss.includes(`${sunoModalScope} .chatgpt-order-summary-card {`), "Suno modal summary must use the ChatGPT layout");
assert.ok(modalCss.includes(`${sunoModalScope} .chatgpt-order-payment label {`), "Suno payment methods must use the ChatGPT layout");
for (const html of [page, enPage]) {
  assertAssetReference(html, "assets/css/home-stability-hotfix.css", "Suno");
}
assert.ok(fs.existsSync("apps/admin-backend/src/modules/orders/suno-payment-link.test.ts"));
assert.ok(!page.includes("2 999"));

console.log("Suno monthly plans and post-payment link flow verified.");
