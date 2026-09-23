import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const darkReleaseMarker = "20260923-scroll-render1";
const homeReleaseMarker = "20260923-scroll-render1";
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

const homepageClarityRules = [
  "html:has(> body.home-wide-body)",
  "background: #0b0e13 !important",
  "overscroll-behavior-y: none",
  "body.home-wide-body:is(#gptishka-render-safety, *)",
  "body.home-wide-body main.page::before",
  "body.home-wide-body .home-gradient-bg",
  "content: none !important",
  "display: none !important",
  "animation: none !important",
];

for (const relativePath of sharedStyles) {
  const source = fs.readFileSync(path.join(root, relativePath), "utf8");
  for (const rule of requiredRules) {
    if (!source.includes(rule)) {
      throw new Error(`${relativePath} is missing software-rendering guard: ${rule}`);
    }
  }
}

const homepageStyles = fs.readFileSync(
  path.join(root, "assets/css/home-info-sections.css"),
  "utf8",
);
for (const rule of homepageClarityRules) {
  if (!homepageStyles.includes(rule)) {
    throw new Error(`Homepage is missing the clarity guard: ${rule}`);
  }
}

const darkStyles = fs.readFileSync(
  path.join(root, "assets/css/gptishka-global-dark.css"),
  "utf8",
);
if (!darkStyles.includes("overscroll-behavior-y: none")) {
  throw new Error("Dark pages must suppress the browser's edge overscroll flash");
}
for (const [fileName, styles] of [
  ["global dark", darkStyles],
  ["homepage", homepageStyles],
]) {
  if (/backdrop-filter: none !important;\s*-webkit-backdrop-filter: none !important;\s*will-change: auto !important/.test(styles)) {
    throw new Error(`${fileName} must not disable will-change for every descendant`);
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
  if (!source.includes(`/assets/css/gptishka-global-dark.css?v=${darkReleaseMarker}`)) {
    throw new Error(`${path.relative(root, filePath)} uses a stale global dark stylesheet`);
  }
}

if (darkPages < 60) {
  throw new Error(`Expected the render-safe stylesheet on at least 60 dark pages, found ${darkPages}`);
}

for (const relativePath of ["index.html", "en/index.html"]) {
  const source = fs.readFileSync(path.join(root, relativePath), "utf8");
  if (!source.includes(`/assets/css/home-info-sections.css?v=${homeReleaseMarker}`)) {
    throw new Error(`${relativePath} uses a stale homepage rendering stylesheet`);
  }
}

process.stdout.write(
  `Software-rendering safeguards verified on ${darkPages} dark pages and both homepages.\n`,
);
