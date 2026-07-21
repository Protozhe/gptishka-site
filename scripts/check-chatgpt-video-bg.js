const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const pagePath = path.join(root, "chatgpt.html");
const cssPath = path.join(root, "assets", "css", "home-stability-hotfix.css");
const videoPath = path.join(root, "assets", "video", "chatgpt-plans-bg.mp4");

const page = fs.readFileSync(pagePath, "utf8");
const css = fs.readFileSync(cssPath, "utf8");

function fail(message) {
  console.error(message);
  process.exit(1);
}

function requireIncludes(source, marker, label) {
  if (!source.includes(marker)) {
    fail(`${label}: missing ${marker}`);
  }
}

function requireNotIncludes(source, marker, label) {
  if (source.includes(marker)) {
    fail(`${label}: unexpected ${marker}`);
  }
}

function requireRegex(source, regex, label) {
  if (!regex.test(source)) {
    fail(`${label}: missing pattern ${regex}`);
  }
}

const heroMatch = page.match(/<section class="service-hero service-hero--chatgpt"[\s\S]*?<\/section>/);
if (!heroMatch) {
  fail("chatgpt.html: ChatGPT service hero block not found");
}

const hero = heroMatch[0];
const expectedHeroDescription =
  "Оформите подписку ChatGPT без лишних сложностей. Выберите тариф, оплатите заказ, а GPTishka возьмёт подключение на себя — с поддержкой и гарантией на весь срок подписки.";

requireIncludes(hero, '<video class="service-hero__video"', "chatgpt.html hero");
requireIncludes(hero, "autoplay", "chatgpt.html hero video");
requireIncludes(hero, "muted", "chatgpt.html hero video");
requireIncludes(hero, "loop", "chatgpt.html hero video");
requireIncludes(hero, "playsinline", "chatgpt.html hero video");
requireIncludes(hero, 'src="/assets/video/chatgpt-plans-bg.mp4?v=20260618-0618"', "chatgpt.html hero video source");
requireIncludes(hero, 'type="video/mp4"', "chatgpt.html hero video source");
requireIncludes(hero, 'class="service-hero__green-overlay"', "chatgpt.html hero");
requireIncludes(hero, 'class="service-hero__dark-overlay"', "chatgpt.html hero");
requireIncludes(hero, '<a class="service-back-link"', "chatgpt.html hero content");
requireIncludes(hero, '<div class="service-hero__content">', "chatgpt.html hero content");
requireIncludes(hero, "<span class=\"service-hero__eyebrow\">Тарифные планы</span>", "chatgpt.html hero label");
requireIncludes(hero, "<h1>ChatGPT</h1>", "chatgpt.html hero title");
requireIncludes(hero, expectedHeroDescription, "chatgpt.html hero description");
requireNotIncludes(hero, 'class="service-hero__stats"', "chatgpt.html hero");
requireNotIncludes(hero, 'class="service-hero__stat"', "chatgpt.html hero");
requireNotIncludes(hero, "serviceMinPrice", "chatgpt.html hero");
requireNotIncludes(hero, "servicePlansCount", "chatgpt.html hero");
requireNotIncludes(hero, "\u0433\u0430\u0440\u0430\u043d\u0442\u0438\u044f \u0438 \u043f\u043e\u0434\u0434\u0435\u0440\u0436\u043a\u0430", "chatgpt.html hero");

if (hero.includes("ИИ-сервис для текста, кода, анализа документов и повседневных задач.")) {
  fail("chatgpt.html hero: old generic description is still used");
}

const galleryMatch = page.match(/<div class="service-product-gallery"[\s\S]*?<\/div>\s*<div class="service-constructor-card">/);
if (!galleryMatch) {
  fail("chatgpt.html: service-product-gallery block not found before constructor card");
}

const gallery = galleryMatch[0];

requireIncludes(gallery, '<img src="/assets/img/services/chatgpt-card.png?v=20260622-header1"', "chatgpt.html gallery");

if (gallery.includes("service-product-gallery__video") || gallery.includes("/assets/video/chatgpt-plans-bg.mp4")) {
  fail("chatgpt.html gallery: video must not be inside the product gallery");
}

