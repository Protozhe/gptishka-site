const assert = require("node:assert/strict");
const test = require("node:test");
const { normalizePublicTickerEntries } = require("../server");

test("normalizePublicTickerEntries removes private local emails before applying limit", () => {
  const rows = [
    { email: "tg_1@telegram.local", source: "real" },
    { email: "tg_2@telegram.local", source: "real" },
    { email: "tg_3@example.com", source: "real" },
    { email: "tg_4@internal.local", source: "real" },
    { email: "buyer@example.net", source: "system" },
  ];

  const entries = normalizePublicTickerEntries(rows, 2);

  assert.equal(entries.length, 2);
  assert.deepEqual(entries.map(entry => entry.source), ["real", "system"]);
  assert.ok(entries[0].email.endsWith(".com"), entries[0].email);
  assert.ok(entries[1].email.endsWith(".net"), entries[1].email);
  assert.equal(entries.some(entry => entry.email.includes(".local")), false);
  assert.equal(entries.some(entry => entry.email.includes("telegram")), false);
});
