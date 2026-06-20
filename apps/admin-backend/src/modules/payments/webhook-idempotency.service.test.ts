import assert from "node:assert/strict";
import test from "node:test";
import { Prisma } from "@prisma/client";
import { AppError } from "../../common/errors/app-error";
import { buildPaymentWebhookIdentity, runPaymentWebhookOnce } from "./webhook-idempotency.service";

test("buildPaymentWebhookIdentity uses explicit event id when present", () => {
  const identity = buildPaymentWebhookIdentity("gateway", {
    event_id: "evt_123",
    order_id: "ord_1",
    status: "success",
  });

  assert.equal(identity.provider, "gateway");
  assert.equal(identity.eventKey, "event:evt_123");
  assert.equal(identity.orderId, "ord_1");
  assert.equal(identity.status, "success");
});

test("buildPaymentWebhookIdentity creates stable fallback key for identical payloads", () => {
  const payload = { invoice_id: "inv_1", order_id: "ord_1", status: "success", amount: "990.00" };
  const first = buildPaymentWebhookIdentity("gateway", payload);
  const second = buildPaymentWebhookIdentity("gateway", payload);
  assert.equal(first.eventKey, second.eventKey);
  assert.equal(first.payloadHash, second.payloadHash);
});

test("buildPaymentWebhookIdentity lowercases mixed-case status", () => {
  const identity = buildPaymentWebhookIdentity("gateway", {
    invoice_id: "inv_1",
    order_id: "ord_1",
    status: "SuCcEsS",
  });

  assert.equal(identity.status, "success");
});

test("runPaymentWebhookOnce returns duplicate for processed duplicate without processing", async () => {
  let processCalls = 0;
  const updateCalls: any[] = [];
  const fakeDelegate: FakePaymentWebhookEventDelegate = {
    create: async () => {
      throw uniqueWebhookEventError();
    },
    update: async args => {
      updateCalls.push(args);
      return {
        orderId: "ord_1",
        processedAt: new Date("2026-06-20T10:00:00.000Z"),
        createdAt: new Date("2026-06-20T09:59:00.000Z"),
      };
    },
    deleteMany: async () => {
      throw new Error("deleteMany should not be called");
    },
    delete: async () => {
      throw new Error("delete should not be called");
    },
  };

  const result = await runWithFakeWebhookEvents(fakeDelegate, {
    processWebhook: async () => {
      processCalls += 1;
      return { ok: true, duplicate: false, orderId: "ord_1" };
    },
  });

  assert.deepEqual(result, { ok: true, duplicate: true, orderId: "ord_1" });
  assert.equal(processCalls, 0);
  assert.equal(updateCalls[0].data.duplicateCount.increment, 1);
});

test("runPaymentWebhookOnce rejects recent unprocessed duplicate without processing", async () => {
  let processCalls = 0;
  let deleteCalls = 0;
  const now = new Date("2026-06-20T10:00:00.000Z");
  const fakeDelegate: FakePaymentWebhookEventDelegate = {
    create: async () => {
      throw uniqueWebhookEventError();
    },
    update: async () => ({
      orderId: "ord_1",
      processedAt: null,
      createdAt: new Date("2026-06-20T09:59:00.000Z"),
    }),
    deleteMany: async () => {
      throw new Error("deleteMany should not be called");
    },
    delete: async () => {
      deleteCalls += 1;
      return {};
    },
  };

  await assert.rejects(
    () =>
      runWithFakeWebhookEvents(fakeDelegate, {
        now: () => now,
        processWebhook: async () => {
          processCalls += 1;
          return { ok: true, duplicate: false, orderId: "ord_1" };
        },
      }),
    (error: unknown) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.statusCode, 409);
      return true;
    }
  );
  assert.equal(processCalls, 0);
  assert.equal(deleteCalls, 0);
});

