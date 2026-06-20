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
