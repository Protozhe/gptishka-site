"use strict";

// Server-only procurement building blocks. No worker or public route imports
// this module until merchant access, pricing and the fulfilment oracle pass
// authenticated preflight. Importing it never sends a request or buys a key.
const crypto = require("node:crypto");
const fs = require("node:fs");
const sqlite3 = require("sqlite3");

const CODEX = Object.freeze({ 250: 7500, 500: 14500, 1000: 27600, 2500: 68000 });
function contract(product, accountPlan) {
  const match = /^codex-(250|500|1000|2500)$/.exec(product);
  if (match) {
    if (!["plus", "pro", "pro_5x", "pro_20x", "pro_25x"].includes(accountPlan)) throw Error("eligibility_unconfirmed");
    return Object.freeze({ product, itemId: 69, code: "2DF0B5724CBFF6BF", race: `${match[1]}点数额度`, site: "https://aiee.fun", ceilingMinor: CODEX[match[1]] });
  }
  if (product === "chatgpt-plus-1" && accountPlan === "free") {
    return Object.freeze({ product: "plus_free", itemId: 49, code: "D37C0FB7EC7A21F6", race: "", site: "https://aiee.fun", ceilingMinor: 11300 });
  }
  if (product === "chatgpt-plus-1" && accountPlan === "plus") {
    // Authenticated one-unit API quote, not the 122 CNY wholesale teaser.
    return Object.freeze({ product: "plus_ios", itemId: 30, code: "D024411F1D93A771", race: "", site: "https://vip.sxzfd.com", ceilingMinor: 12400 });
  }
  if (product === "chatgpt-go-1" && accountPlan === "free") return Object.freeze({ product: "go_free", itemId: 29, code: "F286772962B67D84", race: "", site: "https://aiee.fun", ceilingMinor: 3200 });
  if (product === "chatgpt-go-1" && accountPlan === "go") return Object.freeze({ product: "go_ios", itemId: 63, code: "985CC8DEB226854E", race: "", site: "https://vip.sxzfd.com", ceilingMinor: 3500 });
  throw Error("product_route_unmapped");
}

function moneyMinor(value) {
  const text = String(value ?? "");
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) throw Error("quote_price_unconfirmed");
  const amount = Math.round(Number(text) * 100);
  if (!Number.isSafeInteger(amount) || amount < 1) throw Error("quote_price_unconfirmed");
  return amount;
}

function quoteFromReads(expected, item, inventory) {
  if (Number(item?.id) !== expected.itemId || item?.code !== expected.code || !inventory || Number(inventory.delivery_way) !== 0) throw Error("merchant_quote_contract_mismatch");
  let unit;
  if (expected.race) {
    // AISOU inventory currently reports the first category's price even when
    // stock is for a different requested race. Never fall back to base price.
    const category = item.config?.category;
    if (!category || !Object.hasOwn(category, expected.race)) throw Error("quote_variant_unconfirmed");
    const factory = item.config?.category_factory;
    unit = factory && Object.hasOwn(factory, expected.race) ? factory[expected.race] : category[expected.race];
  } else unit = inventory.factory_price;
  const amountMinor = moneyMinor(unit);
  if (amountMinor > expected.ceilingMinor) throw Error("quote_price_over_ceiling");
  return { amountMinor, itemId: expected.itemId, code: expected.code, race: expected.race, quantity: 1, currency: "CNY", available: Number(inventory.count) > 0 };
}

