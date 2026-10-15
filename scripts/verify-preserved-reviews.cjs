const assert = require("node:assert/strict");
const { mergePreservedReviews } = require("../server/preserved-reviews");
const saved = { sources: [{ id: "old-source" }], items: [
  { id: "old-1", text: "Saved text", date: "2026-10-01", rating: 4 },
  { id: "manual-1", text: "New customer text", sourceType: "customer" },
] };
const current = { totalReviews: 10, sources: [{ id: "live" }], items: [
  { id: "old-1", text: "Changed by refresh" }, { id: "live-1", text: "Fresh review" },
] };
const result = mergePreservedReviews(current, saved);
assert.deepEqual(result.items, [saved.items[0], saved.items[1], current.items[1]]);
assert.equal(result.totalReviews, 11);
assert.equal(result.items[1].rating, undefined);
assert.equal(result.sources.length, 2);
assert.deepEqual(mergePreservedReviews(result, saved), result);
assert.deepEqual(mergePreservedReviews({ items: [], sources: [] }, saved).items, saved.items);
assert.equal(mergePreservedReviews(current, {}), current);
console.log("Preserved reviews survive source loss and refresh, without duplicate IDs or invented ratings.");
