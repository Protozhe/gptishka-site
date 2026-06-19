# Security Hardening Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first production-ready security hardening baseline for GPTishka without relying on Cloudflare.

**Architecture:** Add security regression checks first, then harden admin sessions, bootstrap registration, uploads, CSP, webhook idempotency, and production documentation in small reversible slices. Keep code changes aligned with the current nginx + PM2 + Express + React topology and avoid unrelated refactors in the dirty working tree.

**Tech Stack:** Node.js 20+, Express 4, Helmet 8, express-rate-limit, Prisma 6, PostgreSQL, React 18, Vite 6, TypeScript 5, `node:test`, PowerShell/Bash deployment docs.

---

## Scope Check

The full design spans several subsystems. This plan implements Phase 1, which is the origin-first hardening baseline:

- security scan and test commands
- admin token storage hardening
- bootstrap registration gate
- refresh session revocation
- SVG upload denial
- CSP report-only middleware with admin/storefront policies
- webhook idempotency
- production hardening checklist

The following are not part of Phase 1 execution:

- 2FA enrollment, recovery codes, and reset flows
- live VPS firewall edits
- live nginx config changes over SSH
- complete removal of storefront activation/order browser storage

Those items stay documented as separate follow-up work after this baseline is verified.

## File Structure

Create:

- `scripts/security-scan.mjs` - static security regression scan for route guards, admin token storage, CSP, uploads, and admin dangerous HTML.
- `server/security-headers.js` - CommonJS helpers that build per-path CSP policies and apply the correct CSP header.
- `server/security-headers.test.js` - `node:test` coverage for CSP serialization and admin/storefront policy selection.
- `apps/admin-backend/src/modules/auth/auth.security.ts` - pure auth security helpers for bootstrap flag parsing and session audit metadata.
- `apps/admin-backend/src/modules/auth/auth.security.test.ts` - pure tests for bootstrap flag handling.
- `apps/admin-backend/src/modules/auth/session.service.ts` - refresh-token revocation functions used by logout, logout-all, and admin session resets.
- `apps/admin-backend/src/modules/files/files.middleware.test.ts` - upload allow/deny tests.
- `apps/admin-backend/src/modules/payments/webhook-idempotency.service.ts` - deterministic webhook event identity and once-only processing helper.
- `apps/admin-backend/src/modules/payments/webhook-idempotency.service.test.ts` - pure identity tests for webhook idempotency.
- `apps/admin-backend/prisma/migrations/20260619160000_payment_webhook_events/migration.sql` - database table for processed webhook events.
- `docs/security/production-hardening.md` - nginx + PM2 production hardening checklist.

Modify:

- `package.json` - add root scripts for security scan and security tests.
- `apps/admin-backend/package.json` - add backend test scripts.
- `apps/admin-backend/.env.example` and `.env.example` - document security env flags.
- `apps/admin-backend/src/config/env.ts` - add typed security env flags.
- `apps/admin-backend/src/modules/auth/auth.routes.ts` - add logout-all route and keep bootstrap route behind controller gate.
- `apps/admin-backend/src/modules/auth/auth.controller.ts` - remove bootstrap-by-default, use session service, add logout-all, write auth audit logs.
- `apps/admin-backend/src/modules/users/users.routes.ts` - add admin session revocation route.
- `apps/admin-backend/src/modules/users/users.controller.ts` - add revoke-user-sessions controller.
- `apps/admin-backend/src/modules/users/users.service.ts` - add revoke sessions operation.
- `apps/admin-backend/src/modules/files/files.middleware.ts` - remove SVG from uploads and export a pure allowlist helper.
- `apps/admin-backend/src/modules/payments/payment-webhook.controller.ts` - wrap processing in idempotency helper.
- `apps/admin-backend/prisma/schema.prisma` - add `PaymentWebhookEvent`.
- `apps/admin-ui/src/lib/api.ts` - keep admin access token in memory only.
- `apps/admin-ui/src/hooks/useAuth.tsx` - restore session through `/auth/refresh` on app load.
- `server.js` - replace disabled CSP with `server/security-headers.js`.

## Task 1: Add Security Scan and Test Commands

**Files:**
- Modify: `package.json`
- Modify: `apps/admin-backend/package.json`
- Create: `scripts/security-scan.mjs`

- [ ] **Step 1: Write the failing root security scan script**

Create `scripts/security-scan.mjs` with this content:

