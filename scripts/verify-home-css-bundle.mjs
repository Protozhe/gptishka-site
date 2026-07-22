import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { minifyCss } from "./css-minifier.mjs";

const root = process.cwd();
const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
const bundle = fs.readFileSync(path.join(root, "assets", "css", "home-critical-bundle.css"), "utf8");
const minifiedBundle = fs.readFileSync(path.join(root, "assets", "css", "home-critical-bundle.min.css"), "utf8");
const sources = [
  "assets/css/logo.min.css",
  "assets/css/gptishka-header-refresh.css",
  "assets/css/theme.min.css",
  "assets/css/unified-premium.css",
  "assets/css/trust-promo.css",
  "assets/css/home-cro.css",
  "assets/css/home-stability-hotfix.css",
  "assets/css/home-wide-marketplace.css",
];
const expected = sources
  .map(relativePath => {
    const css = fs.readFileSync(path.join(root, relativePath), "utf8").replace(/^\uFEFF/, "");
    return `/* source: ${relativePath} */\n${css.trim()}\n`;
  })
  .join("\n");

assert.equal(
  crypto.createHash("sha256").update(bundle).digest("hex"),
  crypto.createHash("sha256").update(expected).digest("hex"),
  "Homepage CSS bundle is stale; run scripts/build-home-css-bundle.mjs.",
);
assert.equal(
  crypto.createHash("sha256").update(minifiedBundle).digest("hex"),
  crypto.createHash("sha256").update(minifyCss(expected)).digest("hex"),
  "Minified homepage CSS bundle is stale; run scripts/build-home-css-bundle.mjs.",
);
assert.ok(
  index.includes('/assets/css/home-critical-bundle.min.css?v=20260722-directory-card-standard1'),
  "Homepage must load the cache-busted CSS bundle.",
);
for (const source of sources) {
  assert.ok(!index.includes(`/${source}`), `Homepage still loads bundled source ${source}.`);
}
assert.ok(
  /fonts\.googleapis\.com[^>]+rel="preload"[^>]+as="style"[^>]+onload=/.test(index),
  "Google Fonts stylesheet must load without blocking first paint.",
);
assert.ok(
  /<noscript><link[^>]+fonts\.googleapis\.com[^>]+rel="stylesheet"/.test(index),
  "Google Fonts needs a no-JavaScript fallback.",
);

console.log(
  `Homepage CSS bundle verified (${sources.length} sources, ${Buffer.byteLength(bundle)} -> ` +
  `${Buffer.byteLength(minifiedBundle)} bytes).`,
);
