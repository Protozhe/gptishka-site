import assert from "node:assert/strict";
import fs from "node:fs";

const css = fs.readFileSync("assets/css/home-wide-marketplace.css", "utf8");
const slider = fs.readFileSync("assets/js/home-promo-slider.js", "utf8");
const index = fs.readFileSync("index.html", "utf8");

assert.match(css, /\.home-opening-frame\s*\{[^}]*min-height:\s*calc\(100svh\s*-\s*170px\)/s);
assert.match(css, /grid-template-rows:\s*minmax\(340px,\s*1fr\)\s+auto/);
assert.match(css, /\.home-opening-frame \.home-promo-slide\s*\{[^}]*background-size:\s*cover/s);
assert.match(css, /\.home-opening-frame \.home-promo-slider__controls\s*\{[^}]*inset:\s*0\s+clamp\(/s);
assert.ok(index.includes('class="home-opening-frame"'));
assert.match(slider, /function preloadFollowingSlide\(/);
assert.match(slider, /requestIdleCallback\(preload/);
assert.ok(index.includes("20260722-opening-frame2"));

console.log("Responsive homepage hero checks passed.");
