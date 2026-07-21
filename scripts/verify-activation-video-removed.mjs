import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relativePath => fs.readFileSync(path.join(root, relativePath), "utf8");

for (const relativePath of ["index.html", "en/index.html", "service.html"]) {
  const html = read(relativePath);
  assert.ok(!html.includes("activationVideo"), `${relativePath} keeps the removed section anchor`);
  assert.ok(!html.includes("hero-activation"), `${relativePath} keeps a removed media reference`);
}

for (const relativePath of ["assets/video/hero-activation.mp4", "assets/img/hero-activation-poster.png"]) {
  assert.ok(!fs.existsSync(path.join(root, relativePath)), `${relativePath} must be removed`);
}

console.log("Obsolete activation video checks passed");
