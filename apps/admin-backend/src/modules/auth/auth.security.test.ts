import assert from "node:assert/strict";
import test from "node:test";
import { isExplicitlyEnabled } from "./auth.security";

test("isExplicitlyEnabled accepts only true-like explicit values", () => {
  assert.equal(isExplicitlyEnabled(true), true);
  assert.equal(isExplicitlyEnabled("true"), true);
  assert.equal(isExplicitlyEnabled(" TRUE "), true);
  assert.equal(isExplicitlyEnabled("1"), true);
  assert.equal(isExplicitlyEnabled("yes"), true);
});

test("isExplicitlyEnabled rejects empty and false-like values", () => {
  assert.equal(isExplicitlyEnabled(false), false);
  assert.equal(isExplicitlyEnabled("false"), false);
  assert.equal(isExplicitlyEnabled("0"), false);
  assert.equal(isExplicitlyEnabled(""), false);
  assert.equal(isExplicitlyEnabled(undefined), false);
});
