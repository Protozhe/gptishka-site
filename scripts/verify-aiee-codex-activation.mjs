import assert from "node:assert/strict";
import fs from "node:fs";

const service = fs.readFileSync("apps/admin-backend/src/modules/orders/orders.service.ts", "utf8");
const storefront = fs.readFileSync("assets/js/codex-credits.js", "utf8");
const redeemPage = fs.readFileSync("redeem-start.html", "utf8");

assert.match(service, /function isAieeProviderBase\(/, "AIEE provider detection is missing");
assert.match(service, /isAieeProviderBase\(record\.activationSiteUrl\s*\|\|\s*""\)\) return true/, "AIEE orders must use AIEE status polling");
assert.match(service, /isAieeProviderBase\(base\)\s*\?\s*"api\/auth\.php"\s*:\s*"api\.php"/, "AIEE must use its current auth API");
assert.match(service, /callChongzhiJsonApi\(base,\s*"validate_token"/, "AIEE token validation is missing");
assert.match(service, /callChongzhiJsonApi\(base,\s*"submit_recharge"/, "AIEE recharge submission is missing");
assert.match(service, /callChongzhiJsonApi\(base,\s*"query_code"/, "AIEE result polling is missing");
assert.match(service, /requireRechargeSuccess:\s*isAieeProviderBase\(base\)/, "AIEE completion must require recharge success");
assert.match(service, /requireRechargeSuccess:\s*isAiee/, "AIEE status polling must not treat a consumed key as completed credits");
assert.match(service, /isCodexCreditsProductKey\(input\.productKey\)\s*\|\|\s*isAieeProviderBase\(input\.activationSiteUrl\)/, "Codex activation must route to AIEE independently of the global provider setting");
assert.match(service, /validateAieeSessionJson\(tokenInfo\)/, "Codex must reject a bare token before contacting AIEE");
assert.match(service, /lastProviderMessage:\s*`\$\{providerName\} task creation failed/, "Failed task creation must leave a safe diagnostic on the order");
assert.match(storefront, /credits:\(250\|500\|1000\)/, "All three Codex denominations must remain available in the storefront");
assert.match(redeemPage, /Данные сохранены\. Нажмите «Активировать»/, "The page must not claim a token was verified before activation starts");

console.log("AIEE Codex 250/500/1000 activation and status guard verified.");
