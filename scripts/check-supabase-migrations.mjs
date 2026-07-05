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

    // Only enforce strict security rules on new migrations (timestamp > 20260703000000)
    // to avoid breaking CI for old, immutable migrations. The dynamic test will catch overall DB state issues.
    if (parseInt(timestamp, 10) > 20260703000000) {
      // Remove SQL comments for analysis
      const noCommentsContent = content.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

      // Security Rule 1: CREATE VIEW must use security_invoker = true
      const createViewRegex = /\bcreate\s+(or\s+replace\s+)?view\s+[a-z0-9_.]+\b/gi;
      let matchView;
      while ((matchView = createViewRegex.exec(noCommentsContent)) !== null) {
        if (!/\bsecurity_invoker\s*=\s*true\b/i.test(noCommentsContent)) {
          fail(`${relativePath}: CREATE VIEW must include 'WITH (security_invoker = true)' to prevent RLS bypass`);
          break;
        }
      }

      // Security Rule 2: CREATE FUNCTION must NOT use SECURITY DEFINER unless justified
      if (/\bsecurity\s+definer\b/i.test(noCommentsContent) && !content.includes("security-definer-justification")) {
        fail(`${relativePath}: SECURITY DEFINER is banned. Use SECURITY INVOKER or add 'security-definer-justification' comment`);
      }

      // Security Rule 3: CREATE TABLE must have RLS enabled
      const createTableRegex = /\bcreate\s+table\s+(if\s+not\s+exists\s+)?([a-z0-9_.]+)/gi;
      let matchTable;
      while ((matchTable = createTableRegex.exec(noCommentsContent)) !== null) {
        const tableName = matchTable[2];
        const rlsRegex = new RegExp(`alter\\s+table\\s+${tableName}\\s+enable\\s+row\\s+level\\s+security`, 'i');
        if (!rlsRegex.test(noCommentsContent)) {
          if (tableName.startsWith('public.') || !tableName.includes('.')) {
            fail(`${relativePath}: Table ${tableName} is missing 'ALTER TABLE ... ENABLE ROW LEVEL SECURITY'`);
          }
        }
      }

      // Security Rule 4: No GRANT ALL TO anon
      if (/\bgrant\s+all\b.*?\bto\s+anon\b/i.test(noCommentsContent)) {
        fail(`${relativePath}: GRANT ALL TO anon is strictly forbidden.`);
      }
    }
  }
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("Supabase migration check passed.");
