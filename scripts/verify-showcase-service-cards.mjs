import fs from "node:fs";

function read(path) {
  return fs.existsSync(path) ? fs.readFileSync(path, "utf8") : "";
}

function assert(condition, message) {
  if (!condition) {
    console.error(`showcase service cards check failed: ${message}`);
    process.exitCode = 1;
  }
}

const schema = read("apps/admin-backend/prisma/schema.prisma");
const service = read("apps/admin-backend/src/modules/showcase/showcase.service.ts");
const controller = read("apps/admin-backend/src/modules/showcase/showcase.controller.ts");
const routes = read("apps/admin-backend/src/modules/showcase/showcase.routes.ts");
const schemas = read("apps/admin-backend/src/modules/showcase/showcase.schemas.ts");
const publicRoutes = read("apps/admin-backend/src/modules/products/public-products.routes.ts");
const adminUi = read("apps/admin-ui/src/pages/ShowcasePage.tsx");
const storefront = read("assets/js/app.js");
const catalog = read("catalog/index.html");
const aiCatalog = read("catalog/ai/index.html");

assert(schema.includes("model ProductShowcaseServiceCard"), "Prisma must persist homepage service cards");
assert(schemas.includes("showcaseServiceCardSchema"), "showcase service card API must validate input");
assert(service.includes("listServiceCards()"), "showcase service must list service cards");
assert(service.includes("upsertServiceCard(serviceKey: string"), "showcase service must upsert service cards by key");
assert(controller.includes("listShowcaseServiceCards"), "controller must expose list action");
assert(routes.includes('showcaseAdminRouter.get("/service-cards"'), "admin route must list service cards");
assert(routes.includes('showcaseAdminRouter.put("/service-cards/:serviceKey"'), "admin route must update service card");
assert(publicRoutes.includes("const serviceCardPayload = buildPublicServiceCardsPayload(serviceCards);"), "public showcase payload must build service cards");
assert(publicRoutes.includes("serviceCards: serviceCardPayload"), "public showcase payload must include service cards");
assert(publicRoutes.includes("isActive: card.isActive !== false"), "public showcase payload must expose service card visibility");
assert(storefront.includes("function getShowcaseServiceCardConfig(section, serviceKey)"), "storefront must resolve service card config");
assert(storefront.includes("function isShowcaseServiceEnabled(section, serviceKey)"), "storefront must hide disabled service groups");
assert(storefront.includes("function syncStaticShowcaseServiceVisibility()"), "static catalogs must follow service card visibility");
assert(storefront.includes('card.style.display = isHidden ? "none" : ""'), "static catalog visibility must override card display styles");
assert(catalog.includes('data-showcase-service-key="suno"'), "catalog Suno card must be controlled by showcase visibility");
assert(aiCatalog.includes('data-showcase-service-key="suno"'), "AI catalog Suno card must be controlled by showcase visibility");
assert(storefront.includes("const serviceCard = getShowcaseServiceCardConfig(section, serviceKey);"), "AI directory card must read service card config");
assert(storefront.includes("const serviceCard = getShowcaseServiceCardConfig(section, \"vpn\");"), "VPN directory card must read service card config");
assert(adminUi.includes("type ShowcaseServiceCard"), "admin UI must type service cards");
assert(adminUi.includes("serviceCardsQuery"), "admin UI must load service cards");
assert(adminUi.includes("saveServiceCard"), "admin UI must save service cards");
assert(adminUi.includes("toggleServiceCard"), "admin UI must expose a quick service card visibility toggle");

if (process.exitCode) process.exit(process.exitCode);
console.log("showcase service cards check passed");
