const test = require("node:test");
const assert = require("node:assert/strict");
const { catalogRows, buildPlan, applyPlan, rollback } = require("./upsert-itunes-products");
const catalog = require("./itunes-regional-catalog.json");

const rows = catalogRows();
function existing(row, extra = {}) {
  return { id: "existing", slug: row.slug, price: 999, currency: "RUB", tags: row.tags, activationVariants: null, ...extra };
}

test("Regional quotes contain 30 distinct denomination pools, with independent RUB prices", () => {
  assert.equal(rows.length, 30);
  assert.equal(new Set(rows.map((row) => row.slug)).size, 30);
  assert.deepEqual(rows.filter((row) => row.denomination === 1000).map(({ region, price }) => [region, price]),
    [["ru", 1599], ["tr", 2848], ["in", 1199]]);
  assert.equal(catalog.retailSurchargeRub, 100);
  for (const region of catalog.regions) {
    for (const item of region.items) assert.equal(item.price - item.sourcePrice, 100);
  }
});

test("Existing US pool is repriced in place without changing inventory, delivery or descriptions", async () => {
  const row = rows.find((entry) => entry.region === "us" && entry.denomination === 5);
  const variants = {
    withoutLogin: { enabled: true, price: 600, deliveryType: "code", activationSiteUrl: "" },
    withLogin: { enabled: false, price: 600, deliveryType: "manual_login", activationSiteUrl: "" },
  };
  const plan = buildPlan([row], [existing(row, { slug: "itunes-app-store-5", activationVariants: variants })]);
  assert.equal(plan[0].slug, "itunes-app-store-5");
  const writes = [];
  await applyPlan({ product: { update: async (args) => writes.push(args), create: async () => assert.fail("Duplicate US pool created") } }, plan);
  assert.deepEqual(Object.keys(writes[0].data).sort(), ["activationVariants", "price"]);
  assert.equal(writes[0].data.price, 659);
  assert.equal(writes[0].data.activationVariants.withoutLogin.price, 659);
  assert.deepEqual(writes[0].data.activationVariants.withLogin, variants.withLogin);
  assert.equal(buildPlan([row], [existing(row, { price: 659, activationVariants: null })])[0].action, "unchanged");
});

test("Duplicate US aliases and mismatched region tags abort the plan", () => {
  const us = rows.find((row) => row.region === "us");
  assert.throws(() => buildPlan([us], [existing(us), existing(us, { slug: "itunes-app-store-2" })]), /Duplicate/);
  assert.throws(() => buildPlan([us], [existing(us, { tags: us.tags.filter((tag) => tag !== "region:us") })]), /does not match/);
});

test("Rollback refuses a later price edit and archives newly created pools without deleting keys", async () => {
  const ru = rows[0];
  const plan = buildPlan([ru], []);
  const writes = [];
  const db = { product: {
    findUnique: async () => existing(ru, { price: ru.price }),
    update: async (args) => writes.push(args),
  } };
  await rollback(db, { plan }, null);
  assert.deepEqual(writes[0].data, { isActive: false, isArchived: true });
  db.product.findUnique = async () => existing(ru, { price: ru.price + 1 });
  await assert.rejects(() => rollback(db, { plan }, null), /changed after the backup/);
});
