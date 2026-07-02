#!/usr/bin/env node
/**
 * Zip deploy/cpanel/ for cPanel File Manager upload (Extract).
 *
 * Usage:
 *   node scripts/zip-cpanel-deploy.mjs
 *
 * Windows:
 *   .\scripts\zip-cpanel-deploy.ps1
 *
 * Output: deploy/cpanel.zip — upload in cPanel File Manager, open jobs folder, Extract.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoDir = path.resolve(scriptDir, "..");
const uploadDir = path.join(repoDir, "deploy", "cpanel");
const zipPath = path.join(repoDir, "deploy", "cpanel.zip");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    cwd: options.cwd ?? repoDir,
    shell: process.platform === "win32",
  });

  if (result.status !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(" ")}`);
  }
}

function main() {
  if (!fs.existsSync(uploadDir)) {
    throw new Error(
      `Upload folder not found: ${uploadDir}\nRun first: node scripts/build-cpanel-deploy.mjs`,
    );
  }

  if (!fs.existsSync(path.join(uploadDir, "index.html"))) {
    throw new Error(`${uploadDir} has no index.html. Run the build script first.`);
  }

  fs.mkdirSync(path.dirname(zipPath), { recursive: true });
  if (fs.existsSync(zipPath)) {
    fs.unlinkSync(zipPath);
  }

  console.log(`Creating ${zipPath} from ${uploadDir}...\n`);

  // Windows 10+ and Git Bash include tar with zip support (-a).
  run("tar", ["-a", "-cf", zipPath, "-C", uploadDir, "."]);

  const sizeKb = Math.round(fs.statSync(zipPath).size / 1024);
  console.log(`\nDone (${sizeKb} KB).\n`);
  console.log("cPanel File Manager:");
  console.log("  1. Open public_html/jobs/");
  console.log("  2. Upload deploy/cpanel.zip");
  console.log("  3. Select the zip → Extract");
  console.log("  4. Delete cpanel.zip from the server when done");
  console.log("\nOr use FTPS: .\\scripts\\upload-cpanel-deploy.ps1 -Install");
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
