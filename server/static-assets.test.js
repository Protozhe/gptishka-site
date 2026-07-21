const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT_DIR = path.resolve(__dirname, "..");
const STOREFRONT_BUNDLE_VERSION = "20260721-heavy-cards-webp1";
const VPN_CARD_VERSION = "20260721-cards-webp1";

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(ROOT_DIR, relativePath), "utf8");
}

function collectHtmlFiles(directory = ROOT_DIR) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (
        entry.name === "node_modules" ||
        entry.name === ".git" ||
        entry.name === ".worktrees" ||
        entry.name.startsWith("_") ||
        entry.name.includes("backup") ||
        entry.name === "visual-baseline" ||
        entry.name.endsWith(".old") ||
        entry.name.endsWith(".prev")
      ) {
        return [];
      }
      return collectHtmlFiles(absolutePath);
    }
    if (entry.name.startsWith("_")) return [];
    if (!entry.isFile() || !entry.name.endsWith(".html")) return [];
    return [path.relative(ROOT_DIR, absolutePath).replaceAll(path.sep, "/")];
  });
}

test("html pages load the current storefront app bundle version", () => {
  const htmlFiles = collectHtmlFiles().filter((relativePath) => {
    return readProjectFile(relativePath).includes("/assets/js/app.min.js?v=");
  });

  assert.ok(htmlFiles.length > 0, "expected storefront HTML pages to include app.min.js");

  for (const relativePath of htmlFiles) {
    const html = readProjectFile(relativePath);
    assert.ok(
      html.includes(`/assets/js/app.min.js?v=${STOREFRONT_BUNDLE_VERSION}`),
      `${relativePath} should load app.min.js?v=${STOREFRONT_BUNDLE_VERSION}`,
    );
  }
});

test("vpn directory card uses cache-busted image assets", () => {
  for (const relativePath of ["assets/js/app.js", "assets/js/app.min.js"]) {
    const js = readProjectFile(relativePath);
    assert.ok(
      js.includes(`/assets/img/services/vpn-card.webp?v=${VPN_CARD_VERSION}`),
      `${relativePath} should reference cache-busted vpn-card.webp`,
    );
    assert.ok(
      js.includes(`/assets/img/services/vpn-card-hover.webp?v=${VPN_CARD_VERSION}`),
      `${relativePath} should reference cache-busted vpn-card-hover.webp`,
    );
    assert.doesNotMatch(
      js,
      /\/assets\/img\/services\/vpn-card(?:-hover)?\.png(?=["'])/,
      relativePath,
    );
  }
});
