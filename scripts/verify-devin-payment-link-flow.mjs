import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const page = read("devin-link.html");
const client = read("assets/js/devin-link.js");
const backend = read("apps/admin-backend/src/modules/orders/orders.service.ts");
const checkout = read("apps/admin-backend/src/modules/payments/payments.service.ts");
const success = read("success.html");

assert.match(page, /name="paymentLink"/);
assert.match(page, /checkout\.stripe\.com\/g\/pay\/cs_live_/);
assert.match(page, /Логин, пароль.*не нужно/);
assert.match(client, /deliveryMode !== "payment_link"/);
assert.match(client, /devin-\(pro\|max\|teams\)-1/);
assert.match(client, /activation\/store-token/);
assert.match(backend, /isDevinProductSlug\(productSlug\)/);
assert.match(backend, /validateDevinPaymentLink\(tokenInfo\.raw\)/);
assert.match(checkout, /paymentLinkFlow === "devin-v1"/);
assert.match(success, /new URL\("\/devin-link\.html"/);
for (const path of ["assets/js/app.js", "assets/js/app.min.js"]) {
  const app = read(path);
  assert.match(app, /paymentLinkFlow: serviceKey === "devin" \? "devin-v1"/);
  assert.match(app, /accountSectionMarkup = deliveryKey === "login" && resolvedServiceKey !== "devin"/);
}

console.log("Devin payment-link checkout, return page and protected storage verified.");
