import fs from "node:fs";

const source = fs.readFileSync("apps/admin-backend/src/modules/orders/orders.service.ts", "utf8");

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

if (process.exitCode) process.exit(process.exitCode);
console.log("chongzhi timeout recovery check passed");