```js
#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(relPath) {
  return fs.readFileSync(path.join(root, relPath), "utf8");
}

function walk(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, acc);
    } else {
      acc.push(full);
    }
  }
  return acc;
}

function fail(message) {
  failures.push(message);
}

const failures = [];

const adminApi = read("apps/admin-ui/src/lib/api.ts");
if (/admin_access_token/.test(adminApi) || /localStorage\.(getItem|setItem|removeItem)\(["']admin_access_token/.test(adminApi)) {
  fail("Admin access token must not be stored in localStorage.");
}

const adminUiFiles = walk(path.join(root, "apps", "admin-ui", "src")).filter((file) => /\.(ts|tsx)$/.test(file));
for (const file of adminUiFiles) {
  const source = fs.readFileSync(file, "utf8");
  if (source.includes("dangerouslySetInnerHTML")) {
    fail(`Admin UI must not use dangerouslySetInnerHTML: ${path.relative(root, file)}`);
  }
}

const uploadMiddleware = read("apps/admin-backend/src/modules/files/files.middleware.ts");
if (uploadMiddleware.includes("image/svg+xml") || /svg\)?\$/i.test(uploadMiddleware)) {
  fail("Admin uploads must not allow SVG files.");
}

const serverSource = read("server.js");
if (/contentSecurityPolicy:\s*false/.test(serverSource)) {
  fail("server.js must not disable contentSecurityPolicy.");
}
if (!serverSource.includes("applyContentSecurityPolicy")) {
  fail("server.js must apply the project CSP middleware.");
}

const adminRouteFiles = [
  "apps/admin-backend/src/modules/products/products.routes.ts",
  "apps/admin-backend/src/modules/orders/orders.routes.ts",
  "apps/admin-backend/src/modules/analytics/analytics.routes.ts",
  "apps/admin-backend/src/modules/audit/audit.routes.ts",
  "apps/admin-backend/src/modules/users/users.routes.ts",
  "apps/admin-backend/src/modules/promocodes/promocodes.routes.ts",
  "apps/admin-backend/src/modules/partners/partners.routes.ts",
  "apps/admin-backend/src/modules/cdks/cdks.routes.ts",
  "apps/admin-backend/src/modules/vpn/vpn.routes.ts",
  "apps/admin-backend/src/modules/account/account.admin.routes.ts",
  "apps/admin-backend/src/modules/system/system.routes.ts",
  "apps/admin-backend/src/modules/telegram-bots/telegram-bots.admin.routes.ts",
  "apps/admin-backend/src/modules/showcase/showcase.routes.ts",
  "apps/admin-backend/src/modules/service-pages/service-pages.routes.ts",
];

for (const relPath of adminRouteFiles) {
  const source = read(relPath);
  if (!source.includes("requireAuth")) {
    fail(`Admin route file is missing requireAuth import/use: ${relPath}`);
  }
  if (!/\.use\(\s*requireAuth/.test(source)) {
    fail(`Admin route file should apply router-level requireAuth: ${relPath}`);
  }
}

const authRoutes = read("apps/admin-backend/src/modules/auth/auth.routes.ts");
if (!authRoutes.includes('"/logout-all"')) {
  fail("Auth routes must expose /logout-all behind requireAuth.");
}

if (failures.length) {
  console.error("Security scan failed:");
  for (const item of failures) console.error(`- ${item}`);
  process.exit(1);
}

console.log("Security scan passed.");
```

- [ ] **Step 2: Run the scan and verify it fails on current risks**

Run:

```bash
node scripts/security-scan.mjs
```

Expected: failure mentioning localStorage admin token storage, SVG uploads, disabled CSP, missing CSP middleware, and missing `/logout-all`.

- [ ] **Step 3: Add package scripts**

In root `package.json`, add these scripts without removing existing scripts:

```json
"test:admin:api": "npm run test --workspace @gptishka/admin-backend",
"test:security": "node --test server/security-headers.test.js && npm run test:security --workspace @gptishka/admin-backend && npm run security:scan",
"security:scan": "node scripts/security-scan.mjs"
```

In `apps/admin-backend/package.json`, add these scripts without removing existing scripts:

```json
"test": "node --import tsx --test \"src/**/*.test.ts\"",
"test:security": "node --import tsx --test \"src/modules/auth/auth.security.test.ts\" \"src/modules/files/files.middleware.test.ts\" \"src/modules/payments/webhook-idempotency.service.test.ts\""
```

- [ ] **Step 4: Run the new root security script and keep the expected failures**

Run:

```bash
npm run security:scan
```

Expected: same security scan failures as Step 2. This confirms the scan is wired through npm.

- [ ] **Step 5: Commit the scan baseline**

```bash
git add package.json apps/admin-backend/package.json scripts/security-scan.mjs
git commit -m "test: add security regression scan"
```

## Task 2: Harden Admin Token Storage and Session Restoration

**Files:**
- Modify: `apps/admin-ui/src/lib/api.ts`
- Modify: `apps/admin-ui/src/hooks/useAuth.tsx`

- [ ] **Step 1: Run the security scan and verify the admin token failure**

Run:

```bash
npm run security:scan
```

Expected: failure includes `Admin access token must not be stored in localStorage.`

- [ ] **Step 2: Replace durable admin token storage with memory storage**

In `apps/admin-ui/src/lib/api.ts`, replace the current `safeGet`, `safeSet`, and `accessToken` block with:

```ts
let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}
```

Keep the existing Axios instance and interceptors. In the response interceptor, keep the refresh retry behavior and continue calling `setAccessToken(refreshRes.data.accessToken)`.

- [ ] **Step 3: Restore admin sessions through refresh cookie on app load**

In `apps/admin-ui/src/hooks/useAuth.tsx`, add this helper inside `AuthProvider`, before `refreshMe`:

