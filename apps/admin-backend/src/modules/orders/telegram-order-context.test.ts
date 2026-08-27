import assert from "node:assert/strict";
import { resolveTelegramOrderContext } from "./telegram-order-context";

assert.deepEqual(
  resolveTelegramOrderContext({
    email: "tg_chatgpt_204287307@gptishka.telegram.local",
    orderDetails: {
      contact: {
        telegramUserId: "204287307",
        telegramChatId: "204287307",
        telegramUsername: "KlochkovAlexey",
      },
    },
  }),
  {
    source: "telegram",
    botType: "chatgpt",
    telegramUserId: "204287307",
    telegramChatId: "204287307",
    telegramUsername: "KlochkovAlexey",
  }
);

assert.deepEqual(resolveTelegramOrderContext({ email: "tg_grok_-123@telegram.local" }), {
  source: "telegram",
  botType: "grok",
  telegramUserId: "-123",
  telegramChatId: "-123",
  telegramUsername: null,
});

assert.equal(resolveTelegramOrderContext({ email: "customer@example.com" }), null);

console.log("telegram order context tests passed");
