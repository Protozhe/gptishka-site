import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const script = fs.readFileSync(path.join(root, "assets", "js", "home-promo-slider.js"), "utf8");
const homepage = fs.readFileSync(path.join(root, "index.html"), "utf8");

assert.match(script, /function slideElementMatchesData\(article, slide\)/);
assert.match(script, /function slidesMatchPayload\(track, payloadSlides\)/);
assert.match(
  script,
  /Array\.isArray\(payload\.slides\) && payload\.slides\.length && !slidesMatchPayload\(track, payload\.slides\)/,
  "The slider must preserve matching server-rendered slides.",
);
assert.match(script, /optimizedSlideImageUrl\(slide\.imageUrl\)/, "Explicit admin images must participate in comparison.");
assert.ok(
  homepage.includes("/assets/js/home-promo-slider.js?v=20260721-hero-stable1"),
  "Homepage slider cache version is stale.",
);
assert.ok(
  homepage.includes('fetchpriority="high"') && homepage.includes("supergrok-promo-bg.webp?v=20260721-promo-webp1"),
  "The initial hero image must remain preloaded at high priority.",
);

console.log("Stable hero DOM and LCP wiring verified.");
