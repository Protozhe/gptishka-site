import test from "node:test";
import assert from "node:assert/strict";
import { createAppStoreDeliveryService } from "./app-store-delivery";
import { appStoreCard, normalizeAppStoreCode } from "../../common/utils/app-store-card";

const CODE = "XDEMO12345678901";
function fixture() {
  const orders = new Map<string, any>();
  const keys = new Map<string, any>();
  const records = new Map<string, any>();
  const audits: any[] = [];
  const notifications: any[] = [];
  let gate = Promise.resolve();
  const db: any = {
    order: { findUnique: async ({ where }: any) => orders.get(where.id) || null },
    licenseKey: {
      findFirst: async ({ where }: any) => [...keys.values()].find((key) => key.orderId === where.orderId && key.productKey === where.productKey && key.status === where.status) || null,
      findMany: async ({ where }: any) => [...keys.values()].filter((key) => key.orderId === where.orderId && where.status.in.includes(key.status)),
      findUnique: async ({ where }: any) => keys.get(where.keyValue) || null,
      create: async ({ data }: any) => {
        if (keys.has(data.keyValue)) throw Object.assign(new Error(), { code: "P2002" });
        const key = { id: "key-" + keys.size, ...data };
        keys.set(data.keyValue, key); return key;
      },
      updateMany: async ({ where, data }: any) => {
        const key = [...keys.values()].find((key) => key.id === where.id && key.status === where.status && !key.orderId);
        if (!key) return { count: 0 };
        Object.assign(key, data); return { count: 1 };
      },
    },
    licenseKeyAuditLog: { create: async ({ data }: any) => audits.push(data) },
    $queryRaw: async () => [],
    $transaction: (job: any) => {
      const result = gate.then(() => job(db)); gate = result.catch(() => {});
      return result;
    },
  };
  const service = createAppStoreDeliveryService({
    db, records: { findByOrderId: (id) => records.get(id), upsert: (record) => records.set(record.orderId, record) },
    isTrustedPaid: (order) => order?.status === "PAID" && order?.paymentMethod !== "stub" &&
      order?.payments.some((payment: any) => payment.status === "SUCCESS" && payment.provider !== "stub"),
    notify: async (payload) => { notifications.push(payload); },
  });
  function addOrder(id: string, slug = "itunes-ru-500") {
    const order = { id, email: "fixture@example.test", status: "PAID", totalAmount: 628, currency: "RUB", paymentMethod: "pally",
      payments: [{ provider: "pally", status: "SUCCESS" }],
      items: [{ quantity: 1, product: { id: "product-" + slug, slug, title: "App Store 500", tags: ["itunes", "delivery:code"] } }] };
    orders.set(id, order); return order;
  }
  return { service, keys, records, audits, notifications, addOrder };
}

test("Only known App Store cards bypass preloaded inventory, including legacy US pools", () => {
  for (const prefix of ["ru", "us", "tr", "in", "ae", "app-store"]) {
    assert.ok(appStoreCard({ slug: "itunes-" + prefix + "-100", tags: ["itunes", "delivery:code"] }));
  }
  for (const slug of ["chatgpt-plus-1", "itunes-ww-100", "itunes-ru-0", "itunes-ru-100-copy"]) {
    assert.equal(appStoreCard({ slug, tags: ["itunes", "delivery:code"] }), null);
  }
  assert.equal(appStoreCard({ slug: "itunes-us-5", tags: ["itunes", "delivery:activation"] }), null);
  assert.equal(normalizeAppStoreCode("xdem-o123 4567 8901"), CODE);
  assert.equal(normalizeAppStoreCode("ХDEMO12345678901"), "");
});

test("An empty pool remains processing; issuing a code makes the paid delivery ready and auditable", async () => {
  const f = fixture(); f.addOrder("paid");
  const pending = await f.service.read("paid");
  assert.equal(pending.status, "processing"); assert.ok("estimatedMinutes" in pending); assert.equal(pending.estimatedMinutes, 5);
  assert.equal("code" in pending, false);
  await f.service.issue("paid", CODE, "owner-fixture");
  const ready = await f.service.read("paid");
  assert.ok("code" in ready); assert.equal(ready.code, CODE); assert.equal(ready.status, "code_ready");
  assert.equal(f.keys.size, 1); assert.equal(f.audits.length, 1);
  assert.equal(JSON.stringify(f.audits).includes(CODE), false);
  assert.equal(f.notifications.length, 1);
  await f.service.issue("paid", CODE, "owner-fixture");
  assert.equal(f.keys.size, 1); assert.equal(f.audits.length, 1);
});

test("Unpaid, refunded, stub, malformed and other-product orders cannot issue or reveal codes", async () => {
  for (const status of ["PENDING", "REFUNDED", "FAILED"]) {
    const f = fixture(); f.addOrder("blocked").status = status;
    await assert.rejects(() => f.service.issue("blocked", CODE, "owner"), /подтверждённой оплаты/);
    await assert.rejects(() => f.service.read("blocked"), /подтверждённой оплаты/);
    assert.equal(f.keys.size, 0);
  }
  const f = fixture(); f.addOrder("stub").paymentMethod = "stub";
  await assert.rejects(() => f.service.issue("stub", CODE, "owner"), /подтверждённой оплаты/);
  f.addOrder("other", "chatgpt-plus-1");
  await assert.rejects(() => f.service.issue("other", CODE, "owner"), /App Store/);
  f.addOrder("valid");
  await assert.rejects(() => f.service.issue("valid", "wrong", "owner"), /16/);
});

test("Wrong-region stock, reusing a code and two simultaneous different codes are rejected", async () => {
  const f = fixture(); f.addOrder("one"); f.addOrder("two");
  f.keys.set(CODE, { id: "wrong-region", keyValue: CODE, productKey: "itunes-us-5", status: "available" });
  await assert.rejects(() => f.service.issue("one", CODE, "owner"), /другому региону/);
  f.keys.clear();
  const settled = await Promise.allSettled([f.service.issue("one", CODE, "owner"), f.service.issue("one", "XOTHER1234567890", "owner")]);
  assert.equal(settled.filter((row) => row.status === "fulfilled").length, 1);
  assert.equal(f.keys.size, 1);
  await assert.rejects(() => f.service.issue("two", CODE, "owner"), /уже используется/);
  assert.equal((await f.service.read("two")).status, "processing");
});
