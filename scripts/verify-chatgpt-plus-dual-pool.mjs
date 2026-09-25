import assert from "node:assert/strict";
import fs from "node:fs";

const service = fs.readFileSync("apps/admin-backend/src/modules/orders/orders.service.ts", "utf8");
const delivery = fs.readFileSync("apps/admin-backend/src/modules/orders/delivery.service.ts", "utf8");
const activationStore = fs.readFileSync("apps/admin-backend/src/modules/orders/activation.store.ts", "utf8");

assert.match(delivery, /CHATGPT_PLUS_IOS_SITE_URL[\s\S]*CHATGPT_PLUS_FREE_SITE_URL/, "Both ChatGPT Plus pools must be declared");
assert.match(delivery, /reservedCandidates:\s*candidates/, "Both candidates must be persisted with the paid order");
assert.match(activationStore, /reservedCandidates\?:\s*Array/, "Activation records must support two reserved candidates");
assert.match(service, /planType === "free"[\s\S]*CHATGPT_PLUS_FREE_SITE_URL/, "Free accounts must select GPLUS/AIEE");
assert.match(service, /\["go", "plus", "prolight", "pro"\][\s\S]*CHATGPT_PLUS_IOS_SITE_URL/, "Paid plans must select the IOS pool");
assert.match(service, /force_overwrite:\s*Boolean\(input\.forceOverwrite\)/, "Paid-plan renewals must enable force overwrite");
assert.match(service, /status === 0 \|\| status >= 500/, "Network failures must be retryable");
assert.match(service, /jsonApiAttempts = Math\.min\(3, ACTIVATION_OUTSTOCK_MAX_RETRIES\)/, "Provider JSON calls must retry transient failures");
assert.match(service, /isIosProviderBase\(input\.activationSiteUrl\)/, "IOS orders must route independently of the global provider switch");

console.log("ChatGPT Plus dual-pool selection, renewal and retry guards verified.");
