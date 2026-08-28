import assert from "node:assert/strict";
import fs from "node:fs";

const service = fs.readFileSync("apps/admin-backend/src/modules/orders/orders.service.ts", "utf8");
const adminUi = fs.readFileSync("apps/admin-ui/src/pages/OrdersPage.tsx", "utf8");

assert.match(
  service,
  /options\?\.forceCheck\s*&&\s*!activationAlreadyConfirmed/,
  "Completed activations must not be sent to the provider for another status check"
);
assert.match(
  service,
  /if \(storedIsSuccess\)[\s\S]*success: true/,
  "Client polling must stop immediately after provider success"
);
assert.match(
  service,
  /isChongzhiActivationRecord\(stored\)[\s\S]*fetchChongzhiCodeStatus/,
  "ChatGPT activation task polling must use the configured provider status API"
);
assert.match(
  service,
  /if \(isSupportLikeDeliveryType\(deliveryType\)\)[\s\S]*fetchQuickplusSupportTaskPayload/,
  "Support activations must use their provider-specific status endpoint"
);
assert.match(
  service,
  /Не удалось получить обновлённый статус от провайдера/,
  "Raw provider HTML errors must be converted to a readable message"
);
assert.match(
  adminUi,
  /certaintyCode === "ACTIVATED_CONFIRMED_PROVIDER" \|\| !providerMessage/,
  "Successful activation notice must not append stale provider diagnostics"
);

console.log("Activation success messaging verified.");
