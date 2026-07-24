import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const sourcePages = [
  "index.html",
  "chatgpt.html",
  "claude.html",
  "supergrok.html",
  "catalog/index.html",
  "catalog/ai/index.html",
  "catalog/vpn/index.html",
  "store/vpn/index.html",
  "store/steam/index.html",
  "store/steam/topup/index.html",
  "about.html",
  "bundle-activation.html",
  "contact.html",
  "guarantee.html",
  "oferta.html",
  "politika.html",
  "redeem-start.html",
  "refund.html",
  "site-map.html",
  "store/vpn/activate/index.html"
];
const outputFile = path.join(root, "scripts/en-translations.generated.json");
const cyrillic = /\p{Script=Cyrillic}/u;
const candidates = new Set();

function addCandidate(value) {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();
  if (!normalized || !cyrillic.test(normalized)) return;
  if (normalized.length > 1800) return;
  candidates.add(normalized);
}

for (const relative of sourcePages) {
  const html = fs.readFileSync(path.join(root, relative), "utf8");
  const markup = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "");

  for (const match of markup.matchAll(/>([^<>]+)</g)) addCandidate(match[1]);
  for (const match of markup.matchAll(
    /\b(?:title|aria-label|alt|placeholder|content)=(["'])([\s\S]*?)\1/gi
  )) {
    addCandidate(match[2]);
  }

  const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1])
    .join("\n");
  for (const match of scripts.matchAll(
    /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`/gs
  )) {
    addCandidate(match[0].slice(1, -1));
  }
  for (const line of scripts.split(/\r?\n/)) {
    for (const match of line.matchAll(/(["'])(.*?)(?<!\\)\1/g)) {
      addCandidate(match[2]);
    }
  }
}

function protectTokens(text) {
  const tokens = [];
  const protectedText = text.replace(
    /\$\{[^}]*\}|https?:\/\/[^\s"'<>]+|<[^>]+>|&(?:#\d+|#x[\da-f]+|[a-z]+);|\\[nrt"'\\]|%\w|\b(?:GPTishka|ChatGPT|Claude|SuperGrok|Grok|OpenAI|Anthropic|xAI|Telegram|Steam|VLESS|VPN|UUID|Order ID|Task|RUB|LAVA|ENOT)\b/gi,
    (value) => {
      const marker = `ZXQPH${tokens.length}QXZ`;
      tokens.push(value);
      return marker;
    }
  );
  return {
    text: protectedText,
    restore(value) {
      let restored = value.replaceAll('"', "”").replaceAll("'", "’");
      tokens.forEach((token, index) => {
        restored = restored.replaceAll(`ZXQPH${index}QXZ`, token);
        restored = restored.replaceAll(`ZXQPH ${index} QXZ`, token);
      });
      return restored;
    }
  };
}

async function translate(source, attempt = 1) {
  const protectedValue = protectTokens(source);
  const url = new URL("https://translate.googleapis.com/translate_a/single");
  url.searchParams.set("client", "gtx");
  url.searchParams.set("sl", "ru");
  url.searchParams.set("tl", "en");
  url.searchParams.set("dt", "t");
  url.searchParams.set("q", protectedValue.text);

  try {
    const response = await fetch(url, {
      headers: { "user-agent": "GPTishka translation build/1.0" }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    const translated = (payload?.[0] || []).map((part) => part?.[0] || "").join("");
    return protectedValue.restore(translated).trim();
  } catch (error) {
    if (attempt >= 4) throw new Error(`Translation failed for "${source}": ${error.message}`);
    await new Promise((resolve) => setTimeout(resolve, attempt * 750));
    return translate(source, attempt + 1);
  }
}

const sourceValues = [...candidates].sort((a, b) => b.length - a.length);
const result = new Array(sourceValues.length);
let cursor = 0;

async function worker() {
  while (cursor < sourceValues.length) {
    const index = cursor++;
    const source = sourceValues[index];
    const translated = await translate(source);
    result[index] = [source, translated];
    if ((index + 1) % 25 === 0 || index + 1 === sourceValues.length) {
      console.log(`Translated ${index + 1}/${sourceValues.length}`);
    }
  }
}

await Promise.all(Array.from({ length: 5 }, worker));
fs.writeFileSync(outputFile, `${JSON.stringify(result, null, 2)}\n`, "utf8");
console.log(`Saved ${result.length} translations to ${path.relative(root, outputFile)}`);
