import assert from "node:assert/strict";
import test from "node:test";
import { buildPublicProducts } from "./public-product-presenter";

test("buildPublicProducts expands enabled activation variants into separate public products", () => {
  const items = buildPublicProducts(
    {
      id: "product-1",
      slug: "chatgpt-go",
      title: "ChatGPT Go",
      titleEn: "",
      description: "Описание",
      descriptionEn: "",
      modalDescription: "",
      modalDescriptionEn: "",
      price: 1290,
      oldPrice: null,
      activationVariants: {
        withLogin: {
          enabled: true,
          price: 1290,
          deliveryType: "manual_login",
          activationSiteUrl: "",
        },
        withoutLogin: {
          enabled: true,
          price: 990,
          deliveryType: "activation",
          activationSiteUrl: "https://9977ai.vip/go.php",
        },
      },
      currency: "RUB",
      category: "ChatGPT",
      tags: ["delivery:manual_login"],
      stock: null,
      visualConfig: null,
      showcasePlacements: [],
    },
    "ru"
  );

  assert.equal(items.length, 2);
  assert.deepEqual(
    items.map((item) => [item.slug, item.activationVariant, item.price, item.deliveryType]),
    [
      ["chatgpt-go-login", "withLogin", 1290, "manual_login"],
      ["chatgpt-go-link", "withoutLogin", 990, "activation"],
    ]
  );
});
