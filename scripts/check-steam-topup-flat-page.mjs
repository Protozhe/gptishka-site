import assert from "node:assert/strict";
import fs from "node:fs";

const page = fs.readFileSync("store/steam/topup/index.html", "utf8");
const css = fs.readFileSync("assets/css/steam-topup.css", "utf8");
const script = fs.readFileSync("assets/js/steam-topup.js", "utf8");

assert.ok(page.includes("/assets/css/steam-topup.css?v=20260723-steam-flat1"));
assert.ok(page.includes('class="service-directory-back steam-topup-directory-back"'));
assert.ok(page.includes('href="/store/steam/"'));
assert.ok(page.includes('class="service-directory-back__icon"'));
assert.ok(page.includes("<span>Пополнения</span>"));

for (const removed of [
  'class="steam-topup-hero"',
  "steam-topup-hero__bg",
  "steam-topup-hero__content",
  "steam-topup-hero__facts",
  "Пополнение Steam ключами Манн Ко</h1>",
]) {
  assert.ok(!page.includes(removed), `removed hero marker remains: ${removed}`);
}

for (const preserved of [
  "data-steam-topup-form",
  'name="email"',
  'name="steamTradeUrl"',
  'name="quantity"',
  'name="paymentMethod"',
  "data-steam-topup-submit",
]) {
  assert.ok(page.includes(preserved), `checkout marker is missing: ${preserved}`);
}

assert.ok(script.includes("data-steam-topup-form"));
assert.match(css, /linear-gradient\(180deg, #22262d 0%, #1d2127 46%, #181b20 100%\)/);
assert.match(css, /header\s+:is\(\.nav, \.nav-shell\)\s*\{[^}]*background:\s*transparent !important;/s);
assert.match(css, /\.steam-topup-directory-back\s*\{[^}]*font-family:\s*"Montserrat", Arial, sans-serif;[^}]*font-weight:\s*700;/s);
assert.match(css, /\.service-directory-back__icon\s*\{[^}]*stroke:\s*currentColor;[^}]*stroke-linecap:\s*round;/s);
assert.match(css, /\.steam-topup-shell\s*\{\s*margin-top:\s*0;/s);

console.log("Steam top-up flat page checks passed.");
