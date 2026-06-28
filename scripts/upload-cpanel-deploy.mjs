#!/usr/bin/env node
/**
 * Upload deploy/cpanel/ to cPanel over FTPS (local manual deploy).
 *
 * Put FTP credentials in repo-root .env.local (never commit passwords):
 *   CPANEL_FTP_SERVER=sync.ngo
 *   CPANEL_FTP_USERNAME=subscription@sync.ngo
 *   CPANEL_FTP_PASSWORD=...
 *   CPANEL_FTP_SERVER_DIR=./
 *
 * Usage:
 *   node scripts/upload-cpanel-deploy.mjs
 *   node scripts/upload-cpanel-deploy.mjs --dry-run
 *
 * Windows:
 *   .\scripts\upload-cpanel-deploy.ps1
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoDir = path.resolve(scriptDir, "..");
const uploadDir = path.join(repoDir, "deploy", "cpanel");
const scriptsNodeModules = path.join(scriptDir, "node_modules");

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const values = {};
  for (const rawLine of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separator = line.indexOf("=");
    if (separator === -1) {
      continue;
    }

    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    value = value.replace(/^(['"])(.*)\1$/, "$2");
    values[key] = value;
  }
  return values;
}

function loadFtpEnv() {
  return {
    ...readEnvFile(path.join(repoDir, ".env")),
    ...readEnvFile(path.join(repoDir, ".env.local")),
    ...process.env,
  };
}

function parseArgs(argv) {
  return {
    dryRun: argv.includes("--dry-run"),
    help: argv.includes("--help") || argv.includes("-h"),
    install: argv.includes("--install") || argv.includes("-i"),
  };
}

function printHelp() {
  console.log(`Upload deploy/cpanel/ to cPanel (FTPS)

Usage:
  node scripts/upload-cpanel-deploy.mjs [--dry-run] [--install]

Requires deploy/cpanel/ (run build-cpanel-deploy first) and .env.local:
  CPANEL_FTP_SERVER
  CPANEL_FTP_USERNAME
  CPANEL_FTP_PASSWORD
  CPANEL_FTP_SERVER_DIR=./   (optional, default ./)
  CPANEL_FTP_PORT=21         (optional)
`);
}

function ensureFtpDependency(install) {
  const basicFtpPath = path.join(scriptsNodeModules, "basic-ftp");
  if (fs.existsSync(basicFtpPath)) {
    return;
  }

  if (!install) {
    throw new Error(
      "Missing scripts/node_modules/basic-ftp. Run:\n" +
        "  node scripts/upload-cpanel-deploy.mjs --install\n" +
        "  or: npm install --prefix scripts",
    );
  }

  console.log("→ npm install (scripts/)");
  run("npm", ["install", "--prefix", "scripts", "--no-fund", "--no-audit"], { cwd: repoDir });
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    cwd: options.cwd ?? repoDir,
    env: options.env ?? process.env,
    shell: process.platform === "win32",
  });

  if (result.status !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(" ")}`);
  }
}

function resolveFtpConfig(env) {
  const config = {
    host: env.CPANEL_FTP_SERVER?.trim() ?? "",
    user: env.CPANEL_FTP_USERNAME?.trim() ?? "",
    password: env.CPANEL_FTP_PASSWORD ?? "",
    remoteDir: env.CPANEL_FTP_SERVER_DIR?.trim() || "./",
    port: Number.parseInt(env.CPANEL_FTP_PORT?.trim() || "21", 10),
  };

  const missing = [];
  if (!config.host) missing.push("CPANEL_FTP_SERVER");
  if (!config.user) missing.push("CPANEL_FTP_USERNAME");
  if (!config.password) missing.push("CPANEL_FTP_PASSWORD");
  if (missing.length > 0) {
    throw new Error(
      `Missing FTP settings: ${missing.join(", ")}\n` +
        `Add them to ${path.join(repoDir, ".env.local")} (gitignored).`,
    );
  }

  return config;
}

function countFiles(dir) {
  let count = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      count += countFiles(path.join(dir, entry.name));
    } else {
      count += 1;
    }
  }
  return count;
}

async function uploadToCpanel(config) {
  const require = createRequire(path.join(scriptDir, "package.json"));
  const { Client } = require("basic-ftp");

  const client = new Client(60_000);
  client.ftp.verbose = false;

  try {
    console.log(`→ Connecting FTPS on port ${config.port}`);
    await client.access({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      secure: true,
    });

    const remoteDir = config.remoteDir.replace(/\\/g, "/");
    console.log(`→ Uploading ${uploadDir} (${countFiles(uploadDir)} files)`);
    await client.ensureDir(remoteDir);
    await client.uploadFromDir(uploadDir, remoteDir);
  } finally {
    client.close();
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  if (!fs.existsSync(uploadDir)) {
    throw new Error(
      `Upload folder not found: ${uploadDir}\nRun first: node scripts/build-cpanel-deploy.mjs`,
    );
  }

  if (!fs.existsSync(path.join(uploadDir, "index.html"))) {
    throw new Error(`${uploadDir} has no index.html. Run the build script first.`);
  }

  const env = loadFtpEnv();
  const config = resolveFtpConfig(env);
  const fileCount = countFiles(uploadDir);

  console.log(`Upload bundle: ${uploadDir} (${fileCount} files)\n`);

  if (args.dryRun) {
    console.log("Dry run — FTP credentials are configured; upload skipped.");
    console.log(`  local dir: ${uploadDir}`);
    console.log(`  files: ${fileCount}`);
    return;
  }

  ensureFtpDependency(args.install);
  await uploadToCpanel(config);

  console.log("\nDone. Check https://jobs.sync.ngo (or your VITE_SITE_URL).");
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
