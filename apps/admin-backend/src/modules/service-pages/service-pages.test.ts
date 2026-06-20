import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeServicePageInput,
  normalizeServicePagePath,
  normalizeServicePageSlug,
  resolveServicePageTheme,
} from "./service-pages.service";

test("normalizeServicePageSlug creates clean lowercase slugs", () => {
  assert.equal(normalizeServicePageSlug(" ChatGPT Plus "), "chatgpt-plus");
  assert.equal(normalizeServicePageSlug("Claude Pro"), "claude-pro");
  assert.equal(normalizeServicePageSlug(""), "");
});

test("normalizeServicePagePath keeps root slash and strips trailing slash", () => {
  assert.equal(normalizeServicePagePath("chatgpt"), "/chatgpt");
  assert.equal(normalizeServicePagePath("/store/vpn/"), "/store/vpn");
  assert.equal(normalizeServicePagePath("/"), "");
  assert.equal(normalizeServicePagePath("/api/test"), "");
  assert.equal(normalizeServicePagePath("/admin"), "");
});

test("resolveServicePageTheme returns known theme tokens", () => {
  assert.equal(resolveServicePageTheme("emerald").accentColor, "#35f28f");
  assert.equal(resolveServicePageTheme("orange").accentColor, "#ff8a3d");
  assert.equal(resolveServicePageTheme("black").accentColor, "#f5f7fb");
  assert.equal(resolveServicePageTheme("dark-blue").accentColor, "#4aa8ff");
});

test("normalizeServicePageInput derives slug path and service key", () => {
  const input = normalizeServicePageInput({
    title: "Midjourney",
    slug: "",
    path: "",
    serviceKey: "",
    theme: "custom",
    accentColor: "#abcdef",
  });

  assert.equal(input.slug, "midjourney");
  assert.equal(input.path, "/midjourney");
  assert.equal(input.serviceKey, "midjourney");
  assert.equal(input.accentColor, "#abcdef");
});
