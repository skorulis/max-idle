#!/usr/bin/env node
/**
 * Bumps APP_VERSION patch in shared/appVersion.ts, commits, and tags release/x.y.z.
 * Runs shared/backend/frontend tests, lint, and builds first; aborts without changes if any step fails.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const versionFile = path.join(root, "shared", "appVersion.ts");

process.chdir(root);

function runCheck(description, command) {
  console.log(`\n>>> ${description}`);
  execSync(command, { stdio: "inherit" });
}

function assertReleaseReady() {
  console.log("Verifying tests and builds pass before bump...");
  // Align with .github/workflows/deploy-production.yml (release path)
  runCheck("shared: build", "npm run --prefix shared build");
  runCheck("shared: test", "npm test --prefix shared");
  runCheck("idle-backend: test", "npm test --prefix idle-backend");
  runCheck("idle-backend: build", "npm run --prefix idle-backend build");
  runCheck("idle-react: lint", "npm run --prefix idle-react lint");
  runCheck("idle-react: test", "npm test --prefix idle-react");
  runCheck("idle-react: build", "npm run --prefix idle-react build");
  console.log("\nAll checks passed.\n");
}

assertReleaseReady();

const src = fs.readFileSync(versionFile, "utf8");
const re = /export const APP_VERSION = "(\d+)\.(\d+)\.(\d+)"/;
const match = src.match(re);
if (!match) {
  console.error(`Could not find APP_VERSION semver in ${versionFile}`);
  process.exit(1);
}

const major = Number(match[1]);
const minor = Number(match[2]);
const patch = Number(match[3]) + 1;
const next = `${major}.${minor}.${patch}`;

const nextSrc = src.replace(re, `export const APP_VERSION = "${next}"`);
fs.writeFileSync(versionFile, nextSrc, "utf8");

execSync(`git add shared/appVersion.ts`, { stdio: "inherit" });
execSync(`git commit -m "Bump version ${next}"`, { stdio: "inherit" });
execSync(`git tag "release/${next}"`, { stdio: "inherit" });

console.log(`Bumped to ${next}, committed, tagged release/${next}`);
