import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { ManagerNotificationsOutbox } from "./manager-notifications.outbox";

function fixture(t: {after: (fn: () => void) => void}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "manager-outbox-"));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  let now = 1000;
  const file = path.join(dir, "queue.json");
  return {file, advance: (ms: number) => now += ms, open: () => new ManagerNotificationsOutbox(file, () => now)};
}

test("failed messages persist across restart, back off and become sent only after confirmation", async t => {
  const f = fixture(t); const queue = f.open();
  await queue.enqueue("order-paid");
  await queue.deliver("order-paid", async () => { throw new Error("SECRET request data must not be persisted"); });
  const restarted = f.open();
  assert.equal(restarted.snapshot()[0].status, "pending");
  assert.equal(restarted.snapshot()[0].attempts, 1);
  assert.deepEqual(restarted.dueIds(), []);
  assert.equal(fs.readFileSync(f.file, "utf8").includes("SECRET"), false);
  f.advance(60_000);
  assert.deepEqual(restarted.dueIds(), ["order-paid"]);
  await restarted.deliver("order-paid", async () => 123);
  assert.equal(f.open().snapshot()[0].messageId, 123);
  assert.equal(f.open().snapshot()[0].status, "sent");
  await restarted.enqueue("order-paid");
  let sends = 0;
  await restarted.deliver("order-paid", async () => { sends++; return 124; });
  assert.equal(sends, 0);
});

test("two workers enqueue and claim an order without parallel duplicate sends", async t => {
  const f = fixture(t); const first = f.open(), second = f.open();
  await Promise.all([first.enqueue("order-concurrent"), second.enqueue("order-concurrent")]);
  assert.equal(first.snapshot().length, 1);
  let release!: () => void, started!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const ready = new Promise<void>(resolve => { started = resolve; });
  const sending = first.deliver("order-concurrent", async () => { started(); await gate; return 45; });
  await ready;
  assert.equal(await second.deliver("order-concurrent", async () => { throw new Error("Duplicate dispatch"); }), null);
  release();
  assert.equal(await sending, 45);
});

test("expired leases recover after process loss and unconfirmed delivery remains pending", async t => {
  const f = fixture(t); const queue = f.open();
  await queue.enqueue("order-interrupted");
  const entries = queue.snapshot();
  entries[0].status = "sending"; entries[0].leaseUntil = 900; entries[0].attempts = 1;
  fs.writeFileSync(f.file, JSON.stringify({version: 1, items: entries}));
  assert.deepEqual(f.open().dueIds(), ["order-interrupted"]);
  await f.open().deliver("order-interrupted", async () => 0);
  assert.equal(queue.snapshot()[0].status, "pending");
  assert.equal(queue.snapshot()[0].attempts, 2);
  f.advance(120_000);
  await queue.deliver("order-interrupted", async () => 99);
  assert.equal(queue.snapshot()[0].status, "sent");
});

test("ineligible orders cancel and corrupt storage fails closed", async t => {
  const f = fixture(t); const queue = f.open();
  await queue.enqueue("order-refunded");
  await queue.deliver("order-refunded", async () => null);
  assert.equal(queue.snapshot()[0].status, "cancelled");
  assert.deepEqual(queue.dueIds(), []);
  fs.writeFileSync(f.file, "invalid storage");
  await assert.rejects(() => queue.enqueue("order-new"));
  assert.equal(fs.readFileSync(f.file, "utf8"), "invalid storage");
});
