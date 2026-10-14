import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import {spawnSync} from "node:child_process";

const file = "apps/admin-backend/src/modules/notifications/notifications.service.ts";
const text = fs.readFileSync(file, "utf8");
const source = ts.createSourceFile("notifications.ts", text, ts.ScriptTarget.Latest, true);
const functions = new Map();
function visit(node) {
  if (ts.isFunctionDeclaration(node) && node.name) functions.set(node.name.text, node.getText(source));
  ts.forEachChild(node, visit);
}
visit(source);
const dispatcher = {fixture: true}; let requests = 0, observed, order;
const context = vm.createContext({
  env: {TELEGRAM_BOT_TOKEN: "fixture-token", TELEGRAM_CHAT_ID: "fixture-chat"},
  telegramDispatcher: dispatcher, AbortSignal,
  async telegramFetch(_url, options) {
    observed = options; requests++;
    return {ok: requests > 1, status: requests > 1 ? 200 : 502,
      text: async () => requests > 1 ? '{"ok":true,"result":{"message_id":51}}' : '{"ok":false}'};
  },
  setTimeout(resolve) { resolve(); },
  prisma: {order: {findUnique: async () => order}},
  buildOrderActivationRecoveryLink: async () => ({activationUrl: "https://fixture.invalid/activation"}),
  async sendTelegramNotification(message) { observed = message; return 77; },
});
for (const name of ["callAdminTelegramApi", "deliverPaidManagerNotification"]) {
  vm.runInContext(ts.transpileModule(functions.get(name), {compilerOptions: {target: ts.ScriptTarget.ES2022}}).outputText, context);
}
const result = await context.callAdminTelegramApi("getMe", {});
assert.equal(result.message_id, 51);
assert.equal(requests, 2);
assert.equal(observed.dispatcher, dispatcher, "The actual Telegram request must use the configured proxy");
const paid = {id: "fixture-order", email: "fixture@example.invalid", totalAmount: 1500, currency: "RUB", status: "PAID", paymentMethod: "pally", payments: [{status: "SUCCESS", provider: "pally"}]};
for (const invalid of [null, {...paid, status: "PENDING"}, {...paid, status: "REFUNDED"}, {...paid, payments: []}, {...paid, paymentMethod: "stub"}, {...paid, payments: [{status: "SUCCESS", provider: "stub"}]}]) {
  order = invalid; observed = null;
  assert.equal(await context.deliverPaidManagerNotification("fixture-order"), null);
  assert.equal(observed, null, "Untrusted payment must send no notification");
}
order = paid;
assert.equal(await context.deliverPaidManagerNotification("fixture-order"), 77);
assert.match(observed, /fixture-order/);
assert.match(fs.readFileSync("apps/admin-backend/src/main.ts", "utf8"), /startManagerNotificationScheduler\(\)/);
const tests = spawnSync(process.execPath, ["--import", "tsx", "--test", "apps/admin-backend/src/modules/notifications/manager-notifications.outbox.test.ts"], {stdio: "inherit"});
assert.equal(tests.status, 0, "Persistent notification retry checks must pass");
console.log("Manager notifications use their proxy, validate paid orders and persist retries across restarts.");
