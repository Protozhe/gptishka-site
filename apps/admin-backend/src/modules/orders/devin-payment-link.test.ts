import assert from "node:assert/strict";
import test from "node:test";
import { isDevinProductSlug, validateDevinPaymentLink } from "./devin-payment-link";

const example = "https://checkout.stripe.com/g/pay/cs_live_example123#synthetic-fragment";

test("Devin plans use the Stripe-link flow", () => {
  for (const slug of ["devin-pro-1", "devin-max-1", "devin-teams-1"]) assert.equal(isDevinProductSlug(slug), true);
  assert.equal(isDevinProductSlug("suno-pro-1-month"), false);
});

test("Devin checkout links require the exact Stripe live-session host and path", () => {
  assert.equal(validateDevinPaymentLink(example), null);
  for (const value of [
    example.replace("https:", "http:"),
    example.replace("checkout.stripe.com", "checkout.stripe.com.evil.example"),
    example.replace("cs_live_", "cs_test_"),
    example.replace("/g/pay/", "/c/pay/"),
    "https://buy.stripe.com/example",
    "not a url",
  ]) assert.notEqual(validateDevinPaymentLink(value), null);
});
