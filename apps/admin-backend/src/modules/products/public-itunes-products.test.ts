import assert from "node:assert/strict";
import test from "node:test";
import { buildPublicItunesProducts } from "./public-itunes-products";

test("iTunes checkout uses admin price and current product slug", () => {
  const items = buildPublicItunesProducts([
    { slug: "itunes-us-5", price: 750, currency: "RUB", tags: ["itunes", "denomination:5", "delivery:code"], activationVariants: null },
    { slug: "itunes-app-store-2", price: 250, currency: "RUB", tags: ["itunes", "denomination:2", "delivery:code"], activationVariants: { withLogin: { enabled: false, price: 300 }, withoutLogin: { enabled: true, price: 250, deliveryType: "code" } } },
  ]);
  assert.deepEqual(items, [
    { denomination: 2, price: 250, slug: "itunes-app-store-2" },
    { denomination: 5, price: 750, slug: "itunes-us-5" },
  ]);
});

test("iTunes storefront omits unavailable variants and non-ruble products", () => {
  const items = buildPublicItunesProducts([
    { slug: "itunes-us-2", price: 300, currency: "RUB", tags: ["itunes", "denomination:2", "delivery:code"], activationVariants: { withLogin: { enabled: false, price: 300 }, withoutLogin: { enabled: false, price: 300, deliveryType: "code" } } },
    { slug: "itunes-us-5", price: 750, currency: "USD", tags: ["itunes", "denomination:5", "delivery:code"], activationVariants: null },
  ]);
  assert.deepEqual(items, []);
});
