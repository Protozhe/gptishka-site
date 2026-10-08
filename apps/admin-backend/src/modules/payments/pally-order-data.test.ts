import assert from "node:assert/strict";
import { test } from "node:test";
import { buildPallyOrderData } from "./pally-order-data";

test("Pally order items preserve discounted total and account", () => {
  const order = buildPallyOrderData({
    title: "Xbox Game Pass",
    slug: "xbox-game-pass",
    category: "digital/subscription/xbox",
    quantity: 3,
    amount: 299.99,
    email: "Buyer@Example.com",
    orderDetails: { gift: { recipientContact: "recipient@example.com" } },
  });
  assert.equal(order.payer_email, "buyer@example.com");
  assert.equal(order.type, "normal");
  assert.equal(order.items.reduce((sum, item) => sum + Number(item.price) * Number(item.quantity), 0).toFixed(2), "299.99");
  assert.ok(order.items.every(item => item.extra?.account === "recipient@example.com"));
});

test("Pally Steam orders require a target account and reject synthetic email", () => {
  const base = {
    title: "Mann Co. keys",
    slug: "steam-mannco-key",
    category: "steam",
    quantity: 2,
    amount: 302,
    email: "buyer@example.com",
    orderDetails: { steam: { account: "steam_user" }, contact: { telegram: "@buyer" } },
  };
  const order = buildPallyOrderData(base);
  assert.equal(order.items[0].extra?.steam_account, "steam_user");
  assert.equal(order.items[0].extra?.telegram_username, "buyer");
  assert.throws(() => buildPallyOrderData({ ...base, orderDetails: {} }), /Steam account/);
  assert.throws(() => buildPallyOrderData({ ...base, email: "steam_buyer@telegram.local" }), /real buyer email/);
});
