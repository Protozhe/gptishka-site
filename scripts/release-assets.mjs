import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";

export function assertAssetReference(html, asset, label = "page") {
  const refs = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)]
    .map(match => new URL(match[1].replaceAll("&amp;", "&"), "https://gptishka.shop"))
    .filter(url => url.origin === "https://gptishka.shop" && url.pathname === `/${asset}`);
  assert.ok(refs.length, `${label}: missing ${asset}`);
  const digest = crypto.createHash("sha256").update(fs.readFileSync(asset)).digest("hex").slice(0, 16);
  for (const url of refs) {
    assert.equal(url.searchParams.get("v"), `sha256-${digest}`, `${label}: stale content version for ${asset}`);
  }
}
