import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const englishHtml = fs.readFileSync(path.join(root, "en/index.html"), "utf8");
const css = fs.readFileSync(path.join(root, "assets/css/home-info-sections.css"), "utf8");
const testimonialsJs = fs.readFileSync(path.join(root, "assets/js/home-testimonials.js"), "utf8");

assert.ok(html.includes("/assets/css/home-info-sections.css?v=20260914-home-reviews2"));
assert.ok(englishHtml.includes("/assets/css/home-info-sections.css?v=20260914-home-reviews2"));
assert.ok(css.includes("width: calc(var(--home-wide-shell) - 2 * var(--home-info-inset)) !important"));
assert.ok(css.includes("--home-info-inset: 16px"));
assert.ok(html.includes('class="home-testimonials"'));
assert.ok(html.includes('/assets/js/home-testimonials.js?v=20260914-home-reviews1'));
assert.equal((html.match(/class="home-testimonial-card"/g) || []).length, 7);
assert.equal((html.match(/<strong>Клиент Claude<\/strong>/g) || []).length, 2);
assert.ok(testimonialsJs.includes("function goTo(index, behavior)"));
assert.ok(testimonialsJs.includes("prefers-reduced-motion: reduce"));
assert.ok(css.includes("grid-template-columns: repeat(4, minmax(0, 1fr))"));
assert.ok(css.includes("body.home-wide-body .home-wide-page > .faq"));
assert.ok(!html.includes('class="home-final-cta"'));
assert.ok(!englishHtml.includes('class="home-final-cta"'));
assert.ok(css.includes('margin-bottom: clamp(36px, 4vw, 56px) !important'));
assert.ok(css.includes("@media (max-width: 640px)"));
assert.ok(css.includes("@media (prefers-reduced-motion: reduce)"));

console.log("Homepage information sections refresh markers found.");
