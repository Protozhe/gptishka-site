import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const read = relativePath => fs.readFileSync(path.join(root, relativePath), "utf8");
const ru = read("news/index.html");
const en = read("en/news/index.html");
const client = read("assets/js/news-hub.js");
const server = read("server.js");
const payload = JSON.parse(read("data/public-news.json"));
const publicPayload = JSON.parse(read("assets/data/public-news.json"));

function structuralSignature(html) {
  return [...html.matchAll(/<\/?([a-z0-9-]+)([^>]*)>/gi)]
    .map(match => {
      const attributes = match[2];
      const className = attributes.match(/class=["']([^"']*)/)?.[1] || "";
      const id = attributes.match(/id=["']([^"']*)/)?.[1] || "";
      const closing = match[0][1] === "/" ? "/" : "";
      return `${closing}${match[1].toLowerCase()}#${id}.${className}`;
    })
    .join("|");
}

assert.equal(structuralSignature(ru), structuralSignature(en), "RU and EN news layouts differ");
assert.match(ru, /href="https:\/\/gptishka\.shop\/news\/"/);
assert.match(en, /href="https:\/\/gptishka\.shop\/en\/news\/"/);
assert.match(server, /app\.get\("\/api\/public\/news"/);
assert.match(server, /\["\/news", "\/news\/"\]/);
assert.match(server, /\["\/en\/news", "\/en\/news\/"\]/);
assert.match(server, /stale-while-revalidate=3600/);
assert.match(client, /\.textContent\s*=/);
assert.match(client, /document\.createElement/);
assert.doesNotMatch(client, /\.innerHTML\s*=/);
assert.equal(payload.channel, "aimarket_gpt");
assert.deepEqual(publicPayload, payload, "Public and server news caches differ");
assert.ok(Array.isArray(payload.items) && payload.items.length > 0, "News cache is empty");
for (const item of payload.items) {
  assert.match(item.url, /^https:\/\/t\.me\/aimarket_gpt\/\d+$/);
  if (item.imageUrl) {
    assert.match(
      item.imageUrl,
      /^(?:\/assets\/img\/news\/[a-z0-9_.-]+|https:\/\/(?:cdn\d*\.telegram-cdn\.org|cdn\d*\.telesco\.pe|telegram\.org)\/)/i
    );
  }
}

console.log(`News hub OK: ${payload.items.length} cached Telegram posts and matching RU/EN layouts.`);
