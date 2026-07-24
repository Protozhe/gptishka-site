import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const pairs = [
  ["index.html", "en/index.html"],
  ["chatgpt.html", "en/chatgpt.html"],
  ["claude.html", "en/claude.html"],
  ["supergrok.html", "en/supergrok.html"],
  ["catalog/index.html", "en/catalog/index.html"],
  ["catalog/ai/index.html", "en/catalog/ai/index.html"],
  ["catalog/vpn/index.html", "en/catalog/vpn/index.html"],
  ["store/vpn/index.html", "en/store/vpn/index.html"],
  ["store/steam/index.html", "en/store/steam/index.html"],
  ["store/steam/topup/index.html", "en/store/steam/topup/index.html"],
  ["about.html", "en/about.html"],
  ["bundle-activation.html", "en/bundle-activation.html"],
  ["contact.html", "en/contact.html"],
  ["guarantee.html", "en/guarantee.html"],
  ["oferta.html", "en/oferta.html"],
  ["politika.html", "en/politika.html"],
  ["redeem-start.html", "en/redeem-start.html"],
  ["refund.html", "en/refund.html"],
  ["site-map.html", "en/site-map.html"],
  ["news/index.html", "en/news/index.html"],
  ["store/vpn/activate/index.html", "en/store/vpn/activate/index.html"]
];
const cyrillic = /\p{Script=Cyrillic}/u;

function structuralSignature(html) {
  const stableMarkup = html
    .replace(/<script[\s\S]*?<\/script>/gi, "<script></script>")
    .replace(/<style[\s\S]*?<\/style>/gi, "<style></style>");
  return [...stableMarkup.matchAll(/<\/?([a-z0-9-]+)([^>]*)>/gi)].map((match) => {
    const attributes = match[2];
    const className = attributes.match(/class=["']([^"']*)/)?.[1] || "";
    const id = attributes.match(/id=["']([^"']*)/)?.[1] || "";
    const closing = match[0][1] === "/" ? "/" : "";
    return `${closing}${match[1].toLowerCase()}#${id}.${className}`;
  }).join("|");
}

function userFacingCyrillic(html) {
  const values = [];
  const markup = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "");

  for (const match of markup.matchAll(/>([^<>]+)</g)) {
    const value = match[1].replace(/\s+/g, " ").trim();
    if (cyrillic.test(value)) values.push(value);
  }
  for (const match of markup.matchAll(
    /\b(?:title|aria-label|alt|placeholder|content)=(["'])([\s\S]*?)\1/gi
  )) {
    const value = match[2].replace(/\s+/g, " ").trim();
    if (cyrillic.test(value)) values.push(value);
  }

  const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1])
    .join("\n");
  for (const match of scripts.matchAll(
    /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`/gs
  )) {
    const value = match[0].slice(1, -1).replace(/\s+/g, " ").trim();
    if (cyrillic.test(value) && value.length < 1800) values.push(value);
  }
  return [...new Set(values)];
}

function inlineScriptErrors(html) {
  const errors = [];
  for (const match of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const attributes = match[1];
    const source = match[2].trim();
    if (!source || /\bsrc\s*=|\btype=["']application\/ld\+json/i.test(attributes)) continue;
    try {
      new Function(source);
    } catch (error) {
      errors.push(error.message);
    }
  }
  return errors;
}

const failures = [];
for (const [ruFile, enFile] of pairs) {
  const ru = fs.readFileSync(path.join(root, ruFile), "utf8");
  const en = fs.readFileSync(path.join(root, enFile), "utf8");
  if (structuralSignature(ru) !== structuralSignature(en)) {
    failures.push(`${enFile}: structure differs from ${ruFile}`);
  }
  const untranslated = userFacingCyrillic(en);
  if (untranslated.length) {
    failures.push(`${enFile}: untranslated strings: ${JSON.stringify(untranslated.slice(0, 8))}`);
  }
  const scriptErrors = inlineScriptErrors(en);
  if (scriptErrors.length) {
    failures.push(`${enFile}: invalid inline script: ${scriptErrors[0]}`);
  }
}

assert.equal(failures.length, 0, failures.join("\n"));
console.log(`English mirrors match ${pairs.length} Russian page structures and contain no untranslated UI strings.`);
