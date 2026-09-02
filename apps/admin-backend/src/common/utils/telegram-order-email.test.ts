import assert from "node:assert/strict";
import test from "node:test";
import { isTelegramOrderEmail } from "./telegram-order-email";

test("recognizes Telegram orders created by the built-in bots", () => {
  assert.equal(isTelegramOrderEmail("tg_grok_123@telegram.local"), true);
});

test("recognizes Telegram orders created through the external bot bridge", () => {
  assert.equal(isTelegramOrderEmail("tg_grok_123@gptishka.telegram.local"), true);
});

test("does not classify regular site customers as Telegram orders", () => {
  assert.equal(isTelegramOrderEmail("customer@example.com"), false);
  assert.equal(isTelegramOrderEmail("customer@telegram.local.example.com"), false);
});
