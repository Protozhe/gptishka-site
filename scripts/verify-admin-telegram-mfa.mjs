import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import vm from "node:vm";
import crypto from "node:crypto";
import sqlite3 from "sqlite3";
import { z } from "zod";
import ts from "typescript";

class AppError extends Error { constructor(message, statusCode) { super(message); this.statusCode = statusCode; } }
const source = name => fs.readFileSync(`apps/admin-backend/src/modules/auth/${name}.ts`, "utf8");
function load(name, deps, globals = {}) {
  const context = vm.createContext({ exports: {}, Buffer, URLSearchParams, AbortSignal, process: { env: {}, platform: process.platform }, ...globals,
    require: n => { assert.ok(n in deps, n); return deps[n]; } });
  vm.runInContext(ts.transpileModule(source(name), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, context);
  return context.exports;
}
let targetType = "private", transportFails = false, sent = 0;
const mfa = load("telegram-mfa.service", {
  "node:fs": fs, "node:path": path, "node:crypto": crypto, sqlite3, zod: { z },
  "../../config/env": { env: { NODE_ENV: "test", JWT_REFRESH_SECRET: "fixture-secret-for-hashing" } },
  "../../common/errors/app-error": { AppError },
  undici: {
    ProxyAgent: class { async close() {} },
    fetch: async url => {
      if (transportFails) throw Error("transport offline");
      const endpoint = new URL(url).pathname.split("/").pop();
      if (endpoint === "sendMessage") sent++;
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
  const channel = { botToken: "fixture", proxyUrl: "http://127.0.0.1:18082" };
  targetType = "group";
  await assert.rejects(mfa.sendCode(channel, "1", "123456"));
  assert.equal(sent, 0, "Never deliver MFA to group chats");
  targetType = "private"; transportFails = true;
  await assert.rejects(mfa.sendCode(channel, "1", "123456"));
  assert.equal(sent, 0);
  transportFails = false;
  await mfa.sendCode(channel, "1", "123456");
  assert.equal(sent, 1);
} finally { fs.rmSync(temp, { recursive: true, force: true }); }

let consumed = false, issued = 0;
const fixtureUser = { id: "owner", email: "owner@example.invalid", isActive: true, role: { code: "OWNER" } };
const handlers = load("auth.controller", {
  "../../config/prisma": { prisma: { user: { findUnique: async () => fixtureUser }, refreshToken: { create: async () => { issued++; return { id: "session", expiresAt: new Date(Date.now() + 60000) }; } } } },
  "../../config/env": { env: { REFRESH_COOKIE_NAME: "refresh", JWT_REFRESH_TTL_DAYS: 30 } },
  "../../common/http/async-handler": { asyncHandler: fn => fn },
  "../../common/errors/app-error": { AppError }, "../../common/utils/hash": { sha256: x => "hash:" + x },
  "./auth.service": { validateUserCredentials: async () => fixtureUser },
  "./token.service": { verifyRefreshToken: () => ({ sub: "owner", mfa: false }), signAccessToken: (_u, _r, _s, mfa) => { assert.equal(mfa, true); return "access"; }, signRefreshToken: (_u, mfa) => { assert.equal(mfa, true); return "refresh"; }, signPanelToken: () => "panel" },
  "./telegram-mfa.service": { telegramMfaRequired: () => true, requestBinding: () => "binding",
    beginTelegramChallenge: async () => ({ requiresMfa: true, challengeId: "challenge", expiresIn: 300 }),
    consumeTelegramChallenge: async (_id, code) => { if (consumed || code !== "123456") throw new AppError("Invalid code", 401); consumed = true; return "owner"; },
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
console.log("Telegram MFA: password gate, private delivery, expiry, binding, five-attempt limit, replacement and concurrent replay checks passed.");
