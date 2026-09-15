import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const htmlFiles = [];

function visit(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if ([".git", "node_modules", ".codex-artifacts"].includes(entry.name)) continue;
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) visit(filePath);
    else if (entry.name.endsWith(".html")) htmlFiles.push(filePath);
  }
}

visit(root);

for (const filePath of htmlFiles) {
  const html = fs.readFileSync(filePath, "utf8");
  assert.ok(!html.includes('id="siteTicker"'), `${filePath} still contains the retired activation ticker`);
  assert.ok(!html.includes('id="siteTickerSales"'), `${filePath} still contains the retired activation counter`);
  assert.ok(!html.includes("runTickerFallback"), `${filePath} still contains the retired ticker fallback`);
  assert.ok(!html.includes('fetch("/api/stats"'), `${filePath} still polls ticker statistics`);
}

for (const relativePath of ["assets/js/app.js", "assets/js/app.min.js", "main.js"]) {
  const source = fs.readFileSync(path.join(root, relativePath), "utf8");
  assert.ok(!source.includes("siteTicker"), `${relativePath} can still create the retired ticker`);
  assert.ok(!source.includes('"/api/stats"'), `${relativePath} still polls ticker statistics`);
  assert.ok(!source.includes('"/api/heartbeat"'), `${relativePath} still sends ticker heartbeats`);
}

console.log(`Retired storefront activation ticker absent from ${htmlFiles.length} HTML pages and shared client scripts.`);
