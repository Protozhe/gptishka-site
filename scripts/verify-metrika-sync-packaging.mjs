import assert from "node:assert/strict";
import fs from "node:fs";
import { spawnSync } from "node:child_process";

// Never import or execute the operational script during release verification.
// These checks work in a fresh Git archive without DB access or credentials.
const scriptPath = "apps/admin-backend/scripts/sync-metrika-paid-orders.ts";
assert.ok(fs.existsSync(scriptPath), "Release must package the paid-order monitoring script");
const ignored = spawnSync("git", ["check-ignore", "--no-index", "--", scriptPath], { encoding: "utf8" });
assert.equal(ignored.status, 1, "The monitoring script must not be excluded from Git");
const script = fs.readFileSync(scriptPath, "utf8");
assert.match(script, /const upload = args\.includes\("--upload"\)/);
assert.match(script, /if \(!upload\) \{[\s\S]*?No data uploaded\.[\s\S]*?\n    return;\n  \}/);
assert.match(script, /--upload requires at least one explicit --order-id=ID/);
assert.match(script, /--upload is limited to the reviewed ChatGPT Plus campaign/);
assert.ok(script.indexOf("if (!upload)") < script.indexOf("await prisma.metrikaOfflineConversion.createMany"));
const helper = fs.readFileSync("apps/admin-backend/src/modules/analytics/metrika-offline-conversion.ts", "utf8");
assert.match(helper, /export function campaignConversionIdentifier/);
assert.match(helper, /export function conversionCsv/);
console.log("Metrika monitoring script packaging and explicit-upload guards verified.");
