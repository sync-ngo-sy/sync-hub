#!/usr/bin/env node
/**
 * Build + upload to cPanel in one step (local manual deploy, no GitHub secrets).
 *
 * 1. Runs scripts/build-cpanel-deploy.mjs
 * 2. Runs scripts/upload-cpanel-deploy.mjs
 *
 * Usage:
 *   node scripts/publish-cpanel-local.mjs --install
 *
 * Windows:
 *   .\scripts\publish-cpanel-local.ps1 -Install
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoDir = path.resolve(scriptDir, "..");

function parseArgs(argv) {
  return {
    install: argv.includes("--install") || argv.includes("-i"),
    dryRun: argv.includes("--dry-run"),
    help: argv.includes("--help") || argv.includes("-h"),
  };
}

function printHelp() {
  console.log(`Build and upload frontend to cPanel (local)

Usage:
  node scripts/publish-cpanel-local.mjs [--install] [--dry-run]

Needs:
  .env           — VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, ...
  .env.local     — CPANEL_FTP_SERVER, CPANEL_FTP_USERNAME, CPANEL_FTP_PASSWORD
`);
}

function runNodeScript(relativeScript, extraArgs = []) {
  const scriptPath = path.join(repoDir, relativeScript);
  const result = spawnSync(process.execPath, [scriptPath, ...extraArgs], {
    stdio: "inherit",
    cwd: repoDir,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const sharedArgs = [];
  if (args.install) {
    sharedArgs.push("--install");
  }

  console.log("Step 1/2 — production build\n");
  runNodeScript("scripts/build-cpanel-deploy.mjs", sharedArgs);

  console.log("\nStep 2/2 — FTPS upload\n");
  const uploadArgs = [...sharedArgs];
  if (args.dryRun) {
    uploadArgs.push("--dry-run");
  }
  runNodeScript("scripts/upload-cpanel-deploy.mjs", uploadArgs);
}

main();
