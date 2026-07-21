import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const topupsAssetPath = path.join(root, "assets", "img", "home", "topups-promo-bg.webp");
const supergrokAssetPath = path.join(root, "assets", "img", "home", "supergrok-promo-bg.webp");
const cssPath = path.join(root, "assets", "css", "home-wide-marketplace.css");
const indexPath = path.join(root, "index.html");
const servicePath = path.join(root, "apps", "admin-backend", "src", "modules", "homepage", "homepage-content.service.ts");
const sliderPath = path.join(root, "assets", "js", "home-promo-slider.js");

function assert(condition, message) {
  if (!condition) {
    console.error(message);
    process.exit(1);
  }
}

const css = fs.readFileSync(cssPath, "utf8");
const index = fs.readFileSync(indexPath, "utf8");
const service = fs.readFileSync(servicePath, "utf8");
const slider = fs.readFileSync(sliderPath, "utf8");

assert(fs.existsSync(topupsAssetPath), "Missing Steam topups WebP background asset.");
assert(fs.existsSync(supergrokAssetPath), "Missing SuperGrok WebP background asset.");
const topupsCssBlock = css.match(/\.home-promo-slide--topups\s*\{([\s\S]*?)\n\}/);
assert(
  topupsCssBlock && !/url\(/.test(topupsCssBlock[1]),
  "Hidden Steam topups slide must not eagerly load a CSS background image.",
);
assert(
  /\.home-promo-slide--supergrok\s*\{[\s\S]*supergrok-promo-bg\.webp\?v=20260721-promo-webp1/.test(css),
  "Active SuperGrok slide must use the cache-busted WebP background.",
);
assert(
  index.includes("/assets/css/home-critical-bundle.min.css?v=20260722-opening-frame3"),
  "index.html must load the cache-busted homepage CSS bundle.",
);
assert(
  index.includes("/assets/js/home-promo-slider.js?v=20260722-opening-frame2"),
  "index.html must cache-bust home-promo-slider.js for lazy promo backgrounds.",
);
assert(
  index.includes('rel="preload" href="/assets/img/home/supergrok-promo-bg.webp?v=20260721-promo-webp1"') && index.includes('fetchpriority="high"'),
  "index.html must preload the active SuperGrok LCP image with high priority.",
);
assert(
  (service.match(/imageUrl:\s*"\/assets\/img\/home\/topups-promo-bg\.webp\?v=20260721-promo-webp1"/g) || []).length >= 2,
  "Default homepage content must set the WebP topups image for RU and EN slides.",
);
assert(
  /function ensureSlideBackground\(slide\)/.test(slider) && /ensureSlideBackground\(list\[activeIndex\]\)/.test(slider),
  "Homepage promo slider must apply a hidden background only when its slide becomes active.",
);
assert(
  /function fallbackSlideImageUrl\(slide\)/.test(slider) && /topups-promo-bg\.webp\?v=20260721-promo-webp1/.test(slider),
  "Homepage promo slider must lazily fallback to the Steam topups WebP when admin content has an empty imageUrl.",
);

console.log("Homepage promo WebP and lazy background wiring looks good.");
