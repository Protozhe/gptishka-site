import assert from "node:assert/strict";
import test from "node:test";
import { isMidjourneyProductSlug, validateMidjourneyPaymentLink } from "./midjourney-payment-link";

const example = "https://checkout.stripe.com/c/pay/cs_live_example123#synthetic-fragment";

test("Midjourney link checker accepts only a live Stripe Checkout URL shape", () => {
  assert.equal(validateMidjourneyPaymentLink(example), null);
  assert.equal(validateMidjourneyPaymentLink(example.replace("https:", "http:")) !== null, true);
  assert.equal(validateMidjourneyPaymentLink(example.replace("checkout.stripe.com", "checkout.stripe.com.evil.example")) !== null, true);
  assert.equal(validateMidjourneyPaymentLink(example.replace("cs_live_", "cs_test_")) !== null, true);
  assert.equal(validateMidjourneyPaymentLink("https://buy.stripe.com/example") !== null, true);
  assert.equal(validateMidjourneyPaymentLink("not a url") !== null, true);
});

test("Midjourney product detection is limited to the three requested plans", () => {
  assert.equal(isMidjourneyProductSlug("midjourney-basic-1"), true);
  assert.equal(isMidjourneyProductSlug("midjourney-standard-1"), true);
  assert.equal(isMidjourneyProductSlug("midjourney-pro-1"), true);
  assert.equal(isMidjourneyProductSlug("midjourney-mini-1"), false);
  assert.equal(isMidjourneyProductSlug("chatgpt-plus"), false);
});
