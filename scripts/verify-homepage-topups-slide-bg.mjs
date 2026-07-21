import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const assetPath = path.join(root, "assets", "img", "home", "topups-promo-bg.png");
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

assert(fs.existsSync(assetPath), "Missing Steam topups promo background asset.");
assert(
  /\.home-promo-slide--topups\s*\{[\s\S]*topups-promo-bg\.png/.test(css),
  "Steam topups slide CSS fallback does not reference topups-promo-bg.png.",
);
assert(
  index.includes("/assets/css/home-wide-marketplace.css?v=20260703-topups-promo-bg1"),
  "index.html must cache-bust home-wide-marketplace.css for the restored topups background.",
);
assert(
  index.includes("/assets/js/home-promo-slider.js?v=20260703-topups-promo-bg1"),
  "index.html must cache-bust home-promo-slider.js for the restored topups background fallback.",
);
assert(
  (service.match(/imageUrl:\s*"\/assets\/img\/home\/topups-promo-bg\.png"/g) || []).length >= 2,
  "Default homepage content must set topups imageUrl for RU and EN slides.",
);
assert(
  /safeUrl\(slide\.imageUrl\)/.test(slider) && /style\.setProperty\("--promo-bg"/.test(slider),
  "Homepage promo slider must apply slide.imageUrl to --promo-bg.",
);
assert(
  /function fallbackSlideImageUrl\(slide\)/.test(slider) && /topups-promo-bg\.png\?v=20260703-steam-promo-restore1/.test(slider),
  "Homepage promo slider must fallback to the Steam topups image when admin content has an empty imageUrl.",
);

console.log("Homepage topups slide background wiring looks good.");
