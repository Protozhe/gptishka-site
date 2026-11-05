import assert from "node:assert/strict";
import test from "node:test";
import { buildPublicItunesProducts } from "./public-itunes-products";

test("iTunes checkout uses admin price and current product slug", () => {
  const items = buildPublicItunesProducts([
    { slug: "itunes-us-5", price: 750, currency: "RUB", tags: ["itunes", "denomination:5", "delivery:code"], activationVariants: null },
    { slug: "itunes-app-store-2", price: 250, currency: "RUB", tags: ["itunes", "denomination:2", "delivery:code"], activationVariants: { withLogin: { enabled: false, price: 300 }, withoutLogin: { enabled: true, price: 250, deliveryType: "code" } } },
  ]);
  assert.deepEqual(items, [
    { region: "us", denomination: 2, price: 250, slug: "itunes-app-store-2" },
    { region: "us", denomination: 5, price: 750, slug: "itunes-us-5" },
  ]);
});

test("iTunes regional products keep equal denominations in separate pools", () => {
  const products = ["ru", "us", "tr", "in", "ae"].map((region) => ({
    slug: `itunes-${region}-50`, price: 900, currency: "RUB" as const,
    tags: ["itunes", `region:${region}`, "denomination:50", "delivery:code"],
    activationVariants: null,
  }));
  const wrongRegion = { ...products[0], slug: "itunes-in-50" };
  const wrongAmount = { ...products[0], slug: "itunes-ru-100" };
  const unsupported = { ...products[0], slug: "itunes-ww-50", tags: ["itunes", "region:ww", "denomination:50", "delivery:code"] };
  assert.deepEqual(buildPublicItunesProducts([...products, wrongRegion, wrongAmount, unsupported]).map(({ region, slug }) => [region, slug]),
    products.map((product) => [product.tags[1].slice(7), product.slug]));
});

test("iTunes storefront omits unavailable variants and non-ruble products", () => {
  const items = buildPublicItunesProducts([
    { slug: "itunes-us-2", price: 300, currency: "RUB", tags: ["itunes", "denomination:2", "delivery:code"], activationVariants: { withLogin: { enabled: false, price: 300 }, withoutLogin: { enabled: false, price: 300, deliveryType: "code" } } },
    { slug: "itunes-us-5", price: 750, currency: "USD", tags: ["itunes", "denomination:5", "delivery:code"], activationVariants: null },
  ]);
  assert.deepEqual(items, []);
});
