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
assert.match(css, /\.ai-directory-card--claude\s*\{[^}]*--directory-button-hover-bg:\s*linear-gradient\(135deg, #ff7a3d, #ff4f1f\)/s);
assert.match(css, /\.ai-directory-card--integrated:hover \.ai-directory-card__button::before,[\s\S]*?opacity:\s*1;/);
assert.match(css, /\.ai-directory-card__button-label\s*\{[^}]*z-index:\s*1;/s);
assert.match(fs.readFileSync("assets/js/app.js", "utf8"), /class="ai-directory-card__button-label"/);
assert.match(css, /\.ai-directory-card--claude\s*\{[^}]*--directory-button-hover-border:[^}]*--directory-button-hover-shadow:[^}]*--directory-button-focus:/s);
assert.match(css, /\.ai-directory-card--integrated:focus-within \.ai-directory-card__button\s*\{[^}]*background:\s*var\(--directory-button-hover-bg\) !important;[^}]*border-color:\s*var\(--directory-button-hover-border\) !important;[^}]*box-shadow:\s*var\(--directory-button-hover-shadow\) !important;/s);
assert.match(css, /\.ai-directory-card--integrated \.ai-directory-card__button:focus-visible\s*\{[^}]*outline-color:\s*var\(--directory-button-focus\) !important;/s);
assert.match(css, /\.home-opening-frame \.home-promo-slide\s*\{[^}]*background-size:\s*cover/s);
assert.match(css, /@media \(min-width: 761px\)\s*\{[\s\S]*?\.home-opening-frame \.home-promo-slider__controls\s*\{[^}]*inset-inline:\s*0/s);
assert.match(css, /\.home-opening-frame \.home-promo-slider__arrow:first-child\s*\{[^}]*--promo-arrow-x:\s*-50%/s);
assert.match(css, /\.home-opening-frame \.home-promo-slider__arrow:last-child\s*\{[^}]*--promo-arrow-x:\s*50%/s);
assert.match(css, /@media \(max-width: 760px\)\s*\{[\s\S]*?--promo-arrow-x:\s*0/s);
assert.ok(index.includes('class="home-opening-frame"'));
assert.match(slider, /function preloadFollowingSlide\(/);
assert.match(slider, /requestIdleCallback\(preload/);
assert.ok(index.includes("20260722-slider-arrows1"));

console.log("Responsive homepage hero checks passed.");
