import assert from "node:assert/strict";
import fs from "node:fs";

const bundles = ["main.js", "assets/js/app.js", "assets/js/app.min.js"];
const enotBranch =
  'if (method === "enot" || method === "enot.io" || method === "gateway" || method === "card") return "enot";';

for (const file of bundles) {
  const source = fs.readFileSync(file, "utf8");
  assert.ok(source.includes(enotBranch), `${file}: ENOT payment choice is not preserved`);
  assert.ok(
    source.includes('fetch("/api/payments/" + encodeURIComponent(selectedPaymentMethod) + "/create"'),
    `${file}: checkout does not route through the selected provider`
  );
}

for (const file of ["index.html", "chatgpt.html", "catalog/index.html", "catalog/ai/index.html"]) {
  const html = fs.readFileSync(file, "utf8");
  assert.ok(
    html.includes("/assets/js/app.min.js?v=20260825-enot-routing1"),
    `${file}: stale checkout bundle version`
  );
}

const webhookSecurity = fs.readFileSync(
  "apps/admin-backend/src/common/security/webhook-security.ts",
  "utf8"
);
assert.ok(
  webhookSecurity.includes("return allowWebhookIpFromList(allowRaw, req, next, false);"),
  "ENOT webhook is disabled when no optional IP allowlist is configured"
);

console.log("ENOT checkout routing and webhook availability verified.");
