const assert = require("node:assert/strict");
const test = require("node:test");
const { plans, apply } = require("./upsert-suno-product.js");

test("Suno offers exactly the two requested monthly paid plans", () => {
  assert.deepEqual(plans.map(({ slug, price }) => ({ slug, price })), [
    { slug: "suno-pro-1-month", price: 1490 },
    { slug: "suno-premier-1-month", price: 3290 },
  ]);
  assert.equal(plans.some(({ key }) => key === "free"), false);
});

test("Suno upsert writes two separate products and one shared storefront page", async () => {
  const calls = { products: [], visuals: [], placements: [], card: null };
  const db = {
    product: { upsert: async (args) => { calls.products.push(args); return { id: args.where.slug, slug: args.where.slug }; } },
    productVisualConfig: { upsert: async (args) => { calls.visuals.push(args); } },
    servicePage: { upsert: async () => ({ id: "suno-page", path: "/suno" }) },
    servicePageProductPlacement: { upsert: async (args) => { calls.placements.push(args); } },
    productShowcaseSection: { findUnique: async () => null },
    productShowcaseServiceCard: { upsert: async (args) => { calls.card = args; } },
  };
  const result = await apply(db);
  assert.equal(result.products.length, 2);
  assert.deepEqual(calls.products.map(({ update }) => update.price), [1490, 3290]);
  assert.equal(calls.products.every(({ update }) => update.tags.includes("delivery:activation")), true);
  assert.equal(calls.products.every(({ update }) => update.activationVariants.withLogin.enabled === false), true);
  assert.equal(calls.visuals.length, 2);
  assert.equal(calls.placements.length, 2);
  assert.equal(calls.card.update.priceText, "от 1 490 RUB");
});
