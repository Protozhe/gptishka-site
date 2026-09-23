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
      ["chatgpt-go-login", "withLogin", 1290, "support"],
      ["chatgpt-go-link", "withoutLogin", 990, "activation"],
    ]
  );
});

test("Claude Max exposes only the manual sign-in variant", () => {
  const items = buildPublicProducts(
    {
      id: "claude-max-5x-id",
      slug: "claude-5x-max",
      title: "Claude Max 5x",
      titleEn: "Claude Max 5x",
      description: "Менеджер свяжется после оплаты",
      descriptionEn: "A manager will contact you after payment",
      modalDescription: "",
      modalDescriptionEn: "",
      price: 13450,
      oldPrice: null,
      activationVariants: {
        withLogin: { enabled: true, price: 13450, deliveryType: "manual_login" },
        withoutLogin: { enabled: false, price: 13450, deliveryType: "support_claude" },
      },
      currency: "RUB",
      category: "Claude",
      tags: ["claude", "delivery:manual_login"],
      stock: null,
      visualConfig: null,
      showcasePlacements: [],
    },
    "ru"
  );

  assert.equal(items.length, 1);
  assert.deepEqual(
    [items[0].slug, items[0].activationVariant, items[0].price, items[0].deliveryType],
    ["claude-5x-max-login", "withLogin", 13450, "support"]
  );
});