```tsx
const restoreSession = useCallback(async () => {
  try {
    const refreshRes = await api.post("/auth/refresh");
    setAccessToken(refreshRes.data.accessToken);
    const { data } = await api.get("/auth/me");
    setUser(data);
  } catch {
    setAccessToken(null);
    setUser(null);
  } finally {
    setLoading(false);
  }
}, []);
```

Replace the initial effect:

```tsx
useEffect(() => {
  refreshMe();
}, [refreshMe]);
```

with:

```tsx
useEffect(() => {
  restoreSession();
}, [restoreSession]);
```

Keep `refreshMe` for explicit user reloads inside the UI.

- [ ] **Step 4: Run UI build and security scan**

Run:

```bash
npm run build --workspace @gptishka/admin-ui
npm run security:scan
```

Expected:

- Admin UI build passes.
- Security scan no longer reports admin access token storage.
- Other expected failures remain until their tasks are completed.

- [ ] **Step 5: Commit admin token hardening**

```bash
git add apps/admin-ui/src/lib/api.ts apps/admin-ui/src/hooks/useAuth.tsx
git commit -m "fix: keep admin access token in memory"
```

## Task 3: Gate Bootstrap Registration and Add Session Revocation

**Files:**
- Modify: `apps/admin-backend/src/config/env.ts`
- Modify: `.env.example`
- Modify: `apps/admin-backend/.env.example`
- Create: `apps/admin-backend/src/modules/auth/auth.security.ts`
- Create: `apps/admin-backend/src/modules/auth/auth.security.test.ts`
- Create: `apps/admin-backend/src/modules/auth/session.service.ts`
- Modify: `apps/admin-backend/src/modules/auth/auth.routes.ts`
- Modify: `apps/admin-backend/src/modules/auth/auth.controller.ts`
- Modify: `apps/admin-backend/src/modules/users/users.routes.ts`
- Modify: `apps/admin-backend/src/modules/users/users.controller.ts`
- Modify: `apps/admin-backend/src/modules/users/users.service.ts`

- [ ] **Step 1: Write pure tests for bootstrap flag behavior**

Create `apps/admin-backend/src/modules/auth/auth.security.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { isExplicitlyEnabled } from "./auth.security";

test("isExplicitlyEnabled accepts only true-like explicit values", () => {
  assert.equal(isExplicitlyEnabled(true), true);
  assert.equal(isExplicitlyEnabled("true"), true);
  assert.equal(isExplicitlyEnabled(" TRUE "), true);
  assert.equal(isExplicitlyEnabled("1"), true);
  assert.equal(isExplicitlyEnabled("yes"), true);
});

test("isExplicitlyEnabled rejects empty and false-like values", () => {
  assert.equal(isExplicitlyEnabled(false), false);
  assert.equal(isExplicitlyEnabled("false"), false);
  assert.equal(isExplicitlyEnabled("0"), false);
  assert.equal(isExplicitlyEnabled(""), false);
  assert.equal(isExplicitlyEnabled(undefined), false);
});
```

- [ ] **Step 2: Run the auth security test and verify it fails**

Run from the repository root:

```bash
cd apps/admin-backend
node --import tsx --test src/modules/auth/auth.security.test.ts
cd ../..
```

Expected: failure because `auth.security.ts` does not exist.

- [ ] **Step 3: Add auth security helper**

Create `apps/admin-backend/src/modules/auth/auth.security.ts`:

```ts
import { AppError } from "../../common/errors/app-error";

export function isExplicitlyEnabled(value: unknown) {
  if (value === true) return true;
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
}

export function assertBootstrapRegistrationEnabled(value: unknown) {
  if (!isExplicitlyEnabled(value)) {
    throw new AppError("Bootstrap registration is disabled", 403);
  }
}

export function authAuditMeta(req: { requestMeta?: { ip?: string; userAgent?: string } }) {
  return {
    ip: req.requestMeta?.ip,
    userAgent: req.requestMeta?.userAgent,
  };
}
```

- [ ] **Step 4: Add env flag**

In `apps/admin-backend/src/config/env.ts`, add this field near the other auth/session settings:

```ts
ADMIN_BOOTSTRAP_REGISTRATION_ENABLED: z
  .union([z.boolean(), z.string()])
  .transform((value) => (typeof value === "boolean" ? value : ["true", "1", "yes"].includes(String(value).trim().toLowerCase())))
  .default(false),
```

In `.env.example` and `apps/admin-backend/.env.example`, add:

```env
ADMIN_BOOTSTRAP_REGISTRATION_ENABLED=false
```

- [ ] **Step 5: Add session revocation service**

Create `apps/admin-backend/src/modules/auth/session.service.ts`:

```ts
import { prisma } from "../../config/prisma";
import { sha256 } from "../../common/utils/hash";

export async function revokeRefreshToken(rawToken: string) {
  const token = String(rawToken || "").trim();
  if (!token) return 0;
  const result = await prisma.refreshToken.updateMany({
    where: { tokenHash: sha256(token), revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return result.count;
}

export async function revokeAllUserRefreshTokens(userId: string) {
  const uid = String(userId || "").trim();
  if (!uid) return 0;
  const result = await prisma.refreshToken.updateMany({
    where: { userId: uid, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return result.count;
}
```

