import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import vm from "node:vm";
import crypto from "node:crypto";
import net from "node:net";
import sqlite3 from "sqlite3";
import { z } from "zod";
import ts from "typescript";

class AppError extends Error { constructor(message, statusCode) { super(message); this.statusCode = statusCode; } }
const source = name => fs.readFileSync(`apps/admin-backend/src/modules/auth/${name}.ts`, "utf8");
function load(name, deps, globals = {}) {
  const context = vm.createContext({ exports: {}, Buffer, URL, URLSearchParams, AbortSignal, process: { env: {}, platform: process.platform }, ...globals,
    require: n => { assert.ok(n in deps, n); return deps[n]; } });
  vm.runInContext(ts.transpileModule(source(name), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, context);
  return context.exports;
}
let targetType = "private", transportFails = false, sent = 0, lastMessage = null;
const mfa = load("telegram-mfa.service", {
  "node:fs": fs, "node:path": path, "node:crypto": crypto, "node:net": net, sqlite3, zod: { z },
  "../../config/env": { env: { NODE_ENV: "test", JWT_REFRESH_SECRET: "fixture-secret-for-hashing" } },
  "../../common/errors/app-error": { AppError },
  undici: {
    ProxyAgent: class { async close() {} },
    fetch: async url => {
      if (transportFails) throw Error("transport offline");
      const endpoint = new URL(url).pathname.split("/").pop();
      if (endpoint === "sendMessage") {
        sent++;
        lastMessage = Object.fromEntries(new URL(url).searchParams);
      }
      return { ok: true, json: async () => ({ ok: true, result: endpoint === "getMe" ? { username: "myadminiibot" } : endpoint === "getChat" ? { type: targetType } : { message_id: 1 } }) };
    },
  },
});
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "gptishka-mfa-"));
try {
  const file = path.join(temp, "challenges.sqlite"), store = new mfa.ChallengeStore(file), time = Date.now();
  assert.equal(mfa.telegramMfaRequired(), false);
  const binding = mfa.requestBinding("192.0.2.1", "browser-fixture");
  const id = await store.create("owner", binding, "012345", time);
  assert.equal(fs.readFileSync(file).includes(Buffer.from("012345")), false, "Do not persist clear-text OTPs");
  await assert.rejects(store.create("owner", binding, "123456", time + 1), e => e.statusCode === 429);
  assert.equal(await store.consume(id, "012345", "other-device", time), null);
  assert.equal(await store.consume(id, "111111", binding, time), null);
  const race = await Promise.allSettled(Array.from({ length: 6 }, () => store.consume(id, "012345", binding, time)));
  assert.ok(race.every(result => result.status === "fulfilled"), "Concurrent verifications must complete without database errors");
  assert.equal(race.filter(result => result.status === "fulfilled" && result.value).length, 1, "Only one concurrent verification may consume a code");
  assert.equal(await store.consume(id, "012345", binding, time), null);
  const expired = await store.create("expired", binding, "777777", time);
  assert.equal(await store.consume(expired, "777777", binding, time + 300_000), null);
  const attempts = await store.create("attempts", binding, "777777", time);
  for (let i = 0; i < 5; i++) assert.equal(await store.consume(attempts, "888888", binding, time), null);
  assert.equal(await store.consume(attempts, "777777", binding, time), null);
  const old = await store.create("replacement", binding, "111111", time);
  const replacement = await store.create("replacement", binding, "222222", time + 60_001);
  assert.equal(await store.consume(old, "111111", binding, time + 60_001), null);
  await store.invalidate(replacement);
  assert.equal(await store.consume(replacement, "222222", binding, time + 60_001), null);
  const version = mfa.credentialVersion("owner", "fixture-password-hash");
  assert.equal(await store.trustsIp("owner", "192.0.2.1", version), false);
  await store.rememberIp("owner", "::ffff:c000:201", version, time);
  assert.equal(await new mfa.ChallengeStore(file).trustsIp("owner", "192.0.2.1", version), true, "Trust survives a process restart");
  assert.equal(await store.trustsIp("another-admin", "192.0.2.1", version), false);
  assert.equal(await store.trustsIp("owner", "192.0.2.2", version), false);
  assert.equal(await store.trustsIp("owner", "192.0.2.1", mfa.credentialVersion("owner", "new-password-hash")), false);
  assert.equal(mfa.canonicalIp("2001:0DB8:0:0:0:0:0:1"), "2001:db8::1");
  await store.rememberIp("owner", "2001:0db8::1", version);
  assert.equal(await store.trustsIp("owner", "2001:db8:0:0::1", version), true);
  for (const invalid of ["", "192.0.2.1, 198.51.100.1", "unknown", "192.0.2.999", "http://192.0.2.1", "fe80::1%eth0"]) {
    assert.equal(mfa.canonicalIp(invalid), null);
    await store.rememberIp("owner", invalid, version);
    assert.equal(await store.trustsIp("owner", invalid, version), false);
  }
  assert.equal(fs.readFileSync(file).includes(Buffer.from("192.0.2.1")), false, "Do not persist raw trusted IP addresses");
  assert.equal(fs.readFileSync(file).includes(Buffer.from("fixture-password-hash")), false);
  const legacyFile = path.join(temp, "legacy.sqlite"), legacyHash = crypto.createHmac("sha256", "fixture-secret-for-hashing").update("legacy:555555").digest("hex");
  const legacyDb = new sqlite3.Database(legacyFile);
  await new Promise((resolve, reject) => legacyDb.exec(`CREATE TABLE challenges(id TEXT PRIMARY KEY,user_id TEXT,code_hash TEXT,binding TEXT,created INTEGER,expires INTEGER,attempts INTEGER DEFAULT 0,used INTEGER DEFAULT 0);
    INSERT INTO challenges VALUES('legacy','owner','${legacyHash}','${binding}',${time},${time + 300000},0,0);`, e => e ? reject(e) : resolve()));
  await new Promise((resolve, reject) => legacyDb.close(e => e ? reject(e) : resolve()));
  const upgraded = new mfa.ChallengeStore(legacyFile);
  const legacyProof = await upgraded.consumeVerified("legacy", "555555", binding, time);
  assert.equal(legacyProof.userId, "owner"); assert.equal(legacyProof.credentialVersion, "");
  assert.equal(await upgraded.trustsIp("owner", "192.0.2.1", version), false, "Never seed IP trust from historical database rows");
  const channel = { botToken: "fixture", proxyUrl: "http://127.0.0.1:18082" };
  targetType = "group";
  await assert.rejects(mfa.sendCode(channel, "1", "123456"));
  assert.equal(sent, 0, "Never deliver MFA to group chats");
  targetType = "private"; transportFails = true;
  await assert.rejects(mfa.sendCode(channel, "1", "123456"));
  assert.equal(sent, 0);
  transportFails = false;
  await mfa.sendCode(channel, "1", "012345");
  assert.equal(sent, 1);
  assert.equal(lastMessage.parse_mode, "HTML");
  assert.equal(lastMessage.protect_content, "false", "The owner must be able to copy the login code");
  assert.ok(lastMessage.text.includes("<code>012345</code>"), "A code with a leading zero remains selectable as code");
  assert.deepEqual(JSON.parse(lastMessage.reply_markup), {
    inline_keyboard: [[{ text: "📋 Скопировать код", copy_text: { text: "012345" } }]],
  }, "Copy only the six-digit code, without a callback, order data or the whole message");
  for (const invalid of ["12345", "1234567", "<b>x</b>", "１２３４５６"]) {
    await assert.rejects(mfa.sendCode(channel, "1", invalid), /invalid_mfa_code/);
  }
  assert.equal(sent, 1, "Invalid codes must not reach Telegram");
} finally { fs.rmSync(temp, { recursive: true, force: true }); }

