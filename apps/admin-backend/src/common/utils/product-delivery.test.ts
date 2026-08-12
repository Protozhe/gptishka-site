import assert from "node:assert/strict";
import test from "node:test";
import { resolveOrderDeliveryType } from "./product-delivery";

test("resolveOrderDeliveryType treats without-login order details as token activation", () => {
  assert.equal(
    resolveOrderDeliveryType(
      {
        selection: {
          activationVariant: "withoutLogin",
          deliveryMethod: "link",
        },
      },
      ["delivery:manual_login"]
    ),
    "activation"
  );
});

test("resolveOrderDeliveryType keeps with-login order details as manual login", () => {
  assert.equal(
    resolveOrderDeliveryType(
      {
        selection: {
          activationVariant: "withLogin",
          deliveryMethod: "login",
        },
      },
      ["delivery:activation"]
    ),
    "manual_login"
  );
});

test("resolveOrderDeliveryType keeps direct gift-card code delivery isolated from activation", () => {
  assert.equal(
    resolveOrderDeliveryType(
      {
        selection: {
          deliveryMethod: "code",
        },
      },
      ["delivery:activation"]
    ),
    "code"
  );
  assert.equal(resolveOrderDeliveryType(null, ["delivery:code"]), "code");
});

test("resolveOrderDeliveryType keeps Perplexity out of the ChatGPT token flow", () => {
  assert.equal(
    resolveOrderDeliveryType(
      {
        selection: {
          serviceKey: "perplexity",
          deliveryMethod: "link",
        },
      },
      ["perplexity"]
    ),
    "manual_login"
  );
});