requireRegex(css, /\.service-hero\s*>\s*\*:not\(\.service-hero__video\):not\(\.service-hero__green-overlay\):not\(\.service-hero__orange-overlay\):not\(\.service-hero__black-overlay\):not\(\.service-hero__dark-overlay\)\s*\{[\s\S]*z-index:\s*3;/, "CSS hero foreground stacking");
requireRegex(css, /\.service-hero\.service-hero--chatgpt\s*\{[^}]*border-radius:\s*34px;[^}]*\}/, "CSS ChatGPT hero rounded corners");
requireRegex(css, /@media\s*\(max-width:\s*760px\)\s*\{[\s\S]*\.service-hero\.service-hero--chatgpt\s*\{[^}]*border-radius:\s*26px;[^}]*\}/, "CSS ChatGPT hero mobile rounded corners");
requireRegex(css, /\.service-hero__video\s*\{[^}]*position:\s*absolute;[^}]*inset:\s*0;[^}]*width:\s*100%;[^}]*height:\s*100%;[^}]*object-fit:\s*cover;[^}]*border-radius:\s*inherit;[^}]*\}/, "CSS service-hero__video");
requireRegex(css, /\.service-hero__green-overlay\s*\{[\s\S]*rgba\(0,\s*255,\s*120,\s*0\.(?:2[5-9]|3\d|4[0-5])\)/, "CSS hero green overlay");
requireRegex(css, /\.service-hero__dark-overlay\s*\{[\s\S]*rgba\(0,\s*0,\s*0,\s*0\.[1-6]\d?\)/, "CSS hero dark overlay");
requireRegex(css, /\.service-hero\.service-hero--chatgpt\s*\{[^}]*font-family:\s*"Manrope",\s*"Inter",\s*system-ui,[^}]*\}/, "CSS ChatGPT hero font family");
requireRegex(css, /\.service-hero\.service-hero--chatgpt\s+\.service-hero__content\s*\{[^}]*gap:\s*0;[^}]*max-width:\s*760px;[^}]*\}/, "CSS ChatGPT hero content spacing");
requireRegex(css, /\.service-hero\.service-hero--chatgpt\s+\.service-hero__eyebrow\s*\{[^}]*display:\s*block;[^}]*margin:\s*0\s+0\s+14px;[^}]*font-size:\s*14px;[^}]*line-height:\s*1\.2;[^}]*font-weight:\s*600;[^}]*letter-spacing:\s*0\.08em;[^}]*\}/, "CSS ChatGPT hero label typography");
requireRegex(css, /\.service-hero\.service-hero--chatgpt\s+h1\s*\{[^}]*margin:\s*0\s+0\s+22px;[^}]*font-size:\s*clamp\(48px,\s*7vw,\s*96px\);[^}]*line-height:\s*0\.92;[^}]*font-weight:\s*700;[^}]*letter-spacing:\s*-0\.05em;[^}]*\}/, "CSS ChatGPT hero title typography");
requireRegex(css, /\.service-hero\.service-hero--chatgpt\s+p\s*\{[^}]*max-width:\s*760px;[^}]*font-size:\s*clamp\(17px,\s*1\.6vw,\s*22px\);[^}]*line-height:\s*1\.45;[^}]*font-weight:\s*400;[^}]*letter-spacing:\s*-0\.01em;[^}]*color:\s*rgba\(255,\s*255,\s*255,\s*0\.78\);[^}]*\}/, "CSS ChatGPT hero description typography");
requireRegex(css, /@media\s*\(max-width:\s*640px\)\s*\{[\s\S]*\.service-hero\.service-hero--chatgpt\s+h1\s*\{[^}]*font-size:\s*clamp\(44px,\s*15vw,\s*64px\);[^}]*letter-spacing:\s*-0\.04em;[^}]*\}[\s\S]*\.service-hero\.service-hero--chatgpt\s+p\s*\{[^}]*font-size:\s*16px;[^}]*line-height:\s*1\.5;[^}]*max-width:\s*100%;[^}]*\}[\s\S]*\.service-hero\.service-hero--chatgpt\s+\.service-hero__eyebrow\s*\{[^}]*font-size:\s*12px;[^}]*\}/, "CSS ChatGPT hero mobile typography");
requireRegex(css, /\.service-product-gallery img\s*\{[\s\S]*width:\s*min\(100%,\s*470px\);[\s\S]*border-radius:\s*34px;[\s\S]*object-fit:\s*cover;/, "CSS restored gallery image");

if (!fs.existsSync(videoPath)) {
  fail("assets/video/chatgpt-plans-bg.mp4: video asset is missing");
}

console.log("ChatGPT video background structure is valid.");
