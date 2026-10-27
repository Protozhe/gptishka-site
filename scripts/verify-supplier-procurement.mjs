import { spawnSync } from "node:child_process";
const result = spawnSync(process.execPath, ["--test", "ops/supplier-procurement/market-shared-stock.test.cjs", "ops/supplier-procurement/aisou-core.test.cjs", "ops/supplier-procurement/aisou-live.test.cjs", "ops/supplier-procurement/aibuy.test.cjs", "ops/supplier-procurement/aibuy-order.test.cjs"], {
  cwd: process.cwd(), env: process.env, stdio: "inherit",
});
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
const python = spawnSync(process.platform === "win32" ? "python" : "python3", ["-B", "ops/supplier-procurement/test-pulse.py"], {
  cwd: process.cwd(), env: process.env, stdio: "inherit",
});
if (python.error) throw python.error;
if (python.status !== 0) process.exit(python.status ?? 1);
const aibuy=spawnSync(process.platform==='win32'?'python':'python3',['-B','ops/supplier-procurement/test-aibuy.py'],{cwd:process.cwd(),env:process.env,stdio:'inherit'});
if(aibuy.error)throw aibuy.error;
if(aibuy.status!==0)process.exit(aibuy.status??1);
const marketplace=spawnSync(process.platform==='win32'?'python':'python3',['-B','ops/supplier-procurement/test-aibuy-market.py'],{cwd:process.cwd(),env:process.env,stdio:'inherit'});
if(marketplace.error)throw marketplace.error;
if(marketplace.status!==0)process.exit(marketplace.status??1);
const shared=spawnSync(process.platform==='win32'?'python':'python3',['-B','ops/supplier-procurement/test-market-shared-stock.py'],{cwd:process.cwd(),env:process.env,stdio:'inherit'});
if(shared.error)throw shared.error;
if(shared.status!==0)process.exit(shared.status??1);
const reserve = spawnSync(process.platform === "win32" ? "python" : "python3", ["-B", "ops/subscription-routes/test-reserve.py"], {cwd:process.cwd(),env:process.env,stdio:"inherit"});
if(reserve.error) throw reserve.error;
if(reserve.status!==0) process.exit(reserve.status??1);
for(const [runtime,args] of [[process.execPath,['--test','ops/subscription-routes/native.test.cjs']], [process.platform==='win32'?'python':'python3',['-B','ops/subscription-routes/test-claude.py']]]) {
  const checked=spawnSync(runtime,args,{cwd:process.cwd(),env:process.env,stdio:'inherit'});
  if(checked.error)throw checked.error;
  if(checked.status!==0)process.exit(checked.status??1);
}
