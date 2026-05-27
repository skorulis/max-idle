#!/usr/bin/env node
/**
 * Verifies tests, lint, and builds pass before a release.
 * Aligns with .github/workflows/deploy-production.yml (release path).
 */
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

export function assertReleaseReady() {
  process.chdir(root);

  function runCheck(description, command) {
    console.log(`\n>>> ${description}`);
    execSync(command, { stdio: "inherit" });
  }

  console.log("Verifying tests and builds pass before release...");
  runCheck("shared: build", "npm run --prefix shared build");
  runCheck("shared: test", "npm test --prefix shared");
  runCheck("idle-backend: test", "npm test --prefix idle-backend");
  runCheck("idle-backend: build", "npm run --prefix idle-backend build");
  runCheck("idle-react: lint", "npm run --prefix idle-react lint");
  runCheck("idle-react: test", "npm test --prefix idle-react");
  runCheck("idle-react: build", "npm run --prefix idle-react build");
  console.log("\nAll checks passed.\n");
}

const scriptPath = fileURLToPath(import.meta.url);
const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(scriptPath);
if (isMain) {
  assertReleaseReady();
}
