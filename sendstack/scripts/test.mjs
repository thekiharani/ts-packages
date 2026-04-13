import { spawnSync } from "node:child_process";
import process from "node:process";

const args = process.argv.slice(2);
const useCoverage = args.includes("--coverage");
const targetScript = useCoverage ? "test:coverage" : "test:run";

const npmExecPath = process.env["npm_execpath"];

if (!npmExecPath) {
  throw new Error("npm_execpath is not available in this runtime.");
}

const result = spawnSync(process.execPath, [npmExecPath, "run", targetScript], {
  stdio: "inherit",
  env: process.env,
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
