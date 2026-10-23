import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { JSDOM } from "jsdom";

const root = "apps/admin-backend/src/modules/";
const presentation = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(root + "notifications/telegram-presentation.ts", "utf8"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText, presentation);
const cards = presentation.exports;
function inspect(html) {
  const body = new JSDOM(html).window.document.body;
  assert.ok(body.textContent.length <= 4096, "Rendered text must fit Telegram's limit");
  assert.ok(html.includes("\n\n"), "Cards need separated blocks");
  assert.ok(body.querySelector("b"), "Cards need a highlighted heading");
  for (const el of body.querySelectorAll("*")) assert.ok(["B", "CODE", "A", "BLOCKQUOTE"].includes(el.tagName));
  assert.equal(body.querySelector("script, img, iframe"), null);
  return body;
}
const injected = '<script>alert("x")</script> & <img src=x>';
const paid = cards.paidManagerCard({ id: "order-123", email: injected, totalAmount: 2290, currency: "RUB" }, "https://gptishka.shop/redeem-start.html?order_id=123&t=fixture");
const paidBody = inspect(paid);
assert.equal(paidBody.querySelector("code").textContent, "order-123");
assert.equal(paidBody.querySelector("a").getAttribute("href"), "https://gptishka.shop/redeem-start.html?order_id=123&t=fixture");
assert.ok(paidBody.textContent.includes(injected));
const review = { orderId: "order-123", rating: 5, productTitle: injected, text: injected.repeat(1000) };
for (const status of ["pending", "approved", "rejected"]) {
  const body = inspect(cards.activationReviewCard(review, status));
  assert.ok(body.querySelector("blockquote"));
  assert.ok(body.textContent.includes({ pending: "Ожидает модерации", approved: "Одобрен", rejected: "Отклонён" }[status]));
}
const event = cards.botAdminEventCard("❌ Ошибка активации", ["Бот: chatgpt", "Order: order-123", `Пользователь: ${injected}`, `Ошибка: ${injected.repeat(500)}`]);
const eventBody = inspect(event);
assert.equal(eventBody.querySelector("code").textContent, "order-123");
assert.ok(eventBody.querySelector("blockquote"));
assert.ok(event.includes("\n\n🧾 Заказ"));
inspect(cards.botAdminEventCard(injected, Array(12).fill(`Текст: ${injected.repeat(100)}`)));

// Exercise the actual send/edit functions: formatting must reach Telegram,
// while moderation callbacks and the durable delivery acknowledgement survive.
const service = ts.createSourceFile("notifications.ts", fs.readFileSync(root + "notifications/notifications.service.ts", "utf8"), ts.ScriptTarget.Latest, true);
let observed;
const context = vm.createContext({ env: { TELEGRAM_BOT_TOKEN: "fixture", TELEGRAM_CHAT_ID: "owner" },
  callAdminTelegramApi: async (method, payload) => { observed = { method, ...payload }; return { message_id: 51 }; },
});
for (const node of service.statements) {
  if (!ts.isFunctionDeclaration(node) || !["sendTelegramNotification", "editTelegramNotification"].includes(node.name?.text)) continue;
  vm.runInContext(ts.transpileModule(node.getText(service).replace("export ", ""), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
}
const markup = { inline_keyboard: [[{ text: "Одобрить", callback_data: "existing-callback" }]] };
assert.equal(await context.sendTelegramNotification(paid, markup), 51);
assert.equal(observed.parse_mode, "HTML"); assert.equal(observed.reply_markup, markup);
await context.editTelegramNotification({ chatId: "owner", messageId: 51, text: cards.activationReviewCard(review, "approved") });
assert.equal(observed.parse_mode, "HTML");
assert.equal(observed.reply_markup.inline_keyboard.length, 0);
console.log("Admin Telegram cards: readable blocks, HTML escaping, safe links, message limits, moderation and delivery payloads passed.");
