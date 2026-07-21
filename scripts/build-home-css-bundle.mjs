import fs from "node:fs";
import path from "node:path";

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

const output = sources
  .map(relativePath => {
    const css = fs.readFileSync(path.join(root, relativePath), "utf8").replace(/^\uFEFF/, "");
    return `/* source: ${relativePath} */\n${css.trim()}\n`;
  })
  .join("\n");

fs.writeFileSync(target, output, "utf8");
console.log(`Built ${path.relative(root, target)} from ${sources.length} files (${Buffer.byteLength(output)} bytes).`);
