import assert from "node:assert/strict";
import fs from "node:fs";

const css = fs.readFileSync("assets/css/home-wide-marketplace.css", "utf8");
const app = fs.readFileSync("assets/js/app.js", "utf8");
const appMin = fs.readFileSync("assets/js/app.min.js", "utf8");
const main = fs.readFileSync("main.js", "utf8");
const docs = fs.readFileSync("docs/home-directory-card-standard.md", "utf8");

assert.equal(app, appMin, "app.js and app.min.js must stay identical");
assert.equal(app, main, "app.js and main.js must stay identical");
assert.ok((app.match(/ai-directory-card--integrated/g) || []).length >= 2);
assert.match(app, /ai-directory-card__button-label/);

assert.match(css, /#pricingGrid \.ai-directory-card--integrated\s*\{[^}]*background:\s*transparent !important;[^}]*border:\s*0 !important;[^}]*box-shadow:\s*none !important;/s);
assert.match(css, /\.ai-directory-card--integrated \.ai-directory-card__body\s*\{[^}]*padding:\s*16px 0 0;/s);
assert.match(css, /\.ai-directory-card--integrated \.ai-directory-card__bottom\s*\{[^}]*gap:\s*10px;[^}]*padding:\s*0;/s);
assert.match(css, /\.ai-directory-card--integrated:hover \.ai-directory-card__button,[^}]*background:\s*var\(--directory-button-hover-bg\) !important;[^}]*border-color:\s*var\(--directory-button-hover-border\) !important;[^}]*box-shadow:\s*var\(--directory-button-hover-shadow\) !important;/s);
assert.match(css, /\.ai-directory-card--topups\s*\{[^}]*--directory-button-hover-bg:[^}]*--directory-button-hover-shadow:/s);

assert.match(docs, /\.ai-directory-card--integrated/);
assert.match(docs, /ширину ровно как у изображения/);

console.log("Homepage directory-card standard checks passed.");
