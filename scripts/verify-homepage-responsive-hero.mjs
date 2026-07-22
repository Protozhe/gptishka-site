import assert from "node:assert/strict";
import fs from "node:fs";

const css = fs.readFileSync("assets/css/home-wide-marketplace.css", "utf8");
const slider = fs.readFileSync("assets/js/home-promo-slider.js", "utf8");
const index = fs.readFileSync("index.html", "utf8");

assert.match(css, /\.home-opening-frame\s*\{[^}]*min-height:\s*calc\(100svh\s*-\s*170px\)/s);
assert.match(css, /grid-template-rows:\s*minmax\(340px,\s*1fr\)\s+auto/);
assert.match(css, /\.home-wide-body \.home-opening-frame > \.home-hero-wide\s*\{[^}]*margin:\s*0 auto !important/s);
assert.match(css, /body\.home-wide-body main\.page::before,\s*body\.home-wide-body main\.page::after\s*\{[^}]*display:\s*none !important/s);
assert.match(css, /\.home-wide-page \.ai-directory-card--chatgpt \.ai-directory-card__image\s*\{[^}]*transform:\s*scale\(1\.06\) !important/s);
assert.match(css, /\.home-wide-page \.ai-directory-card--grok \.ai-directory-card__image\s*\{[^}]*transform:\s*scale\(1\.09\) !important/s);
assert.doesNotMatch(css, /\.ai-directory-card--claude \.ai-directory-card__image\s*\{/);
assert.match(css, /\.ai-directory-card--chatgpt \.ai-directory-card__bottom,[\s\S]*?gap:\s*6px;[\s\S]*?padding:\s*0 4px 4px;/);
assert.match(css, /\.ai-directory-card--claude\s*\{[^}]*--directory-button-hover-bg:\s*linear-gradient\(135deg, #ff7a3d, #ff4f1f\)/s);
assert.match(css, /\.ai-directory-card--grok:hover \.ai-directory-card__button::before,[\s\S]*?opacity:\s*1;/);
assert.match(css, /\.ai-directory-card__button-label\s*\{[^}]*z-index:\s*1;/s);
assert.match(fs.readFileSync("assets/js/app.js", "utf8"), /class="ai-directory-card__button-label"/);
assert.match(css, /\.home-opening-frame \.home-promo-slide\s*\{[^}]*background-size:\s*cover/s);
assert.match(css, /\.home-opening-frame \.home-promo-slider__controls\s*\{[^}]*inset:\s*0\s+clamp\(/s);
assert.ok(index.includes('class="home-opening-frame"'));
assert.match(slider, /function preloadFollowingSlide\(/);
assert.match(slider, /requestIdleCallback\(preload/);
assert.ok(index.includes("20260722-card-cta3"));
assert.ok(index.includes("20260722-card-cta1"));

console.log("Responsive homepage hero checks passed.");
