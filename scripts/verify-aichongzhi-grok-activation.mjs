import fs from "node:fs";

const service = fs.readFileSync("apps/admin-backend/src/modules/orders/orders.service.ts", "utf8");
const envSchema = fs.readFileSync("apps/admin-backend/src/config/env.ts", "utf8");
const ecosystem = fs.readFileSync("ecosystem.config.js", "utf8");
const routes = fs.readFileSync("apps/admin-backend/src/modules/orders/orders.routes.ts", "utf8");
const schemas = fs.readFileSync("apps/admin-backend/src/modules/orders/orders.schemas.ts", "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(`aichongzhi Grok activation check failed: ${message}`);
    process.exitCode = 1;
  }
}

assert(
  service.includes('new URL("/api/redeem.php", parsed.origin)'),
  "Grok activations must use the provider redeem endpoint"
);
assert(
  service.includes('callAichongzhiApi("verifyCdk", { code: input.cdk, product: input.product }, input.product)'),
  "SDK must be verified before activation"
);
assert(
  service.includes('callAichongzhiApi("activate", {'),
  "verified SDK and account ID must be submitted through the activate action"
);
assert(
  service.includes('callAichongzhiApi("status", { code }, product)'),
  "activation status must be checked by CDK"
);
assert(
  service.includes("function publicAichongzhiMessage") &&
    service.includes('return "Подключаем подписку. Пожалуйста, подождите."'),
  "provider messages shown in the order must be normalized to Russian"
);
assert(
  service.includes("const aichongzhiProduct = resolveAichongzhiProduct(input.productKey)") &&
    service.includes("if (aichongzhiProduct)") &&
    service.includes("startAichongzhiTaskWithRetry({ ...input, product: aichongzhiProduct })"),
  "SuperGrok support products must route through the new adapter"
);
assert(
  service.includes("servername: target.apiUrl.hostname") && service.includes("Host: target.apiUrl.host"),
  "direct-IP HTTPS must preserve SNI and Host verification"
);
assert(
  envSchema.includes('ACTIVATION_GROK_BASE_URL: z.string().url().default("https://aichongzhi.fun/?product=grok")'),
  "the provider URL must have a safe production default"
);
assert(
  ecosystem.includes('ACTIVATION_GROK_IP: process.env.ACTIVATION_GROK_IP || "139.162.68.169"'),
  "production must use the verified provider-IP fallback"
);
assert(
  routes.includes('"/:id/activation/start"') &&
    routes.includes('allowRoles(["OWNER", "ADMIN", "SUPPORT"])') &&
    routes.includes("validateBody(adminStartActivationSchema)"),
  "admin-assisted activation must stay authenticated, role-limited, and validated"
);
assert(
  schemas.includes("accountId: z.string().trim().uuid().max(128)"),
  "admin-assisted activation must only accept a UUID account ID"
);
assert(
  service.includes('action: "activation_admin_start"'),
  "admin-assisted activation must write an audit event without storing the account ID in the audit payload"
);

if (process.exitCode) process.exit(process.exitCode);
console.log("aichongzhi Grok activation adapter verified");
