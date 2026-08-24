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
  "app/index.html",
  "site-map.html",
  "en/site-map.html",
  "oferta.html",
  "en/oferta.html",
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
  "isRetiredPublicAccessPath",
  'return res.status(410).send("Gone");',
  "containsPublicVpnMarker(rawSlug)",
  "[item.text, item.caption, item.title]",
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

console.log("Public VPN promotion and retired storefront pages are hidden while internal legacy data remains intact.");
