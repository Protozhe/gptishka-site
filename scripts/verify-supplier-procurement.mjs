import { spawnSync } from "node:child_process";
const result = spawnSync(process.execPath, ["--test", "ops/supplier-procurement/aisou-core.test.cjs"], {
  cwd: process.cwd(), env: process.env, stdio: "inherit",
});
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
