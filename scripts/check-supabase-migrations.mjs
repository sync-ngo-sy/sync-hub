import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = path.join(repoRoot, "supabase", "migrations");
const filenamePattern = /^(?<timestamp>\d{14})_[a-z0-9_]+\.sql$/;
const failures = [];

function fail(message) {
  failures.push(message);
}

if (!fs.existsSync(migrationsDir)) {
  fail("supabase/migrations does not exist");
} else {
  const files = fs.readdirSync(migrationsDir).filter((name) => name.endsWith(".sql")).sort();
  const seenTimestamps = new Map();

  if (!files.length) {
    fail("supabase/migrations contains no SQL migrations");
  }

  for (const filename of files) {
    const fullPath = path.join(migrationsDir, filename);
    const relativePath = path.relative(repoRoot, fullPath);
    const match = filename.match(filenamePattern);

    if (!match?.groups) {
      fail(`${relativePath}: filename must match YYYYMMDDHHMMSS_descriptive_name.sql`);
      continue;
    }

    const timestamp = match.groups.timestamp;
    if (seenTimestamps.has(timestamp)) {
      fail(`${relativePath}: duplicate migration timestamp also used by ${seenTimestamps.get(timestamp)}`);
    }
    seenTimestamps.set(timestamp, relativePath);

    const content = fs.readFileSync(fullPath, "utf8");
    if (!content.trim()) {
      fail(`${relativePath}: migration is empty`);
    }

    const destructiveContent = content.replace(/\bdrop\s+table\s+if\s+exists\s+pg_temp\.[a-z0-9_]+\s*;?/gi, "");
    if (/\b(drop\s+table|drop\s+schema)\b/i.test(destructiveContent) && !content.includes("migration-allow-destructive")) {
      fail(`${relativePath}: destructive DROP requires an inline migration-allow-destructive justification`);
    }

    if (/\btodo\b|\bfixme\b/i.test(content)) {
      fail(`${relativePath}: remove TODO/FIXME comments before committing migrations`);
    }
  }
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("Supabase migration check passed.");
