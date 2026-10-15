import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { EventEmitter } from "node:events";
import ts from "typescript";

const text = fs.readFileSync("apps/admin-backend/src/modules/orders/orders.service.ts", "utf8");
const source = ts.createSourceFile("orders.ts", text, ts.ScriptTarget.Latest, true);
let functionText;
function visit(node) {
  if (ts.isFunctionDeclaration(node) && node.name?.text === "callAieeJsonApi") functionText = node.getText(source);
  ts.forEachChild(node, visit);
}
visit(source);
assert.ok(functionText);
let invocations, mode, args, input;
const context = vm.createContext({
  env: {AIEE_PROXY_URL: "http://127.0.0.1:18082"},
  setTimeout, clearTimeout,
  tryParseJson: value => { try { return JSON.parse(value); } catch { return null; } },
  spawn(command, argv, options) {
    invocations++; args = argv;
    assert.equal(command, "curl");
    assert.deepEqual(Array.from(options.stdio), ["pipe", "pipe", "pipe"]);
    const child = new EventEmitter();
    child.kill = () => {};
    child.stdout = new EventEmitter(); child.stdout.setEncoding = () => {};
    child.stderr = {resume() {}};
    child.stdin = new EventEmitter();
    child.stdin.end = body => {
      input = body;
      queueMicrotask(() => {
        if (mode === "fail") { child.emit("close", 28); return; }
        child.stdout.emit("data", '{"success":true}\n200'); child.emit("close", 0);
      });
    };
    return child;
  },
});
vm.runInContext(ts.transpileModule(functionText, {compilerOptions: {target: ts.ScriptTarget.ES2022}}).outputText, context);
for (const action of ["verify_code", "validate_token", "submit_recharge", "query_code"]) {
  invocations = 0; mode = "success";
  const body = JSON.stringify({action, json_token: "fixture-sensitive-data"});
  const result = await context.callAieeJsonApi(body, 1000);
  assert.equal(result.json.success, true);
  assert.equal(invocations, 1);
  assert.equal(args[args.indexOf("--proxy") + 1], context.env.AIEE_PROXY_URL);
  assert.equal(args[args.indexOf("--noproxy") + 1], "");
  assert.equal(args.at(-1), "https://aiee.fun/api/auth.php");
  assert.equal(args.includes("--insecure"), false);
  assert.equal(args.some(value => value.startsWith("--retry")), false);
  assert.equal(args.some(value => value.includes("fixture-sensitive-data")), false);
  assert.equal(input, body);
}
invocations = 0; mode = "fail";
await assert.rejects(context.callAieeJsonApi('{"action":"submit_recharge"}', 1000),
  error => error.message === "AIEE transport failed" && error.transportExitCode === 28);
assert.equal(invocations, 1, "An uncertain submission must not be replayed through a fallback route");
context.env.AIEE_PROXY_URL = ""; invocations = 0; mode = "success";
await context.callAieeJsonApi('{"action":"query_code"}', 1000);
assert.equal(args.includes("--proxy"), false, "Development must retain direct routing without a configured proxy");
console.log("AIEE uses its configured proxy for every phase, preserves TLS and stdin privacy, and never replays an uncertain submission.");
