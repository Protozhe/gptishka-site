"use strict";
const fs = require("node:fs"), cp = require("node:child_process"), path = require("node:path");
const { contract, sign, AisouClient, Journal, quoteFromValuation, buyWithOneCorrection } = require("./aisou-core.cjs");

const SECRET_DIR = "/var/lib/gptishka-runtime/supplier-secrets";
const STATE_DIR = "/var/lib/gptishka-runtime/aisou-procurement";
function protectedJson(file) {
  const st = fs.lstatSync(file);
  if (!st.isFile() || st.isSymbolicLink() || (st.mode & 0o027)) throw Error("supplier_settings_permissions");
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

// Curl uses the host's CA store, HTTPS only and no redirects/retries/proxy
// credentials in arguments. Signed parameters and CDKs enter stdin only.
function curlJson(url, body, contentType = "application/x-www-form-urlencoded", timeout = 12000) {
  if (!["https://aisou.pro", "https://aiee.fun", "https://vip.sxzfd.com"].includes(new URL(url).origin)) throw Error("supplier_origin_refused");
  return new Promise((resolve, reject) => {
    const child = cp.spawn("/usr/bin/curl", ["--disable", "--http1.1", "--silent", "--show-error", "--proto", "=https", "--max-time", String(Math.ceil(timeout / 1000)), "--request", "POST", "--header", "Content-Type: " + contentType, "--data-binary", "@-", "--write-out", "\n%{http_code}", url], { stdio: ["pipe", "pipe", "pipe"] });
    let output = Buffer.alloc(0), done = false;
    const fail = () => { if (!done) { done = true; reject(Error("supplier_response_unconfirmed")); } };
    const timer = setTimeout(() => { child.kill("SIGKILL"); fail(); }, timeout + 1500);
    child.stdout.on("data", b => { output = Buffer.concat([output, b]); if (output.length > 1024 * 1024) { child.kill(); fail(); } });
    child.stderr.resume(); child.stdin.on("error", () => {}); child.on("error", () => { clearTimeout(timer); fail(); });
    child.on("close", code => {
      clearTimeout(timer); if (done) return;
      try {
        const text = output.toString("utf8"), end = text.lastIndexOf("\n");
        if (code !== 0 || text.slice(end + 1) !== "200") throw Error();
        const result = JSON.parse(text.slice(0, end)); done = true; resolve(result);
      } catch { fail(); }
    });
    child.stdin.end(body);
  });
}

function merchant(credentials, transport = curlJson) {
  const fetchImpl = async (url, options) => ({ ok: true, json: () => transport(url, options.body.toString(), "application/x-www-form-urlencoded", 30000) });
  const reader = new AisouClient({ appId: credentials.app_id, appKey: credentials.app_key, fetchImpl });
  return {
    async read(action, fields) {
      try { return await reader.request(action, fields); }
      catch { return reader.request(action, fields); } // authenticated reads only
    },
    async buy(fields) {
      // No generic URL, action, quantity or payment-method override is exposed.
      if (fields.num !== 1 || !/^gpi-[a-f0-9]{40}$/.test(fields.request_no)) throw Error("supplier_dispatch_invalid");
      const data = { ...fields, app_id: String(credentials.app_id) }; data.sign = sign(data, credentials.app_key);
      const result = await transport("https://aisou.pro/shared/commodity/trade", new URLSearchParams(data).toString(), "application/x-www-form-urlencoded", 45000);
      if (result?.code !== 200 || !result.data) throw Error("supplier_trade_unconfirmed");
      return result.data;
    },
  };
}

function providerEvidence(site, query, verified) {
  const unused = query?.success === true && ["active", "available", "unused"].includes(String(query.status || "").toLowerCase()) && !query.order_id && !query.recharge_status && !query.previous_failed;
  if (!unused || verified?.success !== true || !verified.sid || verified.can_submit === false) return null;
  let product;
  if (site === "https://aiee.fun" && Number(verified.require_cookie || 0) === 0) {
    const plans = { plus: "plus_free", go: "go_free", pro5x:"pro_5x_free",pro_5x:"pro_5x_free",pro20x:"pro_20x_free",pro_20x:"pro_20x_free",pro25x:"pro_25x_free",pro_25x:"pro_25x_free",pro50x:"pro_25x_free",pro_50x:"pro_25x_free", codex250: "codex-250", codex500: "codex-500", codex1000: "codex-1000", codex2500: "codex-2500" };
    product = plans[verified.plan_type];
    if(String(verified.plan_type||'').startsWith('grok'))product=require('./aisou-core.cjs').grokProductFromProvider(verified);
  } else if (site === "https://vip.sxzfd.com") {
    product = { plus_month: "plus_ios", go_month: "go_ios",pro_5x:"pro_5x_ios",pro5x:"pro_5x_ios",pro_5x_month:"pro_5x_ios",pro5x_month:"pro_5x_ios",pro_20x:"pro_20x_ios",pro20x:"pro_20x_ios",pro_20x_month:"pro_20x_ios",pro20x_month:"pro_20x_ios" }[verified.type];
  }
  return product ? { confirmed: true, unused: true, site, product } : null;
}

async function verifyProvider(key, site, transport = curlJson) {
  // Only read-only code checks; no session token, validate_token or recharge.
  const endpoint = site === "https://aiee.fun" ? "/api/auth.php" : "/api.php";
  const [query, verify] = await Promise.all([
    transport(site + endpoint, JSON.stringify({ action: "query_code", cdk: key, ...(site.includes("sxzfd") ? { polling: 1, silent_log: 1 } : {}) }), "application/json", 20000),
    transport(site + endpoint, JSON.stringify({ action: "verify_code", cdk: key }), "application/json", 20000),
  ]);
  return providerEvidence(site, query, verify);
}

function finance(order, payment, quote, policy, openingRub = 0, now = Date.now()) {
  const rate = Number(policy.rubPerCny), age = now - Date.parse(policy.costCheckedAt);
  const feeRaw = payment?.payload?.commission, gross = Number(order.totalAmount);
  if (!Number.isFinite(age) || age < -60000 || age > Number(policy.costMaxAgeMs) || !(rate > 0) || !/^\d+(?:\.\d+)?$/.test(String(feeRaw)) || !Number.isFinite(gross) || !(gross > 0) || !Number.isFinite(openingRub) || openingRub < 0) throw Error("supplier_cost_unconfirmed");
  const fee = Number(feeRaw), costRub = Math.ceil(quote.amountMinor * rate) / 100;
  if (fee < 0 || fee > gross || gross - fee - costRub - openingRub < Number(policy.minimumProfitRub || 0)) throw Error("supplier_margin_hold");
  const available = gross - fee - openingRub - Number(policy.minimumProfitRub || 0);
  return { costRub, commissionRub: fee, rateRubPerCny: rate, source: policy.costSource, totalBudgetMinor: Math.floor(available / rate * 100) };
}

function assertPaidWebsiteOrder(order, activation, productKey, expected, policy, now = Date.now()) {
  const productStart = policy.productEnabledAfter?.[productKey];
  const start = Math.max(Date.parse(policy.enabledAfter), productStart ? Date.parse(productStart) : 0), o = order, a = activation;
  if (!Number.isFinite(start) || start > now || !o || o.source !== "site" || o.status !== "PAID" || o.currency !== "RUB" || o.items?.length !== 1 || o.items[0].quantity !== 1 || o.items[0].product?.slug !== productKey || !(+new Date(o.createdAt) >= start)) throw Error("supplier_order_ineligible");
  const paid = (o.payments || []).filter(p => p.status === "SUCCESS");
  if (paid.length !== 1 || !["pally","lava","enot","gateway","enot.io"].includes(String(paid[0].provider || "").toLowerCase()) || o.paymentMethod === "stub" || paid[0].currency !== "RUB" || Number(paid[0].amount) !== Number(o.totalAmount) || !(+new Date(paid[0].processedAt || paid[0].createdAt) >= start)) throw Error("supplier_payment_unverified");
  if (!a || a.status === "success" || a.verificationState === "success" || a.cdk || a.taskId || Number(a.attempts || 0) > 0 || (o.licenseKeys || []).length || a.reservedCandidates?.length) throw Error("supplier_prior_fulfillment");
  if (!a.clientTokenCiphertext || !(Date.parse(a.clientTokenExpiresAt) > now)) throw Error("supplier_session_required");
  if (!expected || !policy.products?.includes(productKey)) throw Error("supplier_product_disabled");
  return paid[0];
}

function loadSettings() {
  const policy = protectedJson(path.join(SECRET_DIR, "policy.json"));
  if (policy.enabled !== true) return null;
  return { policy, credentials: protectedJson(path.join(SECRET_DIR, "aisou.json")), encryptionKey: Buffer.from(protectedJson(path.join(SECRET_DIR, "journal-key.json")).key, "base64") };
}

// Called only after account-type selection and an empty matching local pool.
// The caller holds the website's existing cross-process activation order lock.
async function procureWebsiteKey({ prisma, activationStore, orderId, productKey, accountPlan, activationSiteUrl, stockOnly = false, reserveProof = null, destination = "native", settings, transport = curlJson }) {
  if (!settings) {
    try { settings = loadSettings(); } catch (e) { if (e.code === "ENOENT") return null; throw e; }
  }
  if (!settings || settings.policy.enabled !== true) return null;
  const { policy } = settings;
  const expected = contract(productKey, accountPlan);
  if (expected.site !== activationSiteUrl) throw Error("supplier_route_mismatch");
  const scope = "website:" + orderId;
  const load = () => prisma.order.findUnique({ where: { id: orderId }, include: { payments: true, items: { include: { product: true } }, licenseKeys: true } });
  let order = await load(), activation = activationStore.findByOrderId(orderId);
  // Old orders do not acquire automatic purchasing rights on retry.
  const cutoff = Math.max(Date.parse(policy.enabledAfter), policy.productEnabledAfter?.[productKey] ? Date.parse(policy.productEnabledAfter[productKey]) : 0);
  if (order && +new Date(order.createdAt) < cutoff) return null;
  const bound = (order?.licenseKeys || []).filter(k => k.productKey === productKey && k.activationSiteUrl === activationSiteUrl && k.orderId === orderId && k.status === "used");
  if (!stockOnly && bound.length === 1 && (!activation?.externalFulfillmentOwner || reserveProof?.state === "fallback_sealed") && !activation?.taskId && !Number(activation?.attempts || 0) && activation?.status !== "success") {
    assertPaidWebsiteOrder({...order,licenseKeys:[]},{...activation,cdk:""},productKey,expected,policy);
    const audit = await prisma.licenseKeyAuditLog.findFirst({ where: { keyId: bound[0].id, action: "aisou_purchase" } });
    if (audit?.meta?.orderId === orderId) return { keyId: bound[0].id, code: bound[0].keyValue, activationSiteUrl, costRub: audit.meta.costRub };
  }
  let payment = assertPaidWebsiteOrder(order, activation, productKey, expected, policy);
  if (activation.externalFulfillmentOwner) {
    const proof = reserveProof;
    if (proof?.state !== "fallback_sealed" || proof.orderId !== orderId || proof.site !== expected.site || proof.product !== expected.product || !/^[a-f0-9]{16}$/.test(proof.sessionFingerprint || "") || proof.sessionFingerprint !== activation.tokenMeta?.fingerprint) throw Error("supplier_primary_seal_required");
  }
  const existing = await prisma.licenseKey.findFirst({ where: { productKey, activationSiteUrl, status: "available" }, select: { id: true } });
  if (existing && destination === "native") return { stockAvailable: true };
  const journal = new Journal(path.join(settings.stateDir || STATE_DIR, "journal.sqlite"), settings.encryptionKey);
  try {
    await journal.initialize();
    await journal.run("CREATE TABLE IF NOT EXISTS demands(scope TEXT PRIMARY KEY,product TEXT NOT NULL,created_at TEXT NOT NULL)");
    await journal.run("INSERT OR IGNORE INTO demands VALUES(?,?,?)",[scope,expected.product,new Date().toISOString()]);
    const api = merchant(settings.credentials, transport);
    const prior = await journal.get("SELECT * FROM purchases WHERE scope=?",[scope+":primary"]);
    let quote;
    if (prior && prior.state !== "wrong_product") {
      // Delivery/unknown-result recovery does not depend on remaining merchant
      // stock or balance. A purchase was already claimed and cannot be replayed.
      quote={amountMinor:prior.quoted_minor,itemId:expected.itemId,code:expected.code,race:expected.race,quantity:1,currency:"CNY",available:true};
    } else {
      const [catalog, stock, valuation, balance] = await Promise.all([
        api.read("items"),
        api.read("inventory", { sharedCode: expected.code, race: expected.race }),
        api.read("valuation", { code: expected.code, num: 1, card_id: 0, race: expected.race }),
        api.read("connect"),
      ]);
      quote = quoteFromValuation(expected, catalog, stock, valuation);
      if (!/^\d+(?:\.\d+)?$/.test(String(balance?.balance)) || Number(balance.balance)*100<quote.amountMinor) throw Error("supplier_balance_insufficient");
    }
    order = await load(); activation = activationStore.findByOrderId(orderId);
    payment = assertPaidWebsiteOrder(order, activation, productKey, expected, policy);
    const cost = finance(order, payment, quote, policy, reserveProof?.priorOpeningRub || 0);
    const result = await buyWithOneCorrection({ enabled: true, journal, scope, expected, quote, totalBudgetMinor: cost.totalBudgetMinor, buyer: fields => api.buy(fields), verifyKey: (key, site) => verifyProvider(key, site, transport) });
    if (result.state !== "verified") throw Error("supplier_" + result.state);
    const asset = await journal.get("SELECT * FROM assets WHERE scope=? AND state='verified'", [scope + (result.requestNo === "gpi-" + require("node:crypto").createHash("sha256").update(scope + ":primary").digest("hex").slice(0,40) ? ":primary" : ":correction-1")]);
    if (!asset) throw Error("supplier_asset_unconfirmed");
    const keyValue = journal.open(asset.encrypted_key).toUpperCase();
    const spent = await journal.get("SELECT SUM(charged_minor) total,COUNT(*) count,COUNT(charged_minor) known FROM purchases WHERE scope IN (?,?)", [scope + ":primary", scope + ":correction-1"]);
    if(spent.count!==spent.known || !(spent.total>0)) throw Error("supplier_cost_unconfirmed");
    const actualCostRub = Math.ceil(spent.total * cost.rateRubPerCny) / 100;
    if (destination === "pulse-site-codex") {
      if (!/^codex-(250|500|1000)$/.test(productKey) || !reserveProof || activation.externalFulfillmentOwner !== `pulse-site${productKey.slice(6)}-v1`) throw Error("supplier_destination_refused");
      const fresh = await load();
      assertPaidWebsiteOrder(fresh, activationStore.findByOrderId(orderId), productKey, expected, policy);
      return { code: keyValue, activationSiteUrl, costRub: actualCostRub, amountCny: spent.total / 100, tradeNo: result.tradeNo, requestNo: result.requestNo, fingerprint: asset.fingerprint };
    }
    if (destination !== "native") throw Error("supplier_destination_refused");
    const row = await prisma.$transaction(async tx => {
      const fresh = await tx.order.findUnique({ where: { id: orderId }, include: { payments: true, items: { include: { product: true } }, licenseKeys: true } });
      const found = await tx.licenseKey.findUnique({ where: { keyValue } });
      if (found) {
        if (found.productKey !== productKey || found.activationSiteUrl !== activationSiteUrl || (found.orderId && found.orderId !== orderId) || (stockOnly ? found.status !== "available" : found.orderId !== orderId)) throw Error("supplier_inventory_conflict");
        return found;
      }
      assertPaidWebsiteOrder(fresh, activationStore.findByOrderId(orderId), productKey, expected, policy);
      const row = await tx.licenseKey.create({ data: { keyValue, productKey, activationSiteUrl, status: stockOnly ? "available" : "used", ...(stockOnly ? {} : { orderId, email: fresh.email, usedAt: new Date() }) } });
      await tx.licenseKeyAuditLog.create({ data: { keyId: row.id, action: "aisou_purchase", meta: { orderId, supplier: "aisou", tradeNo: result.tradeNo, expectedProduct: expected.product, amountCny: spent.total / 100, costRub: actualCostRub, costSource: policy.costSource, requestNo: result.requestNo } } });
      return row;
    });
    await journal.run("CREATE TABLE IF NOT EXISTS releases(scope TEXT PRIMARY KEY,key_id TEXT NOT NULL,cost_rub REAL NOT NULL,released_at TEXT NOT NULL)");
    await journal.run("INSERT OR IGNORE INTO releases VALUES(?,?,?,?)", [scope, row.id, actualCostRub, new Date().toISOString()]);
    return { keyId: row.id, code: keyValue, activationSiteUrl, costRub: actualCostRub, stockAvailable: stockOnly };
  } finally { await journal.close(); }
}

module.exports = { merchant, curlJson, providerEvidence, verifyProvider, finance, assertPaidWebsiteOrder, procureWebsiteKey, loadSettings };

async function pendingNativeOrders(activeOrderIds, suppliedSettings) {
  let settings; try { settings = suppliedSettings || loadSettings(); } catch { return []; }
  const dir=settings?.stateDir||STATE_DIR;
  if (!settings || !fs.existsSync(path.join(dir,"journal.sqlite"))) return [];
  const j = new Journal(path.join(dir,"journal.sqlite"), settings.encryptionKey);
  try {
    await j.initialize();
    await j.run("CREATE TABLE IF NOT EXISTS demands(scope TEXT PRIMARY KEY,product TEXT NOT NULL,created_at TEXT NOT NULL)");
    const products=['plus_ios','plus_free','go_ios','go_free','codex-250','codex-500','codex-1000','pro_5x_ios','pro_5x_free','pro_20x_ios','pro_20x_free','pro_25x_free','grok_plus_monthly','grok_premium_monthly','grok_super_monthly','grok_ultra_monthly'];
    const rows = await new Promise((resolve,reject)=>j.db.all('SELECT scope FROM demands WHERE product IN ('+products.map(()=>'?').join(',')+') ORDER BY rowid DESC',products,(e,r)=>e?reject(e):resolve(r)));
    const active=new Set(activeOrderIds||[]);
    return rows.map(r=>r.scope.match(/^website:([a-z0-9]{20,40})$/)?.[1]).filter(id=>id&&active.has(id)).slice(0,20);
  } finally { await j.close(); }
}
module.exports.pendingNativeOrders = pendingNativeOrders;

async function notifyHoldOnce(orderId, reason, send) {
  if (!/^[a-z0-9]{20,40}$/.test(orderId) || !/^[a-z_]{1,90}$/.test(reason)) return;
  let settings; try { settings = loadSettings(); } catch { return; }
  if (!settings) return;
  const j = new Journal(path.join(STATE_DIR,"journal.sqlite"),settings.encryptionKey);
  try {
    await j.initialize();
    await j.run("CREATE TABLE IF NOT EXISTS notices(event TEXT PRIMARY KEY,state TEXT NOT NULL,message_id TEXT)");
    const id=orderId+":"+reason;
    const inserted=await j.run("INSERT OR IGNORE INTO notices VALUES(?,'sending',NULL)",[id]);
    if (!inserted.changes) return;
    try {
      const messageId=await send();
      await j.run("UPDATE notices SET state=?,message_id=? WHERE event=?",[messageId?"sent":"uncertain",messageId?String(messageId):null,id]);
    } catch { await j.run("UPDATE notices SET state='uncertain' WHERE event=?",[id]); }
  } finally { await j.close(); }
}
module.exports.notifyHoldOnce=notifyHoldOnce;
