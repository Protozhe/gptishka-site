import assert from "node:assert/strict";
import test from "node:test";
import { isSunoPaymentLinkOrder, isSunoProductSlug, validateSunoPaymentLink } from "./suno-payment-link";

const example = "https://checkout.stripe.com/g/pay/cs_live_example123#synthetic-fragment";

test("Suno payment link accepts only a live Stripe Checkout URL shape", () => {
  assert.equal(validateSunoPaymentLink(example), null);
  assert.notEqual(validateSunoPaymentLink(example.replace("https:", "http:")), null);
  assert.notEqual(validateSunoPaymentLink(example.replace("checkout.stripe.com", "checkout.stripe.com.evil.example")), null);
  assert.notEqual(validateSunoPaymentLink(example.replace("cs_live_", "cs_test_")), null);
  assert.notEqual(validateSunoPaymentLink(example.replace("/g/pay/", "/c/pay/")), null);
  assert.notEqual(validateSunoPaymentLink("https://buy.stripe.com/example"), null);
  assert.notEqual(validateSunoPaymentLink("not a url"), null);
});

test("Suno link flow is limited to the two monthly plans", () => {
  assert.equal(isSunoProductSlug("suno-pro-1-month"), true);
  assert.equal(isSunoProductSlug("suno-premier-1-month"), true);
  assert.equal(isSunoProductSlug("suno-free-1-month"), false);
  assert.equal(isSunoProductSlug("midjourney-pro-1"), false);
});

test("existing Suno Premier orders do not silently switch delivery flows", () => {
  assert.equal(isSunoPaymentLinkOrder("suno-premier-1-month", { selection: { paymentLinkFlow: "suno-v1" } }), true);
  assert.equal(isSunoPaymentLinkOrder("suno-premier-1-month", { selection: {} }), false);
  assert.equal(isSunoPaymentLinkOrder("suno-premier-1-month", null), false);
  assert.equal(isSunoPaymentLinkOrder("midjourney-pro-1", { selection: { paymentLinkFlow: "suno-v1" } }), false);
});
