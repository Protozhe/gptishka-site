import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const releaseMarker = "20260919-software-render1";
const sharedStyles = [
  "assets/css/gptishka-global-dark.css",
  "assets/css/home-info-sections.css",
];

const requiredRules = [
  ":is(#gptishka-render-safety, *)",
  "background-attachment: scroll !important",
  "backdrop-filter: none !important",
  "will-change: auto !important",
  "mix-blend-mode: normal !important",
];

for (const relativePath of sharedStyles) {
  const source = fs.readFileSync(path.join(root, relativePath), "utf8");
  for (const rule of requiredRules) {
    if (!source.includes(rule)) {
      throw new Error(`${relativePath} is missing software-rendering guard: ${rule}`);
    }
  }
}

function collectHtmlFiles(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if ([".git", "node_modules"].includes(entry.name)) continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectHtmlFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".html")) {
      files.push(fullPath);
    }
  }
  return files;
}

const htmlFiles = collectHtmlFiles(root);
let darkPages = 0;

for (const filePath of htmlFiles) {
  const source = fs.readFileSync(filePath, "utf8");
  if (!source.includes("/assets/css/gptishka-global-dark.css")) continue;
  darkPages += 1;
  if (!source.includes(`/assets/css/gptishka-global-dark.css?v=${releaseMarker}`)) {
    throw new Error(`${path.relative(root, filePath)} uses a stale global dark stylesheet`);
  }
}

if (darkPages < 60) {
  throw new Error(`Expected the render-safe stylesheet on at least 60 dark pages, found ${darkPages}`);
}

for (const relativePath of ["index.html", "en/index.html"]) {
  const source = fs.readFileSync(path.join(root, relativePath), "utf8");
  if (!source.includes(`/assets/css/home-info-sections.css?v=${releaseMarker}`)) {
    throw new Error(`${relativePath} uses a stale homepage rendering stylesheet`);
  }
}

process.stdout.write(
  `Software-rendering safeguards verified on ${darkPages} dark pages and both homepages.\n`,
);