test("runPaymentWebhookOnce deletes stale unprocessed duplicate and processes after recreate", async () => {
  let createCalls = 0;
  let deleteManyCalls = 0;
  let processCalls = 0;
  const updateCalls: any[] = [];
  const deleteManyArgs: any[] = [];
  const now = new Date("2026-06-20T10:00:00.000Z");
  const fakeDelegate: FakePaymentWebhookEventDelegate = {
    create: async () => {
      createCalls += 1;
      if (createCalls === 1) throw uniqueWebhookEventError();
      return { id: "evt_retry" };
    },
    update: async args => {
      updateCalls.push(args);
      if (args.data?.duplicateCount) {
        return {
          orderId: "ord_1",
          processedAt: null,
          createdAt: new Date("2026-06-20T09:49:00.000Z"),
        };
      }
      return { id: "evt_retry" };
    },
    deleteMany: async args => {
      deleteManyCalls += 1;
      deleteManyArgs.push(args);
      return { count: 1 };
    },
    delete: async () => {
      throw new Error("delete should not be called for stale cleanup");
    },
  };

  const result = await runWithFakeWebhookEvents(fakeDelegate, {
    now: () => now,
    processWebhook: async () => {
      processCalls += 1;
      return { ok: true, duplicate: false, orderId: "ord_1" };
    },
  });

  assert.deepEqual(result, { ok: true, duplicate: false, orderId: "ord_1" });
  assert.equal(createCalls, 2);
  assert.equal(deleteManyCalls, 1);
  assert.equal(deleteManyArgs[0].where.provider, "gateway");
  assert.equal(deleteManyArgs[0].where.eventKey, "event:evt_1");
  assert.equal(deleteManyArgs[0].where.processedAt, null);
  assert.deepEqual(deleteManyArgs[0].where.createdAt, { lte: new Date("2026-06-20T09:50:00.000Z") });
  assert.equal(processCalls, 1);
  assert.ok(updateCalls.some(args => args.where?.id === "evt_retry"));
});

test("runPaymentWebhookOnce rejects stale duplicate when conditional cleanup loses race", async () => {
  let processCalls = 0;
  let createCalls = 0;
  const now = new Date("2026-06-20T10:00:00.000Z");
  const fakeDelegate: FakePaymentWebhookEventDelegate = {
    create: async () => {
      createCalls += 1;
      throw uniqueWebhookEventError();
    },
    update: async () => ({
      orderId: "ord_1",
      processedAt: null,
      createdAt: new Date("2026-06-20T09:49:00.000Z"),
    }),
    deleteMany: async () => ({ count: 0 }),
    delete: async () => {
      throw new Error("delete should not be called for stale cleanup");
    },
  };

  await assert.rejects(
    () =>
      runWithFakeWebhookEvents(fakeDelegate, {
        now: () => now,
        processWebhook: async () => {
          processCalls += 1;
          return { ok: true, duplicate: false, orderId: "ord_1" };
        },
      }),
    (error: unknown) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.statusCode, 409);
      return true;
    }
  );
  assert.equal(createCalls, 1);
  assert.equal(processCalls, 0);
});

type FakePaymentWebhookEventDelegate = {
  create(args: any): Promise<any>;
  update(args: any): Promise<any>;
  deleteMany(args: any): Promise<any>;
  delete(args: any): Promise<any>;
};

async function runWithFakeWebhookEvents<T>(
  fakeDelegate: FakePaymentWebhookEventDelegate,
  input: {
    now?: () => Date;
    processWebhook: () => Promise<T>;
  }
) {
  const payload = {
    event_id: "evt_1",
    order_id: "ord_1",
    invoice_id: "inv_1",
    status: "success",
  };

  return (runPaymentWebhookOnce as any)("gateway", payload, input.processWebhook, {
    client: { paymentWebhookEvent: fakeDelegate },
    now: input.now,
    staleAfterMs: 10 * 60 * 1000,
  });
}

function uniqueWebhookEventError() {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "test",
    meta: { target: ["provider", "eventKey"] },
  });
}
