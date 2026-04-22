#!/usr/bin/env node
/**
 * Bumps APP_VERSION patch in shared/appVersion.js, commits, and tags release/x.y.z.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const versionFile = path.join(root, "shared", "appVersion.js");

process.chdir(root);

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

execSync(`git add shared/appVersion.js`, { stdio: "inherit" });
execSync(`git commit -m "Bump version ${next}"`, { stdio: "inherit" });
execSync(`git tag "release/${next}"`, { stdio: "inherit" });

console.log(`Bumped to ${next}, committed, tagged release/${next}`);
