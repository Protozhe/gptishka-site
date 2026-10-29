import test from "node:test";
import assert from "node:assert/strict";
import { updateProductSchema, createProductSchema } from "../../modules/products/products.schemas";
import { showcaseSectionUpdateSchema, showcaseServiceCardUpdateSchema } from "../../modules/showcase/showcase.schemas";
import { servicePageUpdateSchema } from "../../modules/service-pages/service-pages.schemas";

test("omitted update fields never reset activation routes, flags, prices or ordering", () => {
  for (const schema of [updateProductSchema, showcaseSectionUpdateSchema, showcaseServiceCardUpdateSchema, servicePageUpdateSchema]) {
    assert.deepEqual(schema.parse({}), {});
    assert.deepEqual(schema.parse({ isActive: false }), { isActive: false });
  }
  assert.deepEqual(updateProductSchema.parse({ price: 2290 }), { price: 2290 });
  assert.deepEqual(updateProductSchema.parse({ tags: [], deliveryType: "code" }), { tags: [], deliveryType: "code" });
});

test("new products still acquire their original create defaults", () => {
  const created = createProductSchema.parse({ title: "Fixture product", titleEn: "Fixture product", description: "Fixture description", descriptionEn: "Fixture description", price: 2290, currency: "RUB", category: "Fixture" });
  assert.deepEqual(created.tags, []);
  assert.equal(created.isActive, true);
  assert.equal(created.deliveryType, "activation");
});

test("partial product updates retain validation of explicitly supplied fields", () => {
  assert.equal(updateProductSchema.safeParse({ price: -1 }).success, false);
  assert.equal(updateProductSchema.safeParse({ isActive: "false" }).success, false);
  assert.equal(updateProductSchema.safeParse({ tags: [""] }).success, false);
});
