const assert = require("node:assert/strict");
const test = require("node:test");
const { apply, applyHoverOnly, plans } = require("./upsert-midjourney");

test("Midjourney upsert touches only three plans and their own AI placements", async () => {
  const calls = { products: [], visuals: [], pages: [], pagePlacements: [], showcasePlacements: [], cards: [] };
  const db = {
    product: {
      async upsert(input) {
        calls.products.push(input);
        return { id: `product-${input.where.slug}`, slug: input.where.slug };
      },
    },
    productVisualConfig: { async upsert(input) { calls.visuals.push(input); } },
    servicePage: {
      async upsert(input) {
        calls.pages.push(input);
        return { id: "page-midjourney" };
      },
    },
    servicePageProductPlacement: { async upsert(input) { calls.pagePlacements.push(input); } },
    productShowcaseSection: {
      async findUnique(input) {
        assert.equal(input.where.slug, "подписки-ии");
        return { id: "section-ai", isActive: true, showOnHomepage: true, showInCatalog: true };
      },
      async count() { return 1; },
    },
    productShowcasePlacement: { async upsert(input) { calls.showcasePlacements.push(input); } },
    productShowcaseServiceCard: { async upsert(input) { calls.cards.push(input); } },
  };

  await apply(db);

  assert.deepEqual(plans.map((plan) => [plan.slug, plan.price]), [
    ["midjourney-basic-1", 1190],
    ["midjourney-standard-1", 3349],
    ["midjourney-pro-1", 6590],
  ]);
  assert.deepEqual(calls.products.map((call) => call.where.slug), plans.map((plan) => plan.slug));
  assert.deepEqual(calls.products.map((call) => call.create.price), plans.map((plan) => plan.price));
  for (const call of calls.products) {
    assert.equal(call.create.activationVariants.withoutLogin.enabled, true);
    assert.equal(call.create.activationVariants.withLogin.enabled, false);
    assert.ok(call.create.tags.includes(`activation-pool:${call.where.slug}`));
    assert.equal(call.create.tags.some((tag) => tag.startsWith("badge:")), false);
  }
  assert.equal(calls.visuals.length, 3);
  assert.ok(calls.visuals.every((call) => call.create.hoverImageUrl === "/assets/img/services/midjourney-card-hover-v1.svg"));
  assert.equal(calls.pages.length, 1);
  assert.equal(calls.pages[0].where.slug, "midjourney");
  assert.equal(calls.pagePlacements.length, 3);
  assert.equal(calls.showcasePlacements.length, 3);
  assert.ok(calls.showcasePlacements.every((call) => call.create.sectionId === "section-ai"));
  assert.deepEqual(calls.cards.map((call) => call.where.serviceKey), ["midjourney"]);
  assert.equal(calls.cards[0].create.hoverImageUrl, "/assets/img/services/midjourney-card-hover-v1.svg");
});

test("Midjourney hover repair updates only artwork fields", async () => {
  const updates = [];
  const db = {
    product: {
      async findMany() {
        return plans.map((plan) => ({
          slug: plan.slug,
          visualConfig: { id: `visual-${plan.slug}`, imageUrl: "/assets/img/services/midjourney-card-v1.svg", hoverImageUrl: "" },
        }));
      },
    },
    productShowcaseServiceCard: {
      async findUnique() {
        return { id: "card-midjourney", imageUrl: "/assets/img/services/midjourney-card-v1.svg", hoverImageUrl: "" };
      },
      async update(input) { updates.push(input); },
    },
    productVisualConfig: { async update(input) { updates.push(input); } },
  };

  await applyHoverOnly(db);

  assert.equal(updates.length, 4);
  assert.ok(updates.every((update) => Object.keys(update.data).sort().join(",") === "hoverImageAlt,hoverImageUrl"));
  assert.ok(updates.every((update) => update.data.hoverImageUrl === "/assets/img/services/midjourney-card-hover-v1.svg"));
});
