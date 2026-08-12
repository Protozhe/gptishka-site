import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const index = read("index.html");
const enIndex = read("en/index.html");
const slider = read("assets/js/home-promo-slider.js");
const css = read("assets/css/home-wide-marketplace.css");
const routes = read("apps/admin-backend/src/modules/homepage/homepage-content.routes.ts");
const stats = JSON.parse(read("apps/admin-backend/data/ai-battle-stats.json"));
const content = JSON.parse(read("apps/admin-backend/data/homepage-content.json"));
const desktopArt = "assets/img/home/ai-battle-logo-bg-v2.webp";
const mobileArt = "assets/img/home/ai-battle-logo-bg-mobile-v2.webp";

assert.equal(content.slides.ru[0].id, "ai-battle", "RU battle slide must be first.");
assert.equal(content.slides.en[0].id, "ai-battle", "EN battle slide must be first.");
assert.equal(content.slides.ru[0].badge, "", "Battle slide badge must be removed.");
assert.equal(
  content.slides.ru[0].description,
  "Выбери своего фаворита в мире искусственного интеллекта.",
  "RU battle description must be spell-checked and current.",
);
assert.equal(stats.chatgpt, 64, "ChatGPT must start with 64 clicks.");
assert.equal(stats.claude, 78, "Claude must start with 78 clicks.");
assert.doesNotMatch(index, />Битва ИИ</);
assert.match(index, /home-promo-slide--ai-battle is-active/);
assert.match(enIndex, /home-promo-slide--ai-battle is-active/);
assert.match(slider, /POST/);
assert.match(slider, /\/api\/public\/ai-battle/);
assert.match(slider, /data-ai-battle-choice/);
assert.match(slider, /data-ai-battle-href/);
assert.match(slider, /keepalive: true/);
assert.match(slider, /window\.location\.assign\(targetUrl\)/);
assert.match(index, /data-ai-battle-choice="chatgpt" data-ai-battle-href="\/chatgpt"/);
assert.match(index, /data-ai-battle-choice="claude" data-ai-battle-href="\/claude"/);
assert.match(css, /\.home-ai-battle__choice--chatgpt/);
assert.match(css, /\.home-ai-battle__choice--claude/);
assert.match(css, /\.home-ai-battle__choice\s*\{[\s\S]*?background: transparent;[\s\S]*?box-shadow: none;/);
assert.ok(fs.existsSync(desktopArt) && fs.statSync(desktopArt).size < 350_000, "Desktop battle art must exist and stay reasonably lightweight.");
assert.ok(fs.existsSync(mobileArt) && fs.statSync(mobileArt).size < 100_000, "Mobile battle art must exist and stay lightweight.");
assert.match(css, /ai-battle-logo-bg-v2\.webp\?v=20260810-ai-battle-logo1/);
assert.match(css, /ai-battle-logo-bg-mobile-v2\.webp\?v=20260810-ai-battle-logo1/);
assert.match(css, /\.home-ai-battle__logo\s*\{[\s\S]*?display: block;/);
assert.match(css, /\.home-ai-battle__stats\s*\{[\s\S]*?margin: 0 auto 48px;/);
assert.match(css, /\.ai-directory-card--perplexity \.ai-directory-card__image--primary\s*\{[\s\S]*?transform: scale\(1\.06\) !important;/);
assert.match(css, /\.ai-directory-card--perplexity\s*\{[\s\S]*?--directory-button-hover-bg: linear-gradient\(135deg, #ffffff, #dce4e8\);[\s\S]*?--directory-button-hover-color: #111820;/);
assert.match(routes, /homepageContentPublicRouter\.post\([\s\S]*?\/ai-battle/);

console.log("Homepage AI battle slide and click counter wiring verified.");