function quoteFromValuation(expected, catalog, inventory, valuation) {
  const matches=[];
  function walk(rows) {
    if (!Array.isArray(rows)) return;
    for (const row of rows) {
      if (Number(row?.id)===expected.itemId && row?.code===expected.code) matches.push(row);
      walk(row?.children);
    }
  }
  walk(catalog);
  const item=matches[0];
  if (matches.length!==1 || Number(item.api_status)!==1 || Number(item.status)!==1 || Number(inventory?.delivery_way)!==0) throw Error("merchant_quote_contract_mismatch");
  if (expected.race) {
    let names=Object.keys(typeof item.config?.category==='object'?item.config.category:{});
    if(typeof item.config==='string') {
      let section='';names=[];
      for(const raw of item.config.split(/\r?\n/)) {
        const line=raw.trim(),heading=/^\[([^\]]+)\]$/.exec(line);
        if(heading){section=heading[1];continue}
        if(section==='category'&&line.includes('=')) names.push(line.slice(0,line.indexOf('=')).trim().replace(/^["']|["']$/g,''));
      }
    }
    if(!names.includes(expected.race)) throw Error("quote_variant_unconfirmed");
  }
  // AISOU's installed API omits currency_code; its owner-funded balance and
  // documented catalog are CNY. Refuse any explicit different currency.
  if(valuation?.currency_code && valuation.currency_code!=="CNY") throw Error("quote_currency_mismatch");
  const valuedMinor=moneyMinor(valuation?.price);
  // The IOS quote endpoint can expose a wholesale teaser (122) while the
  // authenticated one-unit inventory quote is 124. Budget the higher quote;
  // a lower actual receipt is accepted and booked at its actual amount.
  const amountMinor=expected.race?valuedMinor:Math.max(valuedMinor,moneyMinor(inventory.factory_price));
  if(amountMinor>expected.ceilingMinor) throw Error("quote_price_over_ceiling");
  return {amountMinor,itemId:expected.itemId,code:expected.code,race:expected.race,quantity:1,currency:"CNY",available:Number(inventory.count)>0};
}

function keyHint(raw) {
  const value = String(raw || "").trim().toUpperCase();
  let m = /^C(2500|1000|500|250)-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.exec(value);
  if (m) return { product: `codex-${m[1]}`, family: "codex", strength: "observed_prefix" };
  if (/^GPLUS-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(value)) return { product: "plus_free", family: "chatgpt", strength: "observed_prefix" };
  if (/^GPGO-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(value)) return { product: "go_free", family: "chatgpt", strength: "observed_prefix" };
  if (/^GO-[A-Z0-9]{16}$/.test(value)) return { product: "go_ios", family: "chatgpt", strength: "observed_prefix" };
  if (/^IOS-[A-Z0-9]{16}$/.test(value)) return { product: null, family: "ios", strength: "ambiguous" };
  if (/^EEE-[A-Z0-9]{16}$/.test(value)) return { product: null, family: "claude", strength: "family_only" };
  if (/^GGG-[A-Z0-9]{16}$/.test(value)) return { product: null, family: "grok", strength: "family_only" };
  return { product: null, family: null, strength: "unknown" };
}

// Only canonical evidence from a read-only provider check may release a key.
// Descriptions, a matching prefix and a successful HTTP response do not prove
// the denomination, duration, provider route or that the key remains unused.
function disposition(expected, rawKey, evidence) {
  const hint = keyHint(rawKey);
  if (!evidence || evidence.confirmed !== true || evidence.unused !== true || !evidence.product || !evidence.site) return { state: "quarantined", reason: "provider_evidence_required" };
  if (hint.product && hint.product !== evidence.product) return { state: "quarantined", reason: "prefix_provider_disagreement" };
  const family = /^codex-/.test(evidence.product) ? "codex" : /^(plus_|go_|pro_)/.test(evidence.product) ? "chatgpt"
    : /^claude/.test(evidence.product) ? "claude" : /^grok/.test(evidence.product) ? "grok" : null;
  if (hint.family && hint.family !== "ios" && hint.family !== family) return { state: "quarantined", reason: "prefix_provider_disagreement" };
  if (hint.family === "ios" && !/_ios$/.test(evidence.product)) return { state: "quarantined", reason: "prefix_provider_disagreement" };
  if (evidence.product !== expected.product || evidence.site !== expected.site) {
    return { state: "wrong_product", reason: "provider_product_mismatch", actualProduct: evidence.product, actualSite: evidence.site };
  }
  return { state: "verified", reason: "provider_product_confirmed" };
}

function sign(parameters, appKey) {
  const pairs = Object.entries(parameters).filter(([k, v]) => k !== "sign" && v !== "").sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  if (pairs.some(([, v]) => !["string", "number"].includes(typeof v))) throw Error("non_scalar_api_parameter");
  const encoded = new URLSearchParams(pairs.map(([k, v]) => [k, String(v)])).toString();
  return crypto.createHash("md5").update(decodeURIComponent(encoded.replace(/\+/g, " ")) + "&key=" + appKey).digest("hex");
}

class AisouClient {
  constructor({ appId, appKey, fetchImpl = fetch }) {
    if (!/^\d+$/.test(String(appId)) || !appKey) throw Error("merchant_credentials_required");
    this.appId = String(appId); this.appKey = appKey; this.fetch = fetchImpl;
  }
  async request(action, parameters = {}) {
    const paths = { connect: "/shared/authentication/connect", items: "/shared/commodity/items", item: "/shared/commodity/item", inventory: "/shared/commodity/inventory", valuation: "/shared/commodity/valuation", query: "/shared/commodity/query" };
    if (!paths[action]) throw Error("read_only_action_required");
    return this.#post(paths[action], parameters);
  }
  async #post(path, parameters) {
    const data = { ...parameters, app_id: this.appId }; data.sign = sign(data, this.appKey);
    const response = await this.fetch("https://aisou.pro" + path, { method: "POST", redirect: "error", signal: AbortSignal.timeout(20000), headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(data) });
    // Never include provider bodies, signed payloads or credentials in errors.
    if (!response.ok) throw Error("merchant_response_unconfirmed");
    const result = await response.json();
    if (result?.code !== 200) throw Error("merchant_response_unconfirmed");
    return result.data;
  }
}

function stable(value) { return JSON.stringify(value); }
function digest(value) { return crypto.createHash("sha256").update(value).digest("hex"); }
class Journal {
  constructor(file, encryptionKey) {
    if (!Buffer.isBuffer(encryptionKey) || encryptionKey.length !== 32) throw Error("encryption_key_required");
    this.key = encryptionKey;
    this.db = new sqlite3.Database(file);
    this.db.configure("busyTimeout", 10000);
    this.file = file;
  }
  run(sql, params = []) { return new Promise((resolve, reject) => this.db.run(sql, params, function (e) { e ? reject(e) : resolve({ changes: this.changes }); })); }
  get(sql, params = []) { return new Promise((resolve, reject) => this.db.get(sql, params, (e, row) => e ? reject(e) : resolve(row))); }
  async initialize() {
    await this.run("CREATE TABLE IF NOT EXISTS purchases(scope TEXT PRIMARY KEY, contract TEXT NOT NULL, request_no TEXT NOT NULL UNIQUE, state TEXT NOT NULL, encrypted_receipt TEXT, trade_no TEXT, reason TEXT, quoted_minor INTEGER NOT NULL, charged_minor INTEGER)");
    const columns=await new Promise((resolve,reject)=>this.db.all("PRAGMA table_info(purchases)",[],(e,r)=>e?reject(e):resolve(r)));
    if(!columns.some(c=>c.name==='charged_minor')) await this.run("ALTER TABLE purchases ADD COLUMN charged_minor INTEGER");
    await this.run("CREATE TABLE IF NOT EXISTS assets(fingerprint TEXT PRIMARY KEY, scope TEXT NOT NULL, encrypted_key TEXT NOT NULL, state TEXT NOT NULL, product TEXT, site TEXT)");
    if (this.file !== ":memory:") fs.chmodSync(this.file, 0o600);
  }
  seal(value) {
    const iv = crypto.randomBytes(12), c = crypto.createCipheriv("aes-256-gcm", this.key, iv);
    const ciphertext = Buffer.concat([c.update(value, "utf8"), c.final()]);
    return Buffer.concat([iv, c.getAuthTag(), ciphertext]).toString("base64");
  }
  open(value) {
    const b = Buffer.from(value, "base64"), c = crypto.createDecipheriv("aes-256-gcm", this.key, b.subarray(0, 12));
    c.setAuthTag(b.subarray(12, 28)); return Buffer.concat([c.update(b.subarray(28)), c.final()]).toString("utf8");
  }
  async claim(scope, expected, quotedMinor) {
    const requestNo = "gpi-" + digest(scope).slice(0, 40), binding = stable(expected);
    // The insert is the durable dispatch claim. There is no timeout-based
    // stealing: losing the process after this point requires reconciliation.
    const result = await this.run("INSERT OR IGNORE INTO purchases(scope,contract,request_no,state,quoted_minor) VALUES(?,?,?,'sending',?)", [scope, binding, requestNo, quotedMinor]);
    const row = await this.get("SELECT * FROM purchases WHERE scope=?", [scope]);
    if (row.contract !== binding) throw Error("order_contract_changed");
    return { claimed: result.changes === 1, row };
  }
  async receive(scope, receipt) {
    // Persist the entire delivered secret before parsing or validating it.
    await this.run("UPDATE purchases SET state='received',encrypted_receipt=?,trade_no=? WHERE scope=? AND state='sending'", [this.seal(stable(receipt)), String(receipt.tradeNo || ""), scope]);
  }
  async unknown(scope) { await this.run("UPDATE purchases SET state='uncertain',reason='merchant_result_unconfirmed' WHERE scope=? AND state='sending'", [scope]); }
  async assess(scope, expected, verifyKey) {
    const row = await this.get("SELECT * FROM purchases WHERE scope=?", [scope]);
    if (!row || !row.encrypted_receipt || !["received", "quarantined", "wrong_product", "verified"].includes(row.state)) return { state: row?.state || "missing" };
    const receipt = JSON.parse(this.open(row.encrypted_receipt));
    const rawKey = typeof receipt.secret === "string" ? receipt.secret.trim() : "";
    if (!row.trade_no || !rawKey || /\s/.test(rawKey) || rawKey.length > 128 || !/^\d+(?:\.\d{1,2})?$/.test(String(receipt.amount))) {
      await this.run("UPDATE purchases SET state='quarantined',reason='receipt_format_unconfirmed' WHERE scope=?", [scope]);
      return { state: "quarantined", reason: "receipt_format_unconfirmed" };
    }
    const fingerprint = digest(rawKey.toUpperCase());
    await this.run("INSERT OR IGNORE INTO assets(fingerprint,scope,encrypted_key,state) VALUES(?,?,?,'quarantined')", [fingerprint, scope, this.seal(rawKey)]);
    const asset = await this.get("SELECT scope FROM assets WHERE fingerprint=?", [fingerprint]);
    const charged=moneyMinor(receipt.amount);
    let decision;
    if (asset.scope !== scope) decision = { state: "quarantined", reason: "key_already_in_inventory" };
    else if (charged > row.quoted_minor) decision = { state: "quarantined", reason: "charged_amount_differs_from_quote" };
    else {
      let evidence;
      try { evidence = await verifyKey(rawKey, expected.site); } catch { /* retain key and receipt */ }
      decision = disposition(expected, rawKey, evidence);
    }
    await this.run("UPDATE purchases SET state=?,reason=?,charged_minor=? WHERE scope=?", [decision.state, decision.reason, charged, scope]);
    // Wrong/unknown keys stay encrypted and unavailable to customer workers.
    if (asset.scope === scope) await this.run("UPDATE assets SET state=?,product=?,site=? WHERE fingerprint=?", [decision.state === "verified" ? "verified" : "quarantined", decision.actualProduct || (decision.state === "verified" ? expected.product : null), decision.actualSite || (decision.state === "verified" ? expected.site : null), fingerprint]);
    return { ...decision, requestNo: row.request_no, tradeNo: row.trade_no };
  }
  close() { return new Promise((resolve, reject) => this.db.close(e => e ? reject(e) : resolve())); }
}

// buyer is supplied only by a separately reviewed, authenticated integration.
// At most one buyer invocation per durable scope, including process restarts.
async function buyOnce({ enabled = false, journal, scope, expected, quote, buyer, verifyKey }) {
  if (!enabled) return { state: "disabled" };
  if (!scope || !Number.isSafeInteger(quote.amountMinor) || quote.amountMinor < 1 || quote.amountMinor > expected.ceilingMinor || quote.itemId !== expected.itemId || quote.code !== expected.code || quote.race !== expected.race || quote.quantity !== 1 || quote.currency !== "CNY" || quote.available !== true) throw Error("merchant_quote_contract_mismatch");
  const { claimed, row } = await journal.claim(scope, expected, quote.amountMinor);
  if (claimed) {
    try {
      const receipt = await buyer({ shared_code: expected.code, race: expected.race, num: 1, card_id: 0, device: 0, password: "", coupon: "", contact: "", request_no: row.request_no });
      await journal.receive(scope, receipt);
    } catch { await journal.unknown(scope); return { state: "uncertain", requestNo: row.request_no }; }
  }
  return journal.assess(scope, expected, verifyKey);
}

// A corrective purchase is a distinct item, never a replay of an uncertain
// purchase. The integration must also validate its total procurement budget.
async function buyWithOneCorrection(args) {
  const first = await buyOnce({ ...args, scope: args.scope + ":primary" });
  if (first.state !== "wrong_product") return first;
  if (!Number.isSafeInteger(args.totalBudgetMinor) || args.totalBudgetMinor < args.quote.amountMinor * 2) return { ...first, correction: "budget_required" };
  return buyOnce({ ...args, scope: args.scope + ":correction-1" });
}

module.exports = { contract, quoteFromReads, quoteFromValuation, keyHint, disposition, sign, AisouClient, Journal, buyOnce, buyWithOneCorrection };