- [ ] **Step 6: Gate bootstrap registration and add logout-all**

In `apps/admin-backend/src/modules/auth/auth.controller.ts`:

1. Import helpers:

```ts
import { assertBootstrapRegistrationEnabled, authAuditMeta } from "./auth.security";
import { revokeAllUserRefreshTokens, revokeRefreshToken } from "./session.service";
import { writeAuditLog } from "../audit/audit.service";
```

2. At the start of `registerAdmin`, before counting existing root users, add:

```ts
assertBootstrapRegistrationEnabled(env.ADMIN_BOOTSTRAP_REGISTRATION_ENABLED);
```

3. In `logout`, replace the inline `prisma.refreshToken.updateMany` block with:

```ts
await revokeRefreshToken(token);
if (req.auth?.userId) {
  await writeAuditLog({
    userId: req.auth.userId,
    entityType: "auth_session",
    entityId: req.auth.userId,
    action: "logout",
    ...authAuditMeta(req),
  });
}
```

4. Add this controller:

```ts
export const logoutAll = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw new AppError("Unauthorized", 401);
  await revokeAllUserRefreshTokens(req.auth.userId);
  await writeAuditLog({
    userId: req.auth.userId,
    entityType: "auth_session",
    entityId: req.auth.userId,
    action: "logout_all",
    ...authAuditMeta(req),
  });
  res.clearCookie(env.REFRESH_COOKIE_NAME, refreshCookieOptions());
  res.status(204).send();
});
```

In `apps/admin-backend/src/modules/auth/auth.routes.ts`, import `logoutAll` and add:

```ts
authRouter.post("/logout-all", requireAuth, authSessionRateLimit, logoutAll);
```

- [ ] **Step 7: Add admin user session revocation**

In `apps/admin-backend/src/modules/users/users.service.ts`, import `revokeAllUserRefreshTokens` and add this method inside `usersService`:

```ts
async revokeSessions(userId: string, actorUserId?: string) {
  if (userId === actorUserId) throw new AppError("Use logout-all for your own sessions", 400);
  const user = await prisma.user.findUnique({ where: { id: userId }, select: safeUserSelect });
  if (!user) throw new AppError("User not found", 404);
  const revoked = await revokeAllUserRefreshTokens(userId);
  return { user, revoked };
},
```

In `apps/admin-backend/src/modules/users/users.controller.ts`, add:

```ts
export const revokeUserSessions = asyncHandler(async (req: Request, res: Response) => {
  const result = await usersService.revokeSessions(String(req.params.id), req.auth?.userId);
  res.json(result);
});
```

In `apps/admin-backend/src/modules/users/users.routes.ts`, import `revokeUserSessions` and add before `usersRouter.delete("/:id", deleteUser);`:

```ts
usersRouter.post("/:id/revoke-sessions", revokeUserSessions);
```

- [ ] **Step 8: Run tests, build, and scan**

Run from the repository root:

```bash
cd apps/admin-backend
node --import tsx --test src/modules/auth/auth.security.test.ts
cd ../..
npm run build:admin:api
npm run security:scan
```

Expected:

- Auth security tests pass.
- Admin API build passes.
- Security scan no longer reports missing `/logout-all`.

- [ ] **Step 9: Commit auth/session hardening**

```bash
git add .env.example apps/admin-backend/.env.example apps/admin-backend/src/config/env.ts apps/admin-backend/src/modules/auth apps/admin-backend/src/modules/users
git commit -m "fix: harden admin bootstrap and sessions"
```

## Task 4: Deny SVG Uploads and Add Upload Tests

**Files:**
- Modify: `apps/admin-backend/src/modules/files/files.middleware.ts`
- Modify: `apps/admin-backend/src/modules/files/files.service.ts`
- Create: `apps/admin-backend/src/modules/files/files.middleware.test.ts`

- [ ] **Step 1: Write upload allowlist tests**

Create `apps/admin-backend/src/modules/files/files.middleware.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { isAllowedUploadedImage } from "./files.middleware";

test("isAllowedUploadedImage accepts raster image types", () => {
  assert.equal(isAllowedUploadedImage({ mimetype: "image/jpeg", originalname: "photo.jpg" }), true);
  assert.equal(isAllowedUploadedImage({ mimetype: "image/png", originalname: "icon.png" }), true);
  assert.equal(isAllowedUploadedImage({ mimetype: "image/webp", originalname: "card.webp" }), true);
});

test("isAllowedUploadedImage rejects svg and extension mismatches", () => {
  assert.equal(isAllowedUploadedImage({ mimetype: "image/svg+xml", originalname: "vector.svg" }), false);
  assert.equal(isAllowedUploadedImage({ mimetype: "image/png", originalname: "script.svg" }), false);
  assert.equal(isAllowedUploadedImage({ mimetype: "image/jpeg", originalname: "photo.php" }), false);
});
```

- [ ] **Step 2: Run the upload test and verify it fails**

Run from the repository root:

```bash
cd apps/admin-backend
node --import tsx --test src/modules/auth/auth.security.test.ts src/modules/files/files.middleware.test.ts
cd ../..
```

