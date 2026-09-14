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
  assert.ok(!html.includes('href="/favicon.ico"'), `${filePath} still uses the cached favicon URL`);
  assert.ok(!html.includes('href="/assets/img/site-icon.png"'), `${filePath} still uses the cached PNG icon URL`);
}

const favicon = fs.readFileSync(path.join(root, "favicon.ico"));
const siteIcon = fs.readFileSync(path.join(root, "assets/img/site-icon.png"));
assert.deepEqual([...favicon.subarray(0, 4)], [0, 0, 1, 0], "favicon.ico must remain a valid ICO file");
assert.deepEqual([...siteIcon.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], "site-icon.png must remain a valid PNG file");

console.log(`Round favicon cache marker verified across ${htmlFiles.length} HTML pages.`);
