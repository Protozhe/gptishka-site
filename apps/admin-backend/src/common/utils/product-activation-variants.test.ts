import assert from "node:assert/strict";
import test from "node:test";
import { resolveActivationVariant } from "./product-activation-variants";

const variants = {
  withLogin: { enabled: true, price: 2299, deliveryType: "manual_login", activationSiteUrl: "" },
  withoutLogin: {
    enabled: true,
    price: 2299,
    deliveryType: "activation",
    activationSiteUrl: "https://aichongzhi.fun/?product=claude",
  },
};

test("server trusts the by-ID delivery choice over a stale frontend variant", () => {
  const selected = resolveActivationVariant(
    variants,
    { price: 2299, deliveryType: "manual_login" },
    "withLogin",
    "id"
  );
  assert.equal(selected.key, "withoutLogin");
  assert.equal(selected.deliveryType, "activation");
  assert.equal(selected.activationSiteUrl, "https://aichongzhi.fun");
});

test("login choice still selects the manual variant", () => {
  const selected = resolveActivationVariant(
    variants,
    { price: 2299, deliveryType: "manual_login" },
    "withoutLogin",
    "login"
  );
  assert.equal(selected.key, "withLogin");
  assert.equal(selected.deliveryType, "manual_login");
});

test("Claude Max support checkout selects the only enabled manual variant", () => {
  const selected = resolveActivationVariant(
    {
      withLogin: { enabled: true, price: 13450, deliveryType: "manual_login" },
      withoutLogin: { enabled: false, price: 13450, deliveryType: "support_claude" },
    },
    { price: 13450, deliveryType: "manual_login" },
    "withLogin",
    "support"
  );
  assert.equal(selected.key, "withLogin");
  assert.equal(selected.enabled, true);
  assert.equal(selected.price, 13450);
  assert.equal(selected.deliveryType, "manual_login");
});