Expected: failure because `isAllowedUploadedImage` is not exported.

- [ ] **Step 3: Export a pure upload allowlist helper and remove SVG**

In `apps/admin-backend/src/modules/files/files.middleware.ts`, replace the current allowlists with:

```ts
const ALLOWED_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ALLOWED_IMAGE_EXTENSIONS = /\.(jpe?g|png|webp)$/i;

export function isAllowedUploadedImage(file: Pick<Express.Multer.File, "mimetype" | "originalname">) {
  const mime = String(file.mimetype || "").toLowerCase();
  const originalName = String(file.originalname || "");
  return ALLOWED_IMAGE_MIME_TYPES.has(mime) && ALLOWED_IMAGE_EXTENSIONS.test(originalName);
}
```

Then update `fileFilter` to:

```ts
fileFilter: (_req, file, callback) => {
  callback(null, isAllowedUploadedImage(file));
},
```

In `apps/admin-backend/src/modules/files/files.service.ts`, replace:

```ts
const allowedImageExtensions = new Set([".jpg", ".jpeg", ".png", ".webp", ".svg"]);
```

with:

```ts
const allowedImageExtensions = new Set([".jpg", ".jpeg", ".png", ".webp"]);
```

- [ ] **Step 4: Run upload tests, backend build, and scan**

Run from the repository root:

```bash
cd apps/admin-backend
node --import tsx --test src/modules/auth/auth.security.test.ts src/modules/files/files.middleware.test.ts
cd ../..
npm run build:admin:api
npm run security:scan
```

Expected:

- Upload tests pass.
- Admin API build passes.
- Security scan no longer reports SVG uploads.

- [ ] **Step 5: Commit upload hardening**

```bash
git add apps/admin-backend/src/modules/files/files.middleware.ts apps/admin-backend/src/modules/files/files.service.ts apps/admin-backend/src/modules/files/files.middleware.test.ts
git commit -m "fix: deny svg uploads"
```

## Task 5: Add CSP Middleware in Report-Only Mode

**Files:**
- Create: `server/security-headers.js`
- Create: `server/security-headers.test.js`
- Modify: `server.js`
- Modify: `.env.example`

- [ ] **Step 1: Write CSP helper tests**

Create `server/security-headers.test.js`:

```js
const assert = require("node:assert/strict");
const test = require("node:test");
const {
  buildCspHeader,
  getCspDirectivesForPath,
  getCspHeaderName,
} = require("./security-headers");

test("getCspHeaderName defaults to report-only", () => {
  assert.equal(getCspHeaderName({ reportOnly: true }), "Content-Security-Policy-Report-Only");
  assert.equal(getCspHeaderName({ reportOnly: false }), "Content-Security-Policy");
});

test("admin csp is stricter than storefront csp", () => {
  const admin = getCspDirectivesForPath("/admin/");
  const storefront = getCspDirectivesForPath("/");
  assert.deepEqual(admin["default-src"], ["'self'"]);
  assert.ok(admin["script-src"].includes("'self'"));
  assert.equal(admin["script-src"].includes("'unsafe-inline'"), false);
  assert.ok(storefront["media-src"].includes("data:"));
});

test("buildCspHeader serializes directives", () => {
  const header = buildCspHeader({ "default-src": ["'self'"], "object-src": ["'none'"] });
  assert.equal(header, "default-src 'self'; object-src 'none'");
});
```

- [ ] **Step 2: Run CSP tests and verify they fail**

Run:

```bash
node --test server/security-headers.test.js
```

Expected: failure because `server/security-headers.js` does not exist.

- [ ] **Step 3: Add CSP helper**

Create `server/security-headers.js`:

```js
function parseBool(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  return ["1", "true", "yes"].includes(String(value).trim().toLowerCase());
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function configuredOrigins() {
  return unique(
    [
      process.env.SITE_URL,
      process.env.APP_URL,
      process.env.APP_BASE_URL,
      process.env.ADMIN_BACKEND_URL,
      process.env.API_URL,
      process.env.ADMIN_UI_URL,
    ]
      .flatMap((value) => String(value || "").split(","))
      .map((value) => {
        try {
          return new URL(value.trim()).origin;
        } catch {
          return "";
        }
      })
  );
}

function getStorefrontDirectives() {
  const origins = configuredOrigins();
  return {
    "default-src": ["'self'"],
    "base-uri": ["'self'"],
    "object-src": ["'none'"],
    "frame-ancestors": ["'self'"],
    "script-src": ["'self'", "'unsafe-inline'", "https://mc.yandex.ru", "https://top-fwz1.mail.ru"],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", "https:", ...origins],
    "font-src": ["'self'", "data:"],
    "media-src": ["'self'", "data:", "blob:"],
    "connect-src": ["'self'", ...origins, "https://mc.yandex.ru", "https://top-fwz1.mail.ru", "https://api.telegram.org"],
    "form-action": ["'self'", "https:"],
    "upgrade-insecure-requests": [],
  };
}

function getAdminDirectives() {
  const origins = configuredOrigins();
  return {
    "default-src": ["'self'"],
    "base-uri": ["'self'"],
    "object-src": ["'none'"],
    "frame-ancestors": ["'self'"],
    "script-src": ["'self'"],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:"],
    "font-src": ["'self'", "data:"],
    "connect-src": ["'self'", ...origins],
    "form-action": ["'self'"],
    "upgrade-insecure-requests": [],
  };
}

function getCspDirectivesForPath(pathname) {
  return String(pathname || "").startsWith("/admin") ? getAdminDirectives() : getStorefrontDirectives();
}

function buildCspHeader(directives) {
  return Object.entries(directives)
    .map(([name, values]) => (values.length ? `${name} ${unique(values).join(" ")}` : name))
    .join("; ");
}

function getCspHeaderName(options = {}) {
  return options.reportOnly ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy";
}

function applyContentSecurityPolicy(req, res, next) {
  const reportOnly = parseBool(process.env.CSP_REPORT_ONLY, true);
  res.setHeader(getCspHeaderName({ reportOnly }), buildCspHeader(getCspDirectivesForPath(req.path)));
  next();
}

module.exports = {
  applyContentSecurityPolicy,
  buildCspHeader,
  getCspDirectivesForPath,
  getCspHeaderName,
};
```

