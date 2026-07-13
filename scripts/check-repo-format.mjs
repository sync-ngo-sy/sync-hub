import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const targets = process.argv.slice(2).map((target) => path.resolve(process.cwd(), target));
const roots = targets.length ? targets : [repoRoot];

const SKIP_DIRS = new Set([
  ".git",
  ".mypy_cache",
  ".omo",
  ".pytest_cache",
  ".ruff_cache",
  ".supabase",
  ".temp",
  ".terraform",
  ".tools",
  ".venv",
  "build",
  "coverage",
  "dist",
  "htmlcov",
  "node_modules",
  "tmp",
  "venv",
]);

const TEXT_EXTENSIONS = new Set([
  ".css",
  ".dockerignore",
  ".env.example",
  ".gitignore",
  ".html",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".mjs",
  ".py",
  ".sql",
  ".svg",
  ".toml",
  ".ts",
  ".tsx",
  ".tf",
  ".txt",
  ".yaml",
  ".yml",
]);

const TEXT_FILENAMES = new Set([
  ".editorconfig",
  ".gcloudignore",
  ".pre-commit-config.yaml",
  "CODEOWNERS",
  "Dockerfile",
  "Makefile",
]);

function isTextFile(filePath) {
  const basename = path.basename(filePath);
  return TEXT_FILENAMES.has(basename) || TEXT_EXTENSIONS.has(path.extname(filePath));
}

function* walk(entryPath) {
  const stat = fs.statSync(entryPath);
  if (stat.isDirectory()) {
    const basename = path.basename(entryPath);
    if (SKIP_DIRS.has(basename) || basename.endsWith(".egg-info")) {
      return;
    }

    for (const child of fs.readdirSync(entryPath).sort()) {
      yield* walk(path.join(entryPath, child));
    }
    return;
  }

  if (stat.isFile() && isTextFile(entryPath)) {
    yield entryPath;
  }
}

function relative(filePath) {
  return path.relative(repoRoot, filePath) || ".";
}

const failures = [];

for (const root of roots) {
  if (!fs.existsSync(root)) {
    failures.push(`${root}: path does not exist`);
    continue;
  }

  for (const filePath of walk(root)) {
    const content = fs.readFileSync(filePath, "utf8");
    const label = relative(filePath);

    if (content.includes("\r\n")) {
      failures.push(`${label}: contains CRLF line endings`);
    }

    if (content.length > 0 && !content.endsWith("\n")) {
      failures.push(`${label}: missing final newline`);
    }

    const lines = content.split(/\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (/[ \t]$/.test(line)) {
        failures.push(`${label}:${index + 1}: trailing whitespace`);
      }
    }

    if (path.extname(filePath) === ".json") {
      try {
        JSON.parse(content);
      } catch (error) {
        failures.push(`${label}: invalid JSON (${error.message})`);
      }
    }
  }
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("Repository format check passed.");
