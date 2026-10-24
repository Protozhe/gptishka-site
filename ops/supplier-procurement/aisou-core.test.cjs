"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto"), fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const { contract, quoteFromReads, keyHint, disposition, sign, AisouClient, Journal, buyOnce, buyWithOneCorrection } = require("./aisou-core.cjs");

const key250 = "C250-TEST-TEST-TEST", key500 = "C500-TEST-TEST-TEST";
const expected = contract("codex-250", "plus");
const quote = { amountMinor: 7500, itemId: 69, code: expected.code, race: "250点数额度", quantity: 1, currency: "CNY", available: true };
const goodEvidence = { confirmed: true, unused: true, product: "codex-250", site: "https://aiee.fun" };
async function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "supplier-test-")), file = path.join(dir, "journal.db"), key = crypto.randomBytes(32);
  const journal = new Journal(file, key); await journal.initialize();
  const opened = [journal];
  t.after(async () => { for (const j of opened) await j.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  return { journal, file, key, async restart() { const j = new Journal(file, key); await j.initialize(); opened.push(j); return j; } };
}
const options = journal => ({ enabled: true, journal, scope: "fixture-platform:fixture-account:paid-order", expected, quote, buyer: async () => ({ tradeNo: "fixture-trade", amount: "75.00", secret: key250 }), verifyKey: async () => goodEvidence });

test("exact product, denomination and eligibility select the merchant variant", () => {
  for (const n of [250, 500, 1000, 2500]) assert.equal(contract(`codex-${n}`, "plus").race, `${n}点数额度`);
  assert.equal(contract("chatgpt-plus-1", "free").itemId, 49);
  assert.equal(contract("chatgpt-plus-1", "plus").itemId, 30);
  assert.throws(() => contract("codex-250", "free"), /eligibility/);
  assert.throws(() => contract("chatgpt-pro-20x", "free"), /unmapped/);
  for(const plan of ['go','plus','prolite','prolight','pro','pro_5x','pro_20x']) {
    assert.equal(contract('chatgpt-plus-1',plan).product,'plus_ios');
    assert.equal(contract('chatgpt-go-1',plan).product,'go_ios');
    assert.equal(contract('chatgpt-pro-5x-1',plan).itemId,46);
    assert.equal(contract('chatgpt-pro-20x-1',plan).itemId,32);
    assert.throws(()=>contract('chatgpt-pro-25x-1',plan),/unmapped/);
  }
  assert.equal(contract('chatgpt-pro-5x-1','free').itemId,23);
  assert.equal(contract('chatgpt-pro-20x-1','free').itemId,24);
  assert.equal(contract('chatgpt-pro-25x-1','free').itemId,75);
  assert.throws(()=>contract('chatgpt-go-1','unknown'),/unmapped/);
});

test("prefixes identify hints; IOS and duration-free Grok prefixes stay ambiguous", () => {
  assert.equal(keyHint(key500).product, "codex-500");
  assert.equal(keyHint("IOS-TESTTESTTESTTEST").product, null);
  assert.equal(keyHint("GGG-TESTTESTTESTTEST").product, null);
  assert.equal(keyHint("EEE-TESTTESTTESTTEST").family, "claude");
  assert.equal(disposition(expected, key250, null).state, "quarantined");
  assert.equal(disposition(expected, key500, goodEvidence).reason, "prefix_provider_disagreement");
  assert.equal(disposition(expected, "EEE-TESTTESTTESTTEST", goodEvidence).reason, "prefix_provider_disagreement");
  assert.equal(disposition(expected, key250, { ...goodEvidence, unused: false }).state, "quarantined");
});

test("AISOU's first-variant inventory price cannot turn a 500-credit purchase into a 250-credit order", () => {
  const c = contract("codex-500", "plus");
  const item = { id: 69, code: c.code, config: { category: { "250点数额度": "75", "500点数额度": "145" } } };
  const inventory = { count: 9, delivery_way: 0, price: 75, factory_price: 0, config: { category_factory: { "250点数额度": "75" } } };
  const q = quoteFromReads(c, item, inventory);
  assert.equal(q.amountMinor, 14500); assert.equal(q.race, "500点数额度"); assert.equal(q.quantity, 1);
  assert.throws(() => quoteFromReads(c, { ...item, config: { category: { "250点数额度": "75" } } }, inventory), /variant_unconfirmed/);
  assert.throws(() => quoteFromReads(c, { ...item, config: { category: { "500点数额度": "146" } } }, inventory), /over_ceiling/);
  assert.throws(() => quoteFromReads(c, { ...item, id: 30 }, inventory), /contract_mismatch/);
});

test("signed API encoding matches PHP's sorted urldecoded query format", () => {
  const fixtureValue = "app_id=7&num=1&race=250点数额度&text=a b&key=fixture";
  assert.equal(sign({ text: "a b", race: "250点数额度", num: 1, app_id: "7", empty: "", sign: "ignored" }, "fixture"), crypto.createHash("md5").update(fixtureValue).digest("hex"));
  assert.throws(() => sign({ sku: {} }, "fixture"), /non_scalar/);
});

test("read-only client uses verified TLS defaults, refuses redirects and has no purchase action", async () => {
  let calls = [];
  const client = new AisouClient({ appId: 7, appKey: "fixture-key", fetchImpl: async (url, opts) => { calls.push({ url, opts }); return { ok: true, json: async () => ({ code: 200, data: { balance: "1.00" } }) }; } });
  await client.request("connect");
  assert.equal(calls[0].url, "https://aisou.pro/shared/authentication/connect");
  assert.equal(calls[0].opts.redirect, "error");
  assert.ok(!calls[0].opts.body.toString().includes("fixture-key"));
  await assert.rejects(client.request("trade"), /read_only/);
  assert.equal(calls.length, 1);
});

test("inactive integration sends no purchase and creates no journal claim", async t => {
  const { journal } = await fixture(t); let calls = 0;
  const result = await buyOnce({ ...options(journal), enabled: false, buyer: async () => { calls++; } });
  assert.equal(result.state, "disabled"); assert.equal(calls, 0);
  assert.equal((await journal.get("SELECT count(*) AS n FROM purchases")).n, 0);
});

test("wrong SKU, item, price, quantity and currency are rejected before spending", async t => {
  const { journal } = await fixture(t); let calls = 0;
  for (const changed of [{ race: "500点数额度" }, { itemId: 49 }, { code: "other" }, { amountMinor: 7501 }, { quantity: 2 }, { currency: "USD" }, { available: false }]) {
    await assert.rejects(buyOnce({ ...options(journal), quote: { ...quote, ...changed }, buyer: async () => { calls++; } }), /contract_mismatch/);
  }
  assert.equal(calls, 0);
});

test("parallel calls and a restarted process dispatch exactly one purchase", async t => {
  const f = await fixture(t), restarted = await f.restart(); let calls = 0;
  let finish; const pending = new Promise(resolve => { finish = resolve; });
  const buyer = async () => { calls++; return pending; };
  const first = buyOnce({ ...options(f.journal), buyer });
  while (!calls) await new Promise(resolve => setImmediate(resolve));
  const others = await Promise.all(Array.from({ length: 16 }, () => buyOnce({ ...options(restarted), buyer })));
  assert.ok(others.every(r => r.state === "sending"));
  finish({ tradeNo: "fixture-trade", amount: "75.00", secret: key250 });
  assert.equal((await first).state, "verified");
  assert.equal((await buyOnce({ ...options(restarted), buyer })).state, "verified"); assert.equal(calls, 1);
  assert.ok(!fs.readFileSync(f.file).includes(Buffer.from(key250)), "key must be encrypted at rest");
});

test("timeout or process loss cannot trigger another charge or a corrective purchase", async t => {
  const f = await fixture(t); let calls = 0;
  const buyer = async () => { calls++; throw Error("lost response after merchant acceptance"); };
  assert.equal((await buyWithOneCorrection({ ...options(f.journal), buyer, totalBudgetMinor: 15000 })).state, "uncertain");
  const restarted = await f.restart();
  assert.equal((await buyWithOneCorrection({ ...options(restarted), buyer, totalBudgetMinor: 15000 })).state, "uncertain"); assert.equal(calls, 1);
  await f.journal.claim("crashed-before-receipt", expected, 7500);
  assert.equal((await buyOnce({ ...options(restarted), scope: "crashed-before-receipt", buyer })).state, "sending"); assert.equal(calls, 1);
});

test("an order cannot change the bound merchant product after dispatch", async t => {
  const { journal } = await fixture(t);
  await journal.claim("stable-order", expected, 7500);
  await assert.rejects(journal.claim("stable-order", contract("codex-500", "plus"), 14500), /contract_changed/);
});

test("wrong key is preserved encrypted and exactly one separately identified correction is allowed", async t => {
  const f = await fixture(t); const requests = [];
  const buyer = async payload => { requests.push(payload); return { tradeNo: "fixture-" + requests.length, amount: "75.00", secret: requests.length === 1 ? key500 : key250 }; };
  const verifyKey = async value => ({ ...goodEvidence, product: value === key500 ? "codex-500" : "codex-250" });
  const args = { ...options(f.journal), buyer, verifyKey, totalBudgetMinor: 15000 };
  assert.equal((await buyWithOneCorrection(args)).state, "verified");
  assert.equal((await buyWithOneCorrection(args)).state, "verified");
  assert.equal(requests.length, 2); assert.notEqual(requests[0].request_no, requests[1].request_no);
  assert.equal(requests[0].shared_code, expected.code); assert.equal(requests[1].race, quote.race);
  const wrong = await f.journal.get("SELECT * FROM assets WHERE product='codex-500'");
  assert.equal(wrong.state, "quarantined"); assert.equal(f.journal.open(wrong.encrypted_key), key500);
});

test("unconfirmed key type and insufficient corrective budget cause no extra purchase", async t => {
  const { journal } = await fixture(t); let calls = 0;
  const buyer = async () => { calls++; return { tradeNo: "fixture-" + calls, amount: "75.00", secret: key500 }; };
  const args = { ...options(journal), buyer, totalBudgetMinor: 15000, verifyKey: async () => null };
  assert.equal((await buyWithOneCorrection(args)).state, "quarantined"); assert.equal(calls, 1);
  const result = await buyWithOneCorrection({ ...args, verifyKey: async () => ({ ...goodEvidence, product: "codex-500" }), totalBudgetMinor: 7500 });
  assert.equal(result.correction, "budget_required"); assert.equal(calls, 1);
});

test("a malformed receipt, wrong charged price or reused key cannot be released", async t => {
  const { journal } = await fixture(t);
  for (const [n, receipt] of [
    { tradeNo: "1", amount: "75.00", secret: key250 + "\n" + key500 },
    { tradeNo: "2", amount: "76.00", secret: key250 },
    { amount: "75.00", secret: key250 },
  ].entries()) {
    const r = await buyOnce({ ...options(journal), scope: "bad-receipt-" + n, buyer: async () => receipt });
    assert.equal(r.state, "quarantined");
  }
  assert.equal((await buyOnce({ ...options(journal), scope: "reused-key" })).state, "quarantined");
});