- [ ] **Step 4: Wire CSP into server.js**

In `server.js`, add near the existing imports:

```js
const { applyContentSecurityPolicy } = require("./server/security-headers");
```

Replace:

```js
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);
```

with:

```js
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);
app.use(applyContentSecurityPolicy);
```

The `contentSecurityPolicy: false` remains only inside Helmet because the project now applies its own path-aware CSP immediately after Helmet. Update `scripts/security-scan.mjs` in the same task so it fails only when `contentSecurityPolicy: false` appears without `applyContentSecurityPolicy`:

```js
if (/contentSecurityPolicy:\s*false/.test(serverSource) && !serverSource.includes("applyContentSecurityPolicy")) {
  fail("server.js must not disable contentSecurityPolicy without applying the project CSP middleware.");
}
```

In `.env.example`, add:

```env
CSP_REPORT_ONLY=true
```

- [ ] **Step 5: Run CSP tests and scan**

Run:

```bash
node --test server/security-headers.test.js
npm run security:scan
```

Expected:

- CSP tests pass.
- Security scan no longer reports disabled CSP or missing CSP middleware.

- [ ] **Step 6: Commit CSP report-only hardening**

```bash
git add .env.example server.js server/security-headers.js server/security-headers.test.js scripts/security-scan.mjs
git commit -m "feat: add report-only csp middleware"
```

## Task 6: Add Payment Webhook Idempotency

**Files:**
- Modify: `apps/admin-backend/prisma/schema.prisma`
- Create: `apps/admin-backend/prisma/migrations/20260619160000_payment_webhook_events/migration.sql`
- Create: `apps/admin-backend/src/modules/payments/webhook-idempotency.service.ts`
- Create: `apps/admin-backend/src/modules/payments/webhook-idempotency.service.test.ts`
- Modify: `apps/admin-backend/src/modules/payments/payment-webhook.controller.ts`

- [ ] **Step 1: Write idempotency identity tests**

Create `apps/admin-backend/src/modules/payments/webhook-idempotency.service.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { buildPaymentWebhookIdentity } from "./webhook-idempotency.service";

test("buildPaymentWebhookIdentity uses explicit event id when present", () => {
  const identity = buildPaymentWebhookIdentity("gateway", {
    event_id: "evt_123",
    order_id: "ord_1",
    status: "success",
  });

  assert.equal(identity.provider, "gateway");
  assert.equal(identity.eventKey, "event:evt_123");
  assert.equal(identity.orderId, "ord_1");
  assert.equal(identity.status, "success");
});

test("buildPaymentWebhookIdentity creates stable fallback key for identical payloads", () => {
  const payload = { invoice_id: "inv_1", order_id: "ord_1", status: "success", amount: "990.00" };
  const first = buildPaymentWebhookIdentity("gateway", payload);
  const second = buildPaymentWebhookIdentity("gateway", payload);
  assert.equal(first.eventKey, second.eventKey);
  assert.equal(first.payloadHash, second.payloadHash);
});
```

- [ ] **Step 2: Run idempotency tests and verify failure**

Run from the repository root:

```bash
cd apps/admin-backend
node --import tsx --test src/modules/payments/webhook-idempotency.service.test.ts
cd ../..
```

Expected: failure because `webhook-idempotency.service.ts` does not exist.

- [ ] **Step 3: Add Prisma model and migration**

In `apps/admin-backend/prisma/schema.prisma`, add near `Payment`:

```prisma
model PaymentWebhookEvent {
  id             String    @id @default(cuid())
  provider       String
  eventKey       String    @map("event_key")
  orderId        String?   @map("order_id")
  paymentId      String?   @map("payment_id")
  status         String
  payloadHash    String    @map("payload_hash")
  duplicateCount Int       @default(0) @map("duplicate_count")
  processedAt    DateTime? @map("processed_at")
  createdAt      DateTime  @default(now()) @map("created_at")

  @@unique([provider, eventKey])
  @@index([orderId])
  @@index([createdAt])
  @@map("payment_webhook_events")
}
```

