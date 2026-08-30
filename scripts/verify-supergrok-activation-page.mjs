import fs from "node:fs";

const redeem = fs.readFileSync("redeem-start.html", "utf8");
const success = fs.readFileSync("success.html", "utf8");
const server = fs.readFileSync("server.js", "utf8");
const service = fs.readFileSync("apps/admin-backend/src/modules/orders/orders.service.ts", "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(`SuperGrok activation page check failed: ${message}`);
    process.exitCode = 1;
  }
}

assert(
  server.includes('["/supergrok-activation", "/supergrok-activation.html"]') &&
    server.includes('path.join(__dirname, "redeem-start.html")'),
  "the dedicated public URL must serve the maintained activation template"
);
assert(
  server.includes('"/supergrok-activation.html"'),
  "the dedicated page must be excluded from search indexing"
);
assert(
  success.includes('serviceKey === "grok" ? "/supergrok-activation.html" : "/redeem-start.html"'),
  "paid SuperGrok orders must open the dedicated activation page"
);
assert(
  redeem.includes("const dedicatedSuperGrokPage =") &&
    !redeem.includes('id="supergrokActivationIntro"') &&
    !redeem.includes("redeem-supergrok-intro"),
  "the dedicated page must not render a duplicate SuperGrok information plaque"
);
assert(
  redeem.includes("https://grok.com/api/auth/session") &&
    redeem.includes("/assets/img/supergrok-activation-1.png") &&
    redeem.includes("/assets/img/supergrok-activation-2.png"),
  "the Grok account-ID instruction and screenshots must remain available"
);
assert(
  service.includes("function resolveSuperGrokDurationMonths") &&
    service.includes("durationMonths,"),
  "the activation response must expose the paid SuperGrok duration"
);
assert(
  redeem.includes("const POLL_MAX_MS = 15 * 60 * 1000") &&
    redeem.includes("Активация выполняется более 15 минут"),
  "long-running activation messaging must start after 15 minutes"
);
assert(
  redeem.includes("/activation/store-token") &&
    redeem.includes("ID аккаунта проверен и сохранён для выполнения заказа") &&
    server.includes('/activation/store-token${suffix}') &&
    service.includes("if (!current && isSupportTokenFlow)"),
  "a valid client account ID must be stored even when no SDK key is available"
);
assert(
  redeem.includes("Сейчас возникла техническая задержка. ID аккаунта сохранён") &&
    redeem.includes("isMissingActivationKeyMessage"),
  "missing SDK inventory must be presented as a recoverable technical delay"
);

const startRouter = service.slice(
  service.indexOf("async function startQuickplusSupportTaskWithRetry"),
  service.indexOf("async function startQuickplusSupportTaskWithRetry") + 700
);
const statusRouter = service.slice(
  service.indexOf("async function fetchQuickplusSupportTaskPayload"),
  service.indexOf("async function fetchQuickplusSupportTaskPayload") + 650
);
assert(
  startRouter.includes("isAichongzhiGrokSupportProduct") && !startRouter.includes("startSxzfdGrokTaskWithRetry"),
  "all new SuperGrok activations must start through aichongzhi.fun"
);
assert(
  statusRouter.includes("fetchAichongzhiGrokTaskPayload") && !statusRouter.includes("fetchSxzfdGrokTaskPayload"),
  "all SuperGrok status checks must use aichongzhi.fun"
);

if (process.exitCode) process.exit(process.exitCode);
console.log("SuperGrok dedicated activation page verified");
