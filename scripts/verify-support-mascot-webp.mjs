import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const script = fs.readFileSync(path.join(root, "assets", "js", "support-widget.js"), "utf8");
const animationPath = path.join(root, "assets", "img", "assistant-cat-left.webp");
const placeholderPath = path.join(root, "assets", "img", "assistant-cat-left.png");

function assert(condition, message) {
  if (!condition) {
    console.error(message);
    process.exit(1);
  }
}

assert(fs.existsSync(animationPath), "Animated mascot WebP is missing.");
assert(fs.existsSync(placeholderPath), "Static mascot placeholder is missing.");
assert(
  script.includes('data-animation-src="/assets/img/assistant-cat-left.webp?v=20260721-mascot-webp1"'),
  "Support widget must point to the cache-busted animated WebP.",
);
assert(!script.includes("assistant-cat-left.gif"), "Support widget must not request the obsolete GIF.");
assert(
  /function \(delay\)[\s\S]*requestIdleCallback/.test(script) &&
    /requestAnimatedMascot\(260\)/.test(script) &&
    /requestAnimatedMascot\(120\)/.test(script),
  "Animated mascot must remain lazy and interaction-triggered.",
);

const htmlFiles = [];
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (
      [".git", "node_modules", "visual-baseline"].includes(entry.name) ||
      entry.name.toLowerCase().includes("backup") ||
      entry.name.startsWith("scratch-") ||
      entry.name.startsWith("_")
    ) continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(fullPath);
    else if (entry.name.endsWith(".html")) htmlFiles.push(fullPath);
  }
}
walk(root);

const widgetPages = htmlFiles.filter((file) => fs.readFileSync(file, "utf8").includes("/assets/js/support-widget.js"));
assert(widgetPages.length > 0, "No HTML pages load the support widget.");
for (const file of widgetPages) {
  const html = fs.readFileSync(file, "utf8");
  assert(
    html.includes("/assets/js/support-widget.js?v=20260721-mascot-webp1"),
    `${path.relative(root, file)} has a stale support widget cache version.`,
  );
}

console.log(`Support mascot WebP wiring looks good across ${widgetPages.length} HTML pages.`);
