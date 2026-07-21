import fs from "node:fs";

const publicFiles = [
  "index.html",
  "en/index.html",
  "catalog/index.html",
  "catalog/ai/index.html",
  "en/catalog/index.html",
  "en/catalog/ai/index.html",
  "store/steam/index.html",
  "chatgpt.html",
  "claude.html",
  "supergrok.html",
  "service.html",
  "assets/js/home-promo-slider.js",
];

const blockedPatterns = [
  /V\*N/i,
  /\bVPN\b/i,
  /\bVLESS\b/i,
  /\/catalog\/vpn/i,
  /\/store\/vpn(?!\/activate)/i,
  /home-promo-slide--vpn/i,
  /home-service-shortcut--vpn/i,
  /ai-directory-card--vpn/i,
  /og-ai-subscriptions-vpn/i,
];

function fail(message) {
  console.error(message);
  process.exit(1);
}

for (const file of publicFiles) {
  if (!fs.existsSync(file)) continue;
  const content = fs.readFileSync(file, "utf8");
  for (const pattern of blockedPatterns) {
    if (pattern.test(content)) {
      fail(`${file} still contains storefront VPN marker: ${pattern}`);
    }
  }
}

const server = fs.readFileSync("server.js", "utf8");
[
  "sanitizePublicProductsPayload",
  "sanitizePublicShowcasePayload",
  "sanitizePublicHomepageContentPayload",
  'app.get(["/catalog/vpn", "/catalog/vpn/"], (_req, res) => res.status(404).send("Not found"))',
  'app.get(["/store/vpn", "/store/vpn/", "/en/store/vpn", "/en/store/vpn/"], (_req, res) => {',
  'app.get("/store/vpn/activate", sendVpnActivationPage);',
  'app.get("/api/vpn/me"',
].forEach((needle) => {
  if (!server.includes(needle)) fail(`server.js missing required VPN visibility guard: ${needle}`);
});

const presenter = fs.readFileSync("apps/admin-backend/src/modules/products/public-product-presenter.ts", "utf8");
if (!presenter.includes("isHiddenPublicVpnProduct")) {
  fail("public-product-presenter.ts must expose public VPN product filter.");
}

const publicRoutes = fs.readFileSync("apps/admin-backend/src/modules/products/public-products.routes.ts", "utf8");
if (!publicRoutes.includes("!isHiddenPublicVpnProduct")) {
  fail("public-products.routes.ts must filter public VPN products.");
}

const homepageContent = fs.readFileSync("apps/admin-backend/src/modules/homepage/homepage-content.service.ts", "utf8");
if (!homepageContent.includes("isHiddenPublicVpnHomepageItem")) {
  fail("homepage-content.service.ts must filter public VPN homepage items.");
}

console.log("Public VPN storefront visibility is hidden while activation routes stay wired.");
