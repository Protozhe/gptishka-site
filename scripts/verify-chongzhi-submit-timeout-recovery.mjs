import fs from "node:fs";

const source = fs.readFileSync("apps/admin-backend/src/modules/orders/orders.service.ts", "utf8");
const ecosystem = fs.readFileSync("ecosystem.config.js", "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(`chongzhi timeout recovery check failed: ${message}`);
    process.exitCode = 1;
  }
}

assert(
  source.includes("async function recoverCompletedChongzhiJsonTask("),
  "provider timeout recovery helper must exist"
);
assert(
  source.includes('callChongzhiJsonApi(base, "query_code"'),
  "recovery must query the provider CDK state"
);
assert(
  source.includes("if (recovered) return recovered;"),
  "completed activation must replace the timeout failure"
);
assert(
  source.includes("recoveredAfterSubmit: true"),
  "recovered activations must be identifiable in provider diagnostics"
);
assert(
  source.includes('const configuredIp = String(env.ACTIVATION_CHONGZHI_IP || "").trim();'),
  "provider requests must support a direct-IP DNS fallback"
);
assert(
  source.includes("servername: parsedApiUrl.hostname"),
  "direct-IP HTTPS requests must preserve hostname verification through SNI"
);
assert(
  source.includes("Host: parsedApiUrl.host"),
  "direct-IP HTTPS requests must preserve the provider Host header"
);
assert(
  ecosystem.includes('ACTIVATION_CHONGZHI_IP: process.env.ACTIVATION_CHONGZHI_IP || "172.105.209.180"'),
  "production must provide the verified provider-IP fallback"
);

if (process.exitCode) process.exit(process.exitCode);
console.log("chongzhi timeout recovery check passed");
