import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const css = fs.readFileSync(path.join(root, "assets/css/home-info-sections.css"), "utf8");

assert.ok(html.includes("/assets/css/home-info-sections.css?v=20260724-home-info1"));
assert.ok(css.includes("grid-template-columns: repeat(4, minmax(0, 1fr))"));
assert.ok(css.includes("body.home-wide-body .home-wide-page > .faq"));
assert.ok(css.includes("body.home-wide-body .home-wide-page > .home-final-cta"));
assert.ok(css.includes("@media (max-width: 640px)"));
assert.ok(css.includes("@media (prefers-reduced-motion: reduce)"));

console.log("Homepage information sections refresh markers found.");