Create `apps/admin-backend/prisma/migrations/20260619160000_payment_webhook_events/migration.sql`:

```sql
CREATE TABLE "payment_webhook_events" (
  "id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "event_key" TEXT NOT NULL,
  "order_id" TEXT,
  "payment_id" TEXT,
  "status" TEXT NOT NULL,
  "payload_hash" TEXT NOT NULL,
  "duplicate_count" INTEGER NOT NULL DEFAULT 0,
  "processed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "payment_webhook_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payment_webhook_events_provider_event_key_key"
  ON "payment_webhook_events"("provider", "event_key");

CREATE INDEX "payment_webhook_events_order_id_idx"
  ON "payment_webhook_events"("order_id");

CREATE INDEX "payment_webhook_events_created_at_idx"
  ON "payment_webhook_events"("created_at");
```

- [ ] **Step 4: Add idempotency service**

Create `apps/admin-backend/src/modules/payments/webhook-idempotency.service.ts`:

```ts
import crypto from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";

type WebhookPayload = Record<string, unknown>;

function firstString(...values: unknown[]) {
  for (const value of values) {
    const normalized = String(value || "").trim();
    if (normalized) return normalized;
  }
  return "";
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(obj[key])}`)
    .join(",")}}`;
}

function sha256(value: string) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

export function buildPaymentWebhookIdentity(providerRaw: string, payload: WebhookPayload) {
  const provider = String(providerRaw || "unknown").trim().toLowerCase() || "unknown";
  const nested = payload.data && typeof payload.data === "object" && !Array.isArray(payload.data)
    ? (payload.data as Record<string, unknown>)
    : {};
  const explicitEventId = firstString(payload.event_id, payload.eventId, payload.webhook_id, payload.webhookId, nested.event_id, nested.eventId);
  const orderId = firstString(payload.orderId, payload.order_id, nested.orderId, nested.order_id);
  const paymentId = firstString(payload.paymentId, payload.payment_id, payload.invoiceId, payload.invoice_id, payload.id, nested.paymentId, nested.payment_id, nested.invoiceId, nested.invoice_id, nested.id);
  const status = firstString(payload.status, payload.event, nested.status, nested.event).toLowerCase() || "unknown";
  const payloadHash = sha256(stableStringify(payload));
  const eventKey = explicitEventId
    ? `event:${explicitEventId}`
    : `fallback:${sha256([provider, paymentId, orderId, status, payloadHash].join("|"))}`;

  return { provider, eventKey, orderId, paymentId, status, payloadHash };
}

export async function runPaymentWebhookOnce<T>(
  providerRaw: string,
  payload: WebhookPayload,
  processWebhook: () => Promise<T & { orderId?: string; duplicate?: boolean }>
) {
  const identity = buildPaymentWebhookIdentity(providerRaw, payload);

  try {
    await prisma.paymentWebhookEvent.create({
      data: identity,
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await prisma.paymentWebhookEvent.update({
        where: {
          provider_eventKey: {
            provider: identity.provider,
            eventKey: identity.eventKey,
          },
        },
        data: { duplicateCount: { increment: 1 } },
      });
      return { ok: true, duplicate: true, orderId: existing.orderId || undefined } as T & { duplicate: true; orderId?: string };
    }
    throw error;
  }

  try {
    const result = await processWebhook();
    await prisma.paymentWebhookEvent.update({
      where: {
        provider_eventKey: {
          provider: identity.provider,
          eventKey: identity.eventKey,
        },
      },
      data: {
        orderId: result.orderId || identity.orderId || null,
        paymentId: identity.paymentId || null,
        status: identity.status,
        processedAt: new Date(),
      },
    });
    return result;
  } catch (error) {
    await prisma.paymentWebhookEvent
      .delete({
        where: {
          provider_eventKey: {
            provider: identity.provider,
            eventKey: identity.eventKey,
          },
        },
      })
      .catch(() => undefined);
    throw error;
  }
}
```

- [ ] **Step 5: Wrap webhook controller**

In `apps/admin-backend/src/modules/payments/payment-webhook.controller.ts`, import:

```ts
import { runPaymentWebhookOnce } from "./webhook-idempotency.service";
```

Replace:

```ts
result = await paymentWebhookService.handle(payload as any);
```

with:

```ts
const provider = String((payload as any)?.provider || (payload as any)?.payment_provider || "gateway");
result = await runPaymentWebhookOnce(provider, payload as any, () => paymentWebhookService.handle(payload as any));
```

- [ ] **Step 6: Run tests, generate Prisma client, build**

Run:

```bash
npm run test:security --workspace @gptishka/admin-backend
npm run prisma:generate --workspace @gptishka/admin-backend
npm run build:admin:api
```

Expected:

- Idempotency tests pass.
- Prisma client generates with `paymentWebhookEvent`.
- Admin API build passes.

- [ ] **Step 7: Commit webhook idempotency**

```bash
git add apps/admin-backend/prisma/schema.prisma apps/admin-backend/prisma/migrations/20260619160000_payment_webhook_events apps/admin-backend/src/modules/payments
git commit -m "feat: add payment webhook idempotency"
```

