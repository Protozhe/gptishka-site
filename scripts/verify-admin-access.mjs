import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import jwt from "jsonwebtoken";
import crypto from "node:crypto";

class AppError extends Error { constructor(message, statusCode) { super(message); this.statusCode = statusCode; } }
function load(file, dependencies) {
  const context = vm.createContext({ exports: {}, require: name => {
    assert.ok(name in dependencies, `Unexpected dependency ${name}`);
    return dependencies[name];
  }, URL });
  vm.runInContext(ts.transpileModule(fs.readFileSync(`apps/admin-backend/src/${file}`, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, context);
  return context.exports;
}
// Shared signing secrets are supported by legacy configuration. Token types must
// remain distinct even in that configuration, and alternative algorithms fail.
const secret = "admin-access-test-only-shared-secret";
const roles = { OWNER: "OWNER", ADMIN: "ADMIN", MANAGER: "MANAGER", SUPPORT: "SUPPORT" };
const tokens = load("modules/auth/token.service.ts", {
  jsonwebtoken: jwt, "../../config/env": { env: {
    JWT_ACCESS_SECRET: secret, JWT_REFRESH_SECRET: secret, JWT_ACCESS_TTL: "15m", JWT_REFRESH_TTL_DAYS: 30,
  } }, "@prisma/client": { RoleCode: roles }, "node:crypto": crypto,
});
const access = tokens.signAccessToken("user-1", roles.OWNER, "session-1");
const refresh = tokens.signRefreshToken("user-1");
assert.equal(tokens.verifyAccessToken(access).sub, "user-1");
assert.equal(tokens.verifyRefreshToken(refresh).sub, "user-1");
assert.notEqual(tokens.signRefreshToken("user-1"), refresh, "Same-second refresh tokens must be distinct");
assert.throws(() => tokens.verifyAccessToken(tokens.signAccessToken("user-1", roles.OWNER, "")));
assert.throws(() => tokens.verifyAccessToken(refresh));
assert.throws(() => tokens.verifyRefreshToken(access));
for (const payload of [{ sub: "", role: "OWNER", type: "access" }, { sub: "user-1", role: "invented", type: "access" }, { sub: "user-1", role: "OWNER" }]) {
  assert.throws(() => tokens.verifyAccessToken(jwt.sign(payload, secret)));
}
assert.throws(() => tokens.verifyAccessToken(jwt.sign({ sub: "user-1", role: "OWNER", type: "access" }, secret, { algorithm: "HS384" })));
assert.throws(() => tokens.verifyAccessToken(jwt.sign({ sub: "user-1", role: "OWNER", type: "access" }, secret, { expiresIn: -1 })));
assert.throws(() => tokens.verifyAccessToken(access.slice(0, -8) + "tampered"));
const panel = tokens.signPanelToken("user-1", "session-1", new Date(Date.now() + 60_000));
assert.equal(tokens.verifyPanelToken(panel).sid, "session-1");
assert.throws(() => tokens.verifyPanelToken(access));
assert.throws(() => tokens.verifyPanelToken(refresh));
assert.throws(() => tokens.verifyAccessToken(panel));
assert.throws(() => tokens.verifyRefreshToken(panel));

let user = { id: "user-1", isActive: true, role: { code: "OWNER" } };
let dbError = null, queries = 0, sessionRevoked = false, mfaRequired = false;
const { requireAuth, allowRoles } = load("modules/auth/auth.middleware.ts", {
  "../../common/errors/app-error": { AppError }, "./token.service": tokens,
  "./telegram-mfa.service": { telegramMfaRequired: () => mfaRequired },
  "../../config/prisma": { prisma: { refreshToken: { findFirst: async args => {
    queries++; assert.equal(args.where.id, "session-1"); assert.equal(args.where.userId, "user-1");
    assert.equal(args.where.revokedAt, null); assert.ok(args.where.expiresAt.gt);
    if (dbError) throw dbError;
    return sessionRevoked ? null : { user };
  } } } },
});
async function authenticate(token) {
  const req = { headers: token ? { authorization: `Bearer ${token}` } : {} };
  const calls = [];
  await requireAuth(req, {}, error => calls.push(error));
  assert.equal(calls.length, 1);
  return { req, error: calls[0] };
}
assert.equal((await authenticate(access)).req.auth.role, "OWNER");
mfaRequired = true;
assert.equal((await authenticate(access)).error.statusCode, 401, "Old password-only access cannot bypass MFA");
assert.equal((await authenticate(tokens.signAccessToken("user-1", roles.OWNER, "session-1", true))).req.auth.role, "OWNER");
mfaRequired = false;
sessionRevoked = true;
assert.equal((await authenticate(access)).error.statusCode, 401, "Revocation invalidates an already-issued access token");
sessionRevoked = false;
// The same already-issued OWNER token must use the current database role.
user = { ...user, role: { code: "SUPPORT" } };
let result = await authenticate(access);
assert.equal(result.error, undefined); assert.equal(result.req.auth.role, "SUPPORT");
let roleError;
allowRoles(["OWNER", "ADMIN"])(result.req, {}, error => { roleError = error; });
assert.equal(roleError.statusCode, 403);
user = { ...user, isActive: false };
assert.equal((await authenticate(access)).error.statusCode, 401);
user = null;
assert.equal((await authenticate(access)).error.statusCode, 401);
dbError = new Error("fixture database unavailable");
result = await authenticate(access);
assert.equal(result.error, dbError); assert.equal(result.req.auth, undefined);
const previousQueries = queries;
assert.equal((await authenticate()).error.statusCode, 401);
assert.equal((await authenticate("bad-token")).error.statusCode, 401);
assert.equal(queries, previousQueries);

const { verifyAdminOrigin } = load("common/security/csrf-origin.ts", {
  "../errors/app-error": { AppError }, "./origins": { getAllowedOrigins: () => new Set(["https://gptishka.shop"]) },
});
function checkOrigin(headers, method = "POST") {
  let result;
  verifyAdminOrigin({ path: "/api/admin/orders/test/status", method, protocol: "https", headers: { host: "gptishka.shop", ...headers } }, {}, error => { result = error; });
  return result?.statusCode || 204;
}
assert.equal(checkOrigin({ origin: "https://gptishka.shop" }), 204);
assert.equal(checkOrigin({ referer: "https://gptishka.shop/admin/" }), 204);
assert.equal(checkOrigin({}), 204); // Existing non-browser administrative clients.
for (const origin of ["https://foreign.invalid", "null", "", "malformed"]) {
  assert.equal(checkOrigin({ origin, referer: "https://gptishka.shop/admin/" }), 403);
}
assert.equal(checkOrigin({ referer: "malformed" }), 403);
assert.equal(checkOrigin({ referer: "https://foreign.invalid" }), 403);
assert.equal(checkOrigin({ origin: "https://foreign.invalid" }, "GET"), 204);
console.log("Admin access: current user status/role, JWT separation, and CSRF origin precedence verified.");