let consumed = false, issued = 0, trusted = false, remembered = 0, challenges = 0, credentialChecks = 0, challengeVersion = "version:fixture-hash";
const fixtureUser = { id: "owner", email: "owner@example.invalid", passwordHash: "fixture-hash", isActive: true, role: { code: "OWNER" } };
const handlers = load("auth.controller", {
  "../../config/prisma": { prisma: { user: { findUnique: async () => fixtureUser }, refreshToken: { create: async () => { issued++; return { id: "session", expiresAt: new Date(Date.now() + 60000) }; } } } },
  "../../config/env": { env: { REFRESH_COOKIE_NAME: "refresh", JWT_REFRESH_TTL_DAYS: 30 } },
  "../../common/http/async-handler": { asyncHandler: fn => fn },
  "../../common/errors/app-error": { AppError }, "../../common/utils/hash": { sha256: x => "hash:" + x },
  "./auth.service": { validateUserCredentials: async (_email, password) => { credentialChecks++; if (password !== "fixture-password") throw new AppError("Invalid credentials", 401); return fixtureUser; } },
  "./token.service": { verifyRefreshToken: () => ({ sub: "owner", mfa: false }), signAccessToken: (_u, _r, _s, mfa) => { assert.equal(mfa, true); return "access"; }, signRefreshToken: (_u, mfa) => { assert.equal(mfa, true); return "refresh"; }, signPanelToken: () => "panel" },
  "./telegram-mfa.service": { telegramMfaRequired: () => true, requestBinding: () => "binding",
    credentialVersion: (_id, hash) => "version:" + hash,
    hasTrustedIp: async (_id, ip, version) => trusted && ip === "192.0.2.1" && version === "version:fixture-hash",
    rememberVerifiedIp: async (_id, ip) => { assert.equal(ip, "192.0.2.1"); remembered++; trusted = true; },
    beginTelegramChallenge: async () => { challenges++; return { requiresMfa: true, challengeId: "challenge", expiresIn: 300 }; },
    consumeTelegramChallenge: async (_id, code) => { if (consumed || code !== "123456") throw new AppError("Invalid code", 401); consumed = true; return { userId: "owner", credentialVersion: challengeVersion }; },
  }, bcrypt: {}, "@prisma/client": { RoleCode: {} },
});
const response = () => ({ body: null, cookies: [], setHeader() {}, cookie(...args) { this.cookies.push(args); }, json(body) { this.body = body; } });
const req = { body: { email: "owner@example.invalid", password: "fixture-password" }, headers: {}, ip: "192.0.2.1" };
const first = response();
await handlers.login(req, first);
assert.equal(first.body.requiresMfa, true); assert.equal(first.body.accessToken, undefined);
assert.equal(first.cookies.length, 0); assert.equal(issued, 0, "A password cannot issue a session before Telegram verification");
await assert.rejects(handlers.refresh({ cookies: { refresh: "old-password-only-session" } }, response()), e => e.statusCode === 401);
await assert.rejects(handlers.verifyTelegram({ ...req, body: { challengeId: "challenge", code: "000000" } }, response()));
assert.equal(issued, 0);
const second = response();
await handlers.verifyTelegram({ ...req, body: { challengeId: "challenge", code: "123456" } }, second);
assert.equal(issued, 1); assert.equal(second.body.accessToken, "access");
assert.ok(second.cookies.some(([name, , options]) => name === "__Host-gptishka_panel" && options.httpOnly && options.secure && options.sameSite === "strict" && options.path === "/"));
await assert.rejects(handlers.verifyTelegram({ ...req, body: { challengeId: "challenge", code: "123456" } }, response()));
assert.equal(issued, 1);
assert.equal(remembered, 1, "Only verified Telegram codes may enroll an IP");
const known = response();
await handlers.login({ ...req, headers: { "user-agent": "another-browser-on-the-same-ip" } }, known);
assert.equal(known.body.accessToken, "access"); assert.equal(issued, 2); assert.equal(challenges, 1);
assert.ok(known.cookies.some(([name]) => name === "__Host-gptishka_panel"));
const newIp = response();
await handlers.login({ ...req, ip: "198.51.100.2", body: { ...req.body, ip: req.ip }, headers: { "x-forwarded-for": req.ip, "x-real-ip": req.ip } }, newIp);
assert.equal(newIp.body.requiresMfa, true); assert.equal(issued, 2); assert.equal(challenges, 2);
await assert.rejects(handlers.login({ ...req, body: { ...req.body, password: "wrong" } }, response()), e => e.statusCode === 401);
assert.equal(issued, 2); assert.equal(credentialChecks, 4, "Every login must validate the password before IP trust");
fixtureUser.passwordHash = "changed-fixture-hash";
const changed = response(); await handlers.login(req, changed);
assert.equal(changed.body.requiresMfa, true); assert.equal(issued, 2);
consumed = false;
await assert.rejects(handlers.verifyTelegram({ ...req, body: { challengeId: "challenge", code: "123456" } }, response()), e => e.statusCode === 401);
assert.equal(issued, 2); assert.equal(remembered, 1, "A code issued before a password change must not enroll an IP");
challengeVersion = ""; consumed = false;
await handlers.verifyTelegram({ ...req, body: { challengeId: "legacy-challenge", code: "123456" } }, response());
assert.equal(issued, 3); assert.equal(remembered, 1, "Legacy pending codes may log in once, but cannot enroll an IP");
console.log("Telegram MFA: new-IP challenge, persistent per-user IP trust, required password, credential-change reset, copy button, private delivery, expiry and concurrent replay checks passed.");
