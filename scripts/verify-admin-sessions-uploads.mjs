import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import crypto from "node:crypto";
import sharp from "sharp";
import path from "node:path";
import os from "node:os";

const source = name => fs.readFileSync(`apps/admin-backend/src/${name}`, "utf8");
function load(name, deps, extra = {}) {
  const context = vm.createContext({ exports: {}, require: n => { assert.ok(n in deps, n); return deps[n]; }, Buffer, ...extra });
  vm.runInContext(ts.transpileModule(source(name), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, context);
  return context.exports;
}
class AppError extends Error { constructor(message, statusCode) { super(message); this.statusCode = statusCode; } }
const fixture = { id: "session-a", userId: "user-a", tokenHash: "hash:old", revokedAt: null, user: { isActive: true, role: { code: "OWNER" } } };
let session = { ...fixture }, seq = 0, updates = [];
const handlers = load("modules/auth/auth.controller.ts", {
  "../../config/prisma": { prisma: { refreshToken: {
    findFirst: async () => session.revokedAt ? null : { ...session },
    updateMany: async ({ where, data }) => {
      updates.push(where);
      if (where.id !== session.id || where.tokenHash && where.tokenHash !== session.tokenHash || session.revokedAt) return { count: 0 };
      await Promise.resolve();
      if (where.tokenHash && where.tokenHash !== session.tokenHash) return { count: 0 };
      Object.assign(session, data); return { count: 1 };
    },
  } } },
  "../../config/env": { env: { REFRESH_COOKIE_NAME: "refresh", JWT_REFRESH_TTL_DAYS: 30 } },
  "../../common/http/async-handler": { asyncHandler: fn => fn },
  "./auth.service": {}, "./token.service": {
    verifyRefreshToken: () => ({ sub: "user-a" }),
    signRefreshToken: () => `next-${++seq}`,
    signAccessToken: (_id, _role, sid) => `access:${sid}`,
  },
  "../../common/utils/hash": { sha256: x => `hash:${x}` },
  "../../common/errors/app-error": { AppError }, bcrypt: {}, "@prisma/client": { RoleCode: {} },
});
const req = { cookies: { refresh: "old" }, headers: {} };
const response = () => ({ body: null, cookie() {}, json(body) { this.body = body; } });
const attempts = await Promise.allSettled([handlers.refresh(req, response()), handlers.refresh(req, response())]);
assert.equal(attempts.filter(a => a.status === "fulfilled").length, 1, "Refresh replay must have exactly one winner");
assert.ok(updates.every(w => w.revokedAt === null && w.expiresAt.gt));
session = { ...fixture, revokedAt: new Date() };
await assert.rejects(handlers.refresh(req, response()), error => error.statusCode === 401);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gptishka-upload-test-"));
try {
  const images = load("modules/files/files.service.ts", { fs, path, sharp, uuid: { v4: crypto.randomUUID } }, { process: { cwd: () => tmp } });
  const png = await sharp({ create: { width: 8, height: 8, channels: 4, background: "red" } }).png().toBuffer();
  assert.equal((await sharp(await images.verifiedRaster(png)).metadata()).format, "png");
  for (const buffer of [Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), Buffer.from('<html><script>alert(1)</script></html>')]) {
    await assert.rejects(images.saveProductImage({ originalname: "forged.png", mimetype: "image/png", buffer }));
  }
  await assert.rejects(images.saveProductImage({ originalname: "vector.svg", mimetype: "image/svg+xml", buffer: png }));
  const url = await images.saveProductImage({ originalname: "valid.png", mimetype: "image/png", buffer: Buffer.concat([png, Buffer.from('<script>alert(1)</script>')]) });
  const bytes = fs.readFileSync(path.join(tmp, "apps/admin-backend", url));
  assert.equal((await sharp(bytes).metadata()).format, "webp");
  assert.equal(bytes.includes(Buffer.from("<script>")), false);
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }

console.log("Device-session replay/revocation and decoded raster upload security verified.");
