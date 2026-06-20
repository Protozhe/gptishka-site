import assert from "node:assert/strict";
import test from "node:test";
import { OrderStatus, PaymentStatus } from "@prisma/client";

setRequiredTestEnv();

test("buildOrderTransitionClaim guards success transitions against paid or refunded orders", async () => {
  const { buildOrderTransitionClaim, resolveOrderTransitionClaim } = await import("./payment-webhook.service");
  const claim = buildOrderTransitionClaim({
    mapped: "success",
    orderId: "ord_1",
    paymentId: "inv_1",
  });

  assert.equal(claim.nextOrderStatus, OrderStatus.PAID);
  assert.equal(claim.nextPaymentStatus, PaymentStatus.SUCCESS);
  assert.deepEqual(claim.orderUpdateArgs.where, {
    id: "ord_1",
    status: { notIn: [OrderStatus.PAID, OrderStatus.REFUNDED] },
  });
  assert.deepEqual(claim.orderUpdateArgs.data, {
    status: OrderStatus.PAID,
    paymentId: "inv_1",
  });
  assert.equal(resolveOrderTransitionClaim(claim, 1).runPaidSideEffects, true);
  assert.equal(resolveOrderTransitionClaim(claim, 0).runPaidSideEffects, false);
  assert.equal(resolveOrderTransitionClaim(claim, 0).duplicate, true);
});

test("buildOrderTransitionClaim guards refund transitions only against already refunded orders", async () => {
  const { buildOrderTransitionClaim, resolveOrderTransitionClaim } = await import("./payment-webhook.service");
  const claim = buildOrderTransitionClaim({
    mapped: "refunded",
    orderId: "ord_1",
    paymentId: "inv_1",
  });

  assert.equal(claim.nextOrderStatus, OrderStatus.REFUNDED);
  assert.equal(claim.nextPaymentStatus, PaymentStatus.REFUNDED);
  assert.deepEqual(claim.orderUpdateArgs.where, {
    id: "ord_1",
    status: { not: OrderStatus.REFUNDED },
  });
  assert.equal(resolveOrderTransitionClaim(claim, 1).runRefundSideEffects, true);
  assert.equal(resolveOrderTransitionClaim(claim, 0).runRefundSideEffects, false);
  assert.equal(resolveOrderTransitionClaim(claim, 0).duplicate, true);
});

function setRequiredTestEnv() {
  process.env.APP_URL ||= "https://gptishka.shop";
  process.env.ADMIN_UI_URL ||= "https://admin.gptishka.shop";
  process.env.DATABASE_URL ||= "postgresql://user:password@localhost:5432/gptishka_test";
  process.env.JWT_ACCESS_SECRET ||= "test_access_secret_at_least_16_chars";
  process.env.JWT_REFRESH_SECRET ||= "test_refresh_secret_at_least_16_chars";
}
