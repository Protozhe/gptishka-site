import assert from "node:assert/strict";
import test from "node:test";
import { resolveNewAccountSurcharge } from "./new-account-option";

test("new account surcharge applies to every ChatGPT and Claude plan", () => {
  for (const slug of ["chatgpt-go-1m", "chatgpt-plus-1m", "chatgpt-pro-5x", "chatgpt-pro-20x"]) {
    assert.equal(resolveNewAccountSurcharge(slug, "RUB", true), 500);
  }
  for (const slug of ["claude-pro", "claude-5x-max", "claude-20x-max"]) {
    assert.equal(resolveNewAccountSurcharge(slug, "RUB", true), 3000);
  }
});

test("unselected option and unrelated products cannot be charged", () => {
  assert.equal(resolveNewAccountSurcharge("chatgpt-plus-1m", "RUB", false), 0);
  assert.equal(resolveNewAccountSurcharge("claude-pro", "RUB", undefined), 0);
  assert.throws(() => resolveNewAccountSurcharge("suno-pro-1-month", "RUB", true));
  assert.throws(() => resolveNewAccountSurcharge("chatgpt-plus-1m", "USD", true));
});
