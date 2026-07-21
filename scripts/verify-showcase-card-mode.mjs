import fs from "node:fs";

function read(path) {
  return fs.existsSync(path) ? fs.readFileSync(path, "utf8") : "";
}

function assert(condition, message) {
  if (!condition) {
    console.error(`showcase card mode check failed: ${message}`);
    process.exitCode = 1;
  }
}

const schema = read("apps/admin-backend/prisma/schema.prisma");
const service = read("apps/admin-backend/src/modules/showcase/showcase.service.ts");
const schemas = read("apps/admin-backend/src/modules/showcase/showcase.schemas.ts");
const adminUi = read("apps/admin-ui/src/pages/ShowcasePage.tsx");
const storefront = read("assets/js/app.js");

assert(schema.includes('renderMode     String'), "ProductShowcaseSection must persist renderMode");
assert(schemas.includes('renderMode: z.enum(["auto", "cards"])'), "showcase section API must validate auto/cards renderMode");
assert(service.includes('renderMode: normalizeRenderMode(input.renderMode)'), "showcase service must normalize renderMode on create");
assert(service.includes('input.renderMode !== undefined ? { renderMode: normalizeRenderMode(input.renderMode) }'), "showcase service must update renderMode");
assert(adminUi.includes('renderMode: "cards"'), "admin section form should default new sections to card mode");
assert(adminUi.includes('<select className="input" value={sectionForm.renderMode}'), "admin UI must expose render mode selector");
assert(adminUi.includes('value="cards"'), "admin UI must offer card rendering mode");
assert(storefront.includes('function shouldForceProductCards(section)'), "storefront must have an explicit product-card render mode check");
assert(storefront.includes('return String(section?.renderMode || "").trim().toLowerCase() === "cards";'), "storefront must detect renderMode=cards");
assert(storefront.includes('const forceProductCards = shouldForceProductCards(section);'), "storefront renderShowcaseSections must use the product-card mode");
assert(storefront.includes('const renderAsAiDirectory = !forceProductCards && shouldRenderAiServiceDirectory(section, aiGroups);'), "product-card mode must disable AI directory cards");
assert(storefront.includes('const renderAsVpnDirectory = !forceProductCards && !renderAsAiDirectory && shouldRenderVpnDirectory(section);'), "product-card mode must disable VPN directory cards");

if (process.exitCode) process.exit(process.exitCode);
console.log("showcase card mode check passed");
