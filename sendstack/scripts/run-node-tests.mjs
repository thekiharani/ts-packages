import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import process from "node:process";

function collectTestFiles(directory) {
  const files = [];

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...collectTestFiles(entryPath));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".test.mjs")) {
      files.push(entryPath);
    }
  }

  return files;
}

const testFiles = collectTestFiles(resolve("tests")).sort();

if (testFiles.length === 0) {
  throw new Error("No .test.mjs files were found under tests/.");
}

const result = spawnSync(process.execPath, ["--test", ...testFiles], {
  stdio: "inherit",
  env: process.env,
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
