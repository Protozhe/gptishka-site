import fs from "node:fs";

const publicFiles = ["index.html", "en/index.html"];
const blockedPatterns = [
  /V\*N/i,
  /\bVPN\b/i,
  /\bVLESS\b/i,
  /\/catalog\/vpn/i,
  /\/store\/vpn(?!\/activate)/i,
  /og-ai-subscriptions-vpn/i,
];

function fail(message) {
  console.error(message);
  process.exit(1);
}

for (const file of publicFiles) {
  const content = fs.readFileSync(file, "utf8");
  for (const pattern of blockedPatterns) {
    if (pattern.test(content)) {
      fail(`${file} still contains public VPN marker: ${pattern}`);
    }
  }
}

const server = fs.readFileSync("server.js", "utf8");
[
  "sanitizePublicProductsPayload",
  'app.get(["/store/vpn", "/store/vpn/"], (_req, res) => {',
  'app.get("/store/vpn/activate", sendVpnActivationPage);',
  'app.get("/api/vpn/me"',
].forEach((needle) => {
  if (!server.includes(needle)) fail(`server.js missing expected guard: ${needle}`);
});

const presenter = fs.readFileSync("apps/admin-backend/src/modules/products/public-product-presenter.ts", "utf8");
if (!presenter.includes("isHiddenPublicVpnProduct")) {
  fail("public-product-presenter.ts must expose public VPN product filter.");
}

const routes = fs.readFileSync("apps/admin-backend/src/modules/products/public-products.routes.ts", "utf8");
if (!routes.includes("!isHiddenPublicVpnProduct")) {
  fail("public-products.routes.ts must filter public VPN products.");
}

console.log("Public VPN storefront visibility is hidden while activation stays wired.");
