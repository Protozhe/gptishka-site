import assert from "node:assert/strict";
import test from "node:test";
import { canonicalProductKey, resolveProductPoolBaseKey } from "./product-key";

test("canonicalProductKey keeps product pools isolated", () => {
  assert.equal(canonicalProductKey("SuperGrok 1"), "supergrok-1");
  assert.equal(canonicalProductKey("SuperGrok 3"), "supergrok-3");
});

test("resolveProductPoolBaseKey honors an explicit product pool", () => {
  assert.equal(
    resolveProductPoolBaseKey({
      slug: "supergrok-3",
      tags: ["supergrok", "month:1", "activation-pool:supergrok-1"],
    }),
    "supergrok-1"
  );
});

test("resolveProductPoolBaseKey uses the product slug when no override exists", () => {
  assert.equal(resolveProductPoolBaseKey({ slug: "chatgpt-go-1", tags: ["month:1"] }), "chatgpt-go-1");
});
