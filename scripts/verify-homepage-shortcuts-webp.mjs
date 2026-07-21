import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
const slider = fs.readFileSync(path.join(root, "assets", "js", "home-promo-slider.js"), "utf8");
const service = fs.readFileSync(path.join(root, "apps", "admin-backend", "src", "modules", "homepage", "homepage-content.service.ts"), "utf8");
const data = fs.readFileSync(path.join(root, "apps", "admin-backend", "data", "homepage-content.json"), "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(message);
    process.exit(1);
  }
}

for (const name of [
  "topups-shortcut.webp",
  "topups-shortcut-724.webp",
  "topups-shortcut-384.webp",
  "ai-shortcut.webp",
  "ai-shortcut-724.webp",
  "ai-shortcut-384.webp",
]) {
  assert(fs.existsSync(path.join(root, "assets", "img", "home", name)), `Missing ${name}`);
}
for (const name of [
  "topups-shortcut-724.webp",
  "topups-shortcut-384.webp",
  "ai-shortcut-724.webp",
  "ai-shortcut-384.webp",
]) {
  assert(
    fs.statSync(path.join(root, "assets", "img", "home", name)).size < 30_000,
    `${name} is unexpectedly large.`,
  );
}

assert(
  index.includes("/assets/img/home/ai-shortcut-384.webp?v=20260721-shortcuts-responsive1") &&
    index.includes('srcset="/assets/img/home/ai-shortcut-384.webp'),
  "Static AI shortcut must use the responsive WebP set.",
);
assert(
  index.includes("/assets/js/home-promo-slider.js?v=20260722-responsive-hero3"),
  "Homepage must load the cache-busted shortcut normalizer.",
);
assert(
  /function optimizedShortcutImageUrl\(value\)/.test(slider) &&
    slider.includes("/assets/img/home/topups-shortcut.webp?v=20260721-shortcuts-webp1") &&
    slider.includes("/assets/img/home/ai-shortcut.webp?v=20260721-shortcuts-webp1") &&
    /var image = shortcutImageVariants\(item\.imageUrl\)/.test(slider) &&
    /img\.srcset = image\.srcset/.test(slider) &&
    slider.includes("shortcuts-responsive1"),
  "Live API shortcut paths must be normalized to responsive WebP sets.",
);
for (const source of [service, data]) {
  assert(
    !source.includes("/assets/img/home/topups-shortcut.png") &&
      !source.includes("/assets/img/home/ai-shortcut.png"),
    "Homepage defaults must not retain shortcut PNG paths.",
  );
}

console.log("Homepage shortcut WebP wiring looks good.");
