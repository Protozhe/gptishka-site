import assert from "node:assert/strict";
import test from "node:test";
import { CHATGPT_PLUS_FREE_SITE_URL, CHATGPT_PLUS_IOS_SITE_URL, validateChatGptPlusKeyImport } from "./chatgpt-plus-pool-validation";

test("ChatGPT Plus imports require the selected pool prefix for every key", () => {
  const product = "chatgpt-plus-1";
  assert.equal(validateChatGptPlusKeyImport(product, CHATGPT_PLUS_IOS_SITE_URL, ["IOS-EXAMPLE"]), null);
  assert.equal(validateChatGptPlusKeyImport(product, CHATGPT_PLUS_FREE_SITE_URL, ["GPLUS-EXAMPLE"]), null);
  assert.match(validateChatGptPlusKeyImport(product, CHATGPT_PLUS_IOS_SITE_URL, ["IOS-EXAMPLE", "GPLUS-EXAMPLE"]) || "", /Вся партия отклонена/);
  assert.match(validateChatGptPlusKeyImport(product, CHATGPT_PLUS_FREE_SITE_URL, ["GPLUS-EXAMPLE", "IOS-EXAMPLE"]) || "", /Вся партия отклонена/);
  assert.match(validateChatGptPlusKeyImport(product, CHATGPT_PLUS_FREE_SITE_URL, ["OTHER-EXAMPLE"]) || "", /GPLUS-/);
  assert.match(validateChatGptPlusKeyImport(product, "", ["IOS-EXAMPLE"]) || "", /выберите пул/);
  assert.equal(validateChatGptPlusKeyImport("codex-250", "", ["IOS-EXAMPLE"]), null);
});