## Task 7: Add Production Hardening Checklist

**Files:**
- Create: `docs/security/production-hardening.md`
- Modify: `DEPLOY_REGRU.md`

- [ ] **Step 1: Create production hardening document**

Create `docs/security/production-hardening.md`:

```md
# GPTishka Production Security Checklist

Target topology: nginx public edge, PM2 private Node processes, PostgreSQL on private interface, no Cloudflare dependency.

## Network

- Only ports 22, 80, and 443 are public.
- `gptishka-storefront` binds to `127.0.0.1:4000`.
- `gptishka-admin-api` binds to `127.0.0.1:4100`.
- PostgreSQL binds to localhost or private network only.

## nginx

- Run `nginx -t` before reload.
- Redirect HTTP to HTTPS.
- Enable HSTS after HTTPS is confirmed stable.
- Set `client_max_body_size 8m` for normal routes and no more than `20m` for admin uploads.
- Deny `.env`, `.git`, backups, `data/`, `apps/`, `includes/`, and generated archives.
- Deny script execution in upload directories.
- Proxy `X-Forwarded-Proto`, `X-Forwarded-For`, and `Host`.

## PM2

- Use `pm2 startOrReload ecosystem.config.js --update-env`.
- Run `pm2 save` after successful reload.
- Check `pm2 status` and `pm2 logs --lines 100` after deploy.

## Application

- `NODE_ENV=production`.
- `CSP_REPORT_ONLY=true` for first deploy after CSP changes.
- Change `CSP_REPORT_ONLY=false` only after storefront and admin smoke tests pass.
- `ADMIN_BOOTSTRAP_REGISTRATION_ENABLED=false` except during the first controlled bootstrap window.
- `PAYMENT_WEBHOOK_IP_ALLOWLIST` is set when Enot publishes stable source IPs.
- JWT and payment secrets are unique production values with at least 32 random characters.

## Verification

- `npm run test:security`
- `npm run build:admin:api`
- `npm run build:admin:ui`
- `npm run security:scan`
- `curl -I https://gptishka.shop`
- `curl -s https://admin-api.gptishka.shop/api/admin/health`
- Test admin login, reload, logout, and logout-all.
- Test checkout creation and payment redirect.
- Send an invalid-signature webhook and confirm rejection.
- Upload png/webp product images and confirm SVG is rejected.
```

- [ ] **Step 2: Link the checklist from deployment docs**

Append this section to `DEPLOY_REGRU.md`:

````md
## Security hardening checklist

Before production reload, review `docs/security/production-hardening.md`.

Minimum release checks:

```bash
npm run test:security
npm run build:admin:api
npm run build:admin:ui
npm run security:scan
nginx -t
```
````

- [ ] **Step 3: Commit production checklist**

```bash
git add docs/security/production-hardening.md DEPLOY_REGRU.md
git commit -m "docs: add production hardening checklist"
```

## Task 8: Final Verification and CSP Enforcement Decision

**Files:**
- No required file changes unless verification exposes a concrete issue.

- [ ] **Step 1: Run full security verification**

Run:

```bash
npm run test:security
npm run build:admin:api
npm run build:admin:ui
npm run security:scan
```

Expected:

- All commands pass.
- No security scan failures remain.

- [ ] **Step 2: Run Prisma validation**

Run:

```bash
npm run prisma:generate --workspace @gptishka/admin-backend
```

Expected: Prisma client generation succeeds.

- [ ] **Step 3: Check working tree scope**

Run:

```bash
git status --short
git diff --name-only HEAD
```

Expected:

- Security hardening files are committed.
- Existing unrelated dirty files remain untouched unless a task explicitly changed them.

- [ ] **Step 4: Decide CSP mode for deployment**

Keep `.env.example` with:

```env
CSP_REPORT_ONLY=true
```

For the first production deploy after this plan, use report-only. After smoke testing in production, set the production environment to:

```env
CSP_REPORT_ONLY=false
```

- [ ] **Step 5: Prepare final implementation summary**

Include these points in the final summary:

- Admin access tokens are memory-only.
- Bootstrap registration is disabled by default.
- Logout-all and admin session revocation exist.
- SVG uploads are denied.
- CSP middleware is active in report-only mode by default.
- Payment webhook idempotency table and processing wrapper are added.
- Production checklist is documented.
- Verification command results are listed.

## Self-Review Notes

Spec coverage:

- Security architecture is covered by Task 1 scan gates and Task 7 production checklist.
- Auth, sessions, roles, and bootstrap hardening are covered by Tasks 2 and 3.
- CSP and browser XSS guardrails are covered by Tasks 1 and 5.
- Upload hardening is covered by Task 4.
- Public payment webhook idempotency is covered by Task 6.
- Operations and verification are covered by Tasks 7 and 8.

Intentional Phase 1 gaps:

- 2FA remains a separate implementation slice because it needs enrollment UI, recovery codes, and support reset policy.
- Live VPS firewall and nginx edits remain checklist-driven because this workspace does not provide server access.
- Full server-side replacement of storefront activation token browser storage remains a separate migration because it changes customer activation UX.
