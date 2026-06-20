import assert from "node:assert/strict";
import test from "node:test";

setRequiredTestEnv();

test("createPaymentWebhookHandler uses route default provider when payload omits provider", async () => {
  const { createPaymentWebhookHandler } = await import("./payment-webhook.controller");
  const providers: unknown[] = [];
  const handler = createPaymentWebhookHandler("lava", {
    runPaymentWebhookOnce: async (provider, _payload, processWebhook) => {
      providers.push(provider);
      return processWebhook();
    },
    paymentWebhookService: {
      handle: async () => ({ ok: true, duplicate: false, orderId: "ord_1" }),
    },
  });

  const json = await invokeHandler(handler, {
    invoice_id: "inv_1",
    order_id: "ord_1",
    status: "success",
  });

  assert.deepEqual(providers, ["lava"]);
  assert.deepEqual(json, { ok: true, duplicate: false, orderId: "ord_1" });
});

test("createPaymentWebhookHandler keeps gateway as the legacy default", async () => {
  const { createPaymentWebhookHandler } = await import("./payment-webhook.controller");
  const providers: unknown[] = [];
  const handler = createPaymentWebhookHandler("gateway", {
    runPaymentWebhookOnce: async (provider, _payload, processWebhook) => {
      providers.push(provider);
      return processWebhook();
    },
    paymentWebhookService: {
      handle: async () => ({ ok: true, duplicate: false, orderId: "ord_2" }),
    },
  });

  await invokeHandler(handler, {
    invoice_id: "inv_2",
    order_id: "ord_2",
    status: "success",
  });

  assert.deepEqual(providers, ["gateway"]);
});

test("createPaymentWebhookHandler binds idempotency provider to the route", async () => {
  const { createPaymentWebhookHandler } = await import("./payment-webhook.controller");
  const providers: unknown[] = [];
  const handler = createPaymentWebhookHandler("lava", {
    runPaymentWebhookOnce: async (provider, _payload, processWebhook) => {
      providers.push(provider);
      return processWebhook();
    },
    paymentWebhookService: {
      handle: async () => ({ ok: true, duplicate: false, orderId: "ord_3" }),
    },
  });

  await invokeHandler(handler, {
    provider: "gateway",
    invoice_id: "inv_3",
    order_id: "ord_3",
    status: "success",
  });

  assert.deepEqual(providers, ["lava"]);
});

async function invokeHandler(handler: any, payload: Record<string, unknown>) {
  return new Promise<unknown>((resolve, reject) => {
    const req = { body: Buffer.from(JSON.stringify(payload), "utf8") };
    const res = {
      json(body: unknown) {
        resolve(body);
        return this;
      },
    };
    handler(req, res, reject);
  });
}

function setRequiredTestEnv() {
  process.env.APP_URL ||= "https://gptishka.shop";
  process.env.ADMIN_UI_URL ||= "https://admin.gptishka.shop";
  process.env.DATABASE_URL ||= "postgresql://user:password@localhost:5432/gptishka_test";
  process.env.JWT_ACCESS_SECRET ||= "test_access_secret_at_least_16_chars";
  process.env.JWT_REFRESH_SECRET ||= "test_refresh_secret_at_least_16_chars";
}
