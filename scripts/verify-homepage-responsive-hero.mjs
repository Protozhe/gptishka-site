import assert from "node:assert/strict";
import fs from "node:fs";

const css = fs.readFileSync("assets/css/home-wide-marketplace.css", "utf8");
const slider = fs.readFileSync("assets/js/home-promo-slider.js", "utf8");
const index = fs.readFileSync("index.html", "utf8");

assert.match(css, /--home-promo-aspect:\s*1200\s*\/\s*431/);
assert.match(css, /--home-promo-aspect:\s*640\s*\/\s*430/);
assert.match(css, /--home-promo-aspect:\s*320\s*\/\s*450/);
assert.match(css, /\.home-promo-slider\s*\{[^}]*overflow:\s*hidden/s);
assert.match(css, /\.home-promo-slide\s*\{[^}]*background-size:\s*cover/s);
assert.match(css, /\.home-promo-slider__controls\s*\{[^}]*inset:\s*0\s+clamp\(/s);
assert.match(slider, /function preloadFollowingSlide\(/);
assert.match(slider, /requestIdleCallback\(preload/);
assert.ok(index.includes("20260722-responsive-hero3"));

console.log("Responsive homepage hero checks passed.");
