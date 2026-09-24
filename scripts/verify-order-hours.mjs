import assert from "node:assert/strict";
import fs from "node:fs";

const read = (file) => fs.readFileSync(file, "utf8");
const ru = "Мы обрабатываем заказы ежедневно с 08:00 до 20:00 по МСК. Заказы с автоматическим подключением выполняются 24/7. Среднее время ожидания — от 5 минут до 2 часов после оплаты.";
const en = "We process orders daily from 08:00 to 20:00 Moscow time. Orders with automatic activation are handled 24/7. The average wait after payment is 5 minutes to 2 hours.";

for (const file of ["assets/js/app.js", "assets/js/app.min.js", "main.js"]) {
  const source = read(file);
  assert.ok(source.includes(ru), `${file}: checkout timing copy is stale`);
  assert.ok(!source.includes("Если заказ оформлен ночью — подключим с утра."), `${file}: old checkout timing copy remains`);
}

for (const file of ["chatgpt.html", "claude.html", "supergrok.html", "perplexity.html", "gemini.html", "devin.html"]) {
  assert.ok(read(file).includes(ru), `${file}: FAQ timing conflicts with checkout`);
}
for (const file of ["en/chatgpt.html", "en/claude.html", "en/supergrok.html"]) {
  assert.ok(read(file).includes(en), `${file}: English FAQ timing conflicts with checkout`);
}
assert.ok(read("redeem-start.html").includes("MANUAL_SUPPORT_MESSAGE = 'Мы обрабатываем заказы ежедневно с 08:00 до 20:00"), "Russian manual support hours are stale");
assert.ok(read("en/redeem-start.html").includes("MANUAL_SUPPORT_MESSAGE = 'We process orders daily from 08:00 to 20:00"), "English manual support hours are stale");
assert.ok(read("apps/admin-backend/scripts/upsert-perplexity-product.ts").includes("Заказы обрабатываются ежедневно с 08:00 до 20:00"), "Perplexity seed hours are stale");
assert.ok(read("scripts/generate-en-mirror.mjs").includes(ru), "English mirror is missing the updated Russian copy");
assert.ok(read("scripts/en-translations.generated.json").includes(ru), "Generated translations are missing the updated Russian copy");
assert.doesNotThrow(() => JSON.parse(read("scripts/en-translations.generated.json")));

for (const file of [
  "index.html", "en/index.html", "catalog/index.html", "catalog/ai/index.html", "en/catalog/index.html", "en/catalog/ai/index.html",
  "chatgpt.html", "claude.html", "supergrok.html", "perplexity.html", "gemini.html", "devin.html", "midjourney.html", "suno.html",
  "itunes.html", "service.html", "store/vpn/index.html", "en/chatgpt.html", "en/claude.html", "en/supergrok.html",
  "en/midjourney.html", "en/suno.html", "en/store/vpn/index.html",
]) {
  assert.ok(read(file).includes("app.min.js?v=20260924-order-hours2"), `${file}: shared checkout script cache is stale`);
}

console.log("Checkout timing and cache refresh verified.");
