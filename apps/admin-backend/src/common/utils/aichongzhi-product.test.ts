import assert from "node:assert/strict";
import test from "node:test";
import { resolveAichongzhiProduct } from "./aichongzhi-product";

test("routes every SuperGrok duration to the Grok API product", () => {
  assert.equal(resolveAichongzhiProduct("supergrok-1-sdk4"), "grok");
  assert.equal(resolveAichongzhiProduct("supergrok-2-sdk4"), "grok");
  assert.equal(resolveAichongzhiProduct("supergrok-sdk4"), "grok");
});

test("routes site Claude Pro to the Claude API product", () => {
  assert.equal(resolveAichongzhiProduct("claude-pro"), "claude");
  assert.equal(resolveAichongzhiProduct("claude-pro-sdk5"), "claude");
});

test("does not mix unrelated activation pools", () => {
  assert.equal(resolveAichongzhiProduct("claude-max-5"), null);
  assert.equal(resolveAichongzhiProduct("claude-max-20"), null);
  assert.equal(resolveAichongzhiProduct("x-premium"), null);
  assert.equal(resolveAichongzhiProduct("chatgpt-plus"), null);
});
