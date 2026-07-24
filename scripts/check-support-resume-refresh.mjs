import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const css = fs.readFileSync(path.join(root, "assets/css/support-widget.css"), "utf8");
const oldVersion = "support-widget.css?v=20260707-support-unify3";
const newVersion = "support-widget.css?v=20260724-support-resume1";

function collectHtml(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === ".git" || entry.name === "node_modules" || entry.name === "backups") return [];
    if (entry.isDirectory() && entry.name.toLowerCase().includes("backup")) return [];
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) return collectHtml(absolute);
    if (!entry.isFile() || !entry.name.endsWith(".html")) return [];
    return [absolute];
  });
}

const publicHtml = collectHtml(root).filter((absolute) => {
  const relative = path.relative(root, absolute).replaceAll("\\", "/");
  return relative !== "_head_index.html" && relative !== "_tmp_live_index.html";
});

const filesWithNewVersion = [];
for (const absolute of publicHtml) {
  const source = fs.readFileSync(absolute, "utf8");
  assert.equal(source.includes(oldVersion), false, path.relative(root, absolute));
  if (source.includes(newVersion)) filesWithNewVersion.push(absolute);
}

assert.ok(filesWithNewVersion.length >= 40);
assert.ok(css.includes("html body #gptishka-support-widget .support-widget__resume-bubble"));
assert.ok(css.includes("html body.home-wide-body #gptishka-support-widget .support-widget__resume-bubble"));
assert.ok(css.includes("linear-gradient(150deg, rgba(39, 52, 68, 0.98)"));
assert.ok(css.includes("background: #17212e !important"));
assert.ok(css.includes("linear-gradient(135deg, #42ea9d"));

console.log(`Support resume refresh found on ${filesWithNewVersion.length} public pages.`);
