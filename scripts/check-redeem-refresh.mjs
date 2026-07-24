import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const ru = read("redeem-start.html");
const en = read("en/redeem-start.html");
const css = read("assets/css/redeem-start-refresh.css");
const service = read("apps/admin-backend/src/modules/orders/orders.service.ts");

for (const page of [ru, en]) {
  assert.ok(page.includes('class="redeem-flow home-wide-body"'));
  assert.ok(page.includes("/assets/css/gptishka-header-refresh.css?v=20260724-language-slider1"));
  assert.ok(page.includes("/assets/css/redeem-start-refresh.css?v=20260724-redeem-refresh3"));
  assert.ok(page.includes("/assets/js/app.min.js?v=20260724-lang-all1"));
  assert.ok(page.includes('class="nav nav-shell"'));
  assert.ok(page.includes("/assets/img/logo-new-dark.png?v=20260622-header4"));
}

assert.ok(css.includes("--redeem-shell: #18212d"));
assert.ok(css.includes("zoom: 0.85"));
assert.ok(css.includes(".redeem-leave-modal__dialog"));
assert.ok(css.includes("rgba(3, 8, 15, 0.78)"));
assert.ok(css.includes(".redeem-order-id"));
assert.ok(css.includes(".redeem-status.error"));

assert.ok(service.includes('"verify_code" | "submit_recharge" | "query_code"'));
assert.ok(service.includes('callChongzhiJsonApi(base, "verify_code"'));
assert.ok(service.includes('callChongzhiJsonApi(base, "submit_recharge"'));
assert.ok(service.includes('callChongzhiJsonApi(base, "query_code"'));
assert.ok(service.includes("force_overwrite: false"));
assert.ok(service.includes('String(createResult.message || "Activation start failed")'));

console.log("Redeem page refresh and Chongzhi JSON API markers found.");
