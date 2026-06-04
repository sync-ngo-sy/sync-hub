#!/usr/bin/env node
/**
 * Production frontend build for manual cPanel upload.
 *
 * Reads public VITE_* values from repo-root .env (then .env.local overrides),
 * runs the frontend build, and copies output to deploy/cpanel/ (ready to FTP).
 *
 * Usage (from repo root):
 *   node scripts/build-cpanel-deploy.mjs
 *   node scripts/build-cpanel-deploy.mjs --install
 *
 * Windows:
 *   .\scripts\build-cpanel-deploy.ps1
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoDir = path.resolve(scriptDir, "..");
const frontendDir = path.join(repoDir, "frontend");
const sourceDistDir = path.join(frontendDir, "dist");
const outputDir = path.join(repoDir, "deploy", "cpanel");

const VITE_KEYS = [
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_ANON_KEY",
  "VITE_API_BASE_URL",
  "VITE_SITE_URL",
  "VITE_MANATAL_APP_BASE_URL",
];

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

function loadDeployEnv() {
  return {
    ...readEnvFile(path.join(repoDir, ".env")),
    ...readEnvFile(path.join(repoDir, ".env.local")),
    ...readEnvFile(path.join(frontendDir, ".env.local")),
  };
}

function isPlaceholder(value) {
  return (
    !value ||
    value.includes("your-project") ||
    value.startsWith("your-") ||
    value === "your-supabase-anon-key"
  );
}

function parseArgs(argv) {
  return {
    install: argv.includes("--install") || argv.includes("-i"),
    help: argv.includes("--help") || argv.includes("-h"),
  };
}

function printHelp() {
  console.log(`Manual cPanel deployment build

Usage:
  node scripts/build-cpanel-deploy.mjs [--install]

Options:
  --install, -i   Run "npm ci" in frontend/ before build (default: skip if node_modules exists)
  --help, -h      Show this help

Requires repo-root .env with at least:
  VITE_SUPABASE_URL
  VITE_SUPABASE_ANON_KEY

Output:
  deploy/cpanel/   Upload everything in this folder to cPanel (e.g. public_html/jobs/)
`);
}

function resolveViteEnv(fileEnv) {
  const env = {};
  for (const key of VITE_KEYS) {
    const fromFile = fileEnv[key]?.trim();
    if (fromFile) {
      env[key] = fromFile;
    }
  }

  if (!env.VITE_API_BASE_URL && env.VITE_SUPABASE_URL) {
    env.VITE_API_BASE_URL = `${env.VITE_SUPABASE_URL.replace(/\/+$/, "")}/functions/v1`;
  }

  const required = ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"];
  const missing = required.filter((key) => isPlaceholder(env[key]));
  if (missing.length > 0) {
    throw new Error(
      `Missing or placeholder values in .env: ${missing.join(", ")}\n` +
        `Set production VITE_* values in ${path.join(repoDir, ".env")} and re-run.`,
    );
  }

  for (const [key, value] of Object.entries(env)) {
    if (key.startsWith("VITE_") && /127\.0\.0\.1|localhost|trycloudflare\.com/i.test(value)) {
      console.warn(`Warning: ${key} looks like a non-production URL: ${value}`);
    }
  }

  return env;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    cwd: options.cwd,
    env: options.env,
    shell: process.platform === "win32",
  });

  if (result.status !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(" ")}`);
  }
}

function emptyDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

function copyDir(source, destination) {
  fs.mkdirSync(destination, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name);
    const to = path.join(destination, entry.name);
    if (entry.isDirectory()) {
      copyDir(from, to);
    } else {
      fs.copyFileSync(from, to);
    }
  }
}

function writeDeployReadme(viteEnv) {
  const lines = [
    "CV Intelligence — manual cPanel upload bundle",
    `Built: ${new Date().toISOString()}`,
    "",
    "Upload ALL files in this folder to your cPanel jobs site root, for example:",
    "  public_html/jobs/   (FTP account subscription@sync.ngo)",
    "",
    "Do not upload worker secrets, .env, or Supabase service-role keys.",
    "",
    "Configured public endpoints:",
    `  VITE_SUPABASE_URL=${viteEnv.VITE_SUPABASE_URL ?? ""}`,
    `  VITE_API_BASE_URL=${viteEnv.VITE_API_BASE_URL ?? ""}`,
    `  VITE_SITE_URL=${viteEnv.VITE_SITE_URL ?? "(not set)"}`,
    "",
    "After upload, verify https://jobs.sync.ngo loads and sign-in works.",
  ];
  fs.writeFileSync(path.join(outputDir, "UPLOAD_README.txt"), `${lines.join("\n")}\n`, "utf8");
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const fileEnv = loadDeployEnv();
  const viteEnv = resolveViteEnv(fileEnv);

  const nodeModules = path.join(frontendDir, "node_modules");
  const shouldInstall = args.install || !fs.existsSync(nodeModules);

  console.log("Building frontend for manual cPanel deploy...\n");

  if (shouldInstall) {
    console.log("→ npm ci (frontend/)");
    run("npm", ["ci"], { cwd: frontendDir });
  }

  const buildEnv = {
    ...process.env,
    ...viteEnv,
    NODE_ENV: "production",
  };

  console.log("→ npm run build (frontend/)");
  run("npm", ["run", "build"], { cwd: frontendDir, env: buildEnv });

  if (!fs.existsSync(sourceDistDir)) {
    throw new Error(`Build did not produce ${sourceDistDir}`);
  }

  console.log(`\n→ Copying ${sourceDistDir} → ${outputDir}`);
  emptyDir(outputDir);
  copyDir(sourceDistDir, outputDir);
  writeDeployReadme(viteEnv);

  console.log("\nDone.\n");
  console.log(`Upload folder: ${outputDir}`);
  console.log("Next steps:");
  console.log("  1. Open cPanel File Manager or FTP (subscription@sync.ngo → jobs folder)");
  console.log("  2. Upload everything inside deploy/cpanel/ (including index.html)");
  console.log("  3. Smoke-test https://jobs.sync.ngo");
  console.log("\nLater: add the same VITE_* values as GitHub secrets for .github/workflows/deploy-cpanel.yml");
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
