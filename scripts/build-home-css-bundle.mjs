import fs from "node:fs";
import path from "node:path";
import { minifyCss } from "./css-minifier.mjs";

const root = process.cwd();
const sources = [
  "assets/css/logo.min.css",
  "assets/css/gptishka-header-refresh.css",
  "assets/css/theme.min.css",
  "assets/css/unified-premium.css",
  "assets/css/trust-promo.css",
  "assets/css/home-cro.css",
  "assets/css/home-stability-hotfix.css",
  "assets/css/home-wide-marketplace.css",
];
const target = path.join(root, "assets", "css", "home-critical-bundle.css");
const minifiedTarget = path.join(root, "assets", "css", "home-critical-bundle.min.css");

const output = sources
  .map(relativePath => {
    const css = fs.readFileSync(path.join(root, relativePath), "utf8").replace(/^\uFEFF/, "");
    return `/* source: ${relativePath} */\n${css.trim()}\n`;
  })
  .join("\n");

fs.writeFileSync(target, output, "utf8");
const minified = minifyCss(output);
fs.writeFileSync(minifiedTarget, minified, "utf8");
console.log(
  `Built ${path.relative(root, target)} and ${path.relative(root, minifiedTarget)} from ${sources.length} files ` +
  `(${Buffer.byteLength(output)} -> ${Buffer.byteLength(minified)} bytes).`,
);
