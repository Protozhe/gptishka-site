import { spawnSync } from "node:child_process";
const result = spawnSync(process.execPath, ["--test", "ops/supplier-procurement/aisou-core.test.cjs", "ops/supplier-procurement/aisou-live.test.cjs"], {
  cwd: process.cwd(), env: process.env, stdio: "inherit",
});
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
const python = spawnSync(process.platform === "win32" ? "python" : "python3", ["-B", "ops/supplier-procurement/test-pulse.py"], {
  cwd: process.cwd(), env: process.env, stdio: "inherit",
});
if (python.error) throw python.error;
if (python.status !== 0) process.exit(python.status ?? 1);
