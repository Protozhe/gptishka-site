import assert from "node:assert/strict";
import fs from "node:fs";

const read = (file) => fs.readFileSync(file, "utf8");
const plans = read("apps/admin-backend/scripts/upsert-suno-product.js");
const orders = read("apps/admin-backend/src/modules/orders/orders.service.ts");
const payments = read("apps/admin-backend/src/modules/payments/public-payments.routes.ts");
const app = read("assets/js/app.min.js");
const link = read("assets/js/suno-link.js");
const page = read("suno.html");

assert.match(plans, /slug: "suno-pro-1-month", name: "Pro", price: 1490/);
assert.match(plans, /slug: "suno-premier-1-month", name: "Premier", price: 3290/);
assert.match(plans, /activation-pool:\$\{plan\.slug\}/);
assert.match(app, /paymentLinkFlow: serviceKey === "suno" \? "suno-v1"/);
assert.match(app, /SUNO_ORDER_MODAL_PLAN_KEYS = new Set\(\["pro", "premier"\]\)/);
assert.match(payments, /"\/suno-link\.html"/);
assert.match(orders, /isSunoPaymentLinkOrder\(productSlug, fullOrder\?\.orderDetails\)/);
assert.match(orders, /validateSunoPaymentLink\(tokenInfo\.raw\)/);
assert.match(link, /\/g\\\/pay\\\/cs_live_/);
assert.match(link, /suno-\(pro\|premier\)-1-month/);
assert.match(page, /suno-onboarding\.js/);
assert.ok(fs.existsSync("suno-link.html"));
assert.ok(fs.existsSync("apps/admin-backend/src/modules/orders/suno-payment-link.test.ts"));
assert.ok(!page.includes("2 999"));

console.log("Suno monthly plans and post-payment link flow verified.");
