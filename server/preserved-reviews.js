"use strict";
const { reviewProductLabel } = require("./review-product-labels");

function mergePreservedReviews(current, preserved) {
  if (!Array.isArray(preserved?.items) || !preserved.items.length) return current;
  const byId = new Map();
  // Saved copies win: future refreshes must not rewrite the fixed review text.
  for (const item of [...preserved.items, ...(current.items || [])]) {
    if (item?.id && !byId.has(item.id)) byId.set(item.id, item);
  }
  const sources = new Map((current.sources || []).map(source => [source.id, source]));
  for (const source of preserved.sources || []) {
    if (!sources.has(source.id)) sources.set(source.id, source);
  }
  const additions = [...byId.keys()].filter(id => !(current.items || []).some(item => item.id === id)).length;
  return {
    ...current,
    sources: [...sources.values()],
    items: [...byId.values()].map(item => ({ ...item, ...(item.detail ? { detail: reviewProductLabel(item.detail) } : {}) })),
    totalReviews: Number(current.totalReviews || 0) + additions,
  };
}

module.exports = { mergePreservedReviews };
