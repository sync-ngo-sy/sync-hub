// One-off / dev utility: recompute candidates.family_scores for a tenant
// OUTSIDE the edge runtime (the local supabase-edge-runtime hits WORKER_LIMIT
// on large pools, e.g. 1,795 candidates). Reuses the exact same ranking
// engine as the `rank` edge function.
//
// Usage (Node >= 22.7, run from repo root):
//   node scripts/recompute_family_scores.ts <tenant_id> [supabase_url] [service_role_key]
// Defaults target the local stack.

import {
  DEFAULT_RANKING_FORMULA,
} from "../supabase/functions/_shared/ranking/defaults.ts";
import {
  evaluateFormula,
  normalizeFormula,
} from "../supabase/functions/_shared/ranking/engine.ts";
import {
  buildCandidateFacts,
  type RankCandidateRow,
} from "../supabase/functions/_shared/ranking/facts.ts";
import { JOB_FAMILIES } from "../supabase/functions/_shared/ranking/families.ts";
import type { RankingFormula } from "../supabase/functions/_shared/ranking/types.ts";

const tenantId = process.argv[2];
if (!tenantId) {
  console.error("usage: node scripts/recompute_family_scores.ts <tenant_id> [url] [service_key]");
  process.exit(1);
}
const URL_BASE = process.argv[3] ?? "http://127.0.0.1:54321";
const KEY = process.argv[4] ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const HEADERS = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  "Content-Type": "application/json",
};

const DOSSIER_COLUMNS =
  "tenant_id,candidate_id,name,current_title,location,years_experience,seniority,primary_role,top_skills,profile_json,timeline_json,summary_short";
const PAGE = 1000;

async function rest(path: string, init?: RequestInit) {
  const res = await fetch(`${URL_BASE}/rest/v1/${path}`, {
    ...init,
    headers: { ...HEADERS, ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}: ${await res.text()}`);
  }
  return res;
}

async function loadActiveFormula(): Promise<
  { formula: RankingFormula; syrianCompanies: string[]; formulaVersion: string; usingDefault: boolean }
> {
  const res = await rest(
    `ranking_profiles?tenant_id=eq.${tenantId}&status=eq.active&select=formula_json,version&order=updated_at.desc&limit=1`,
  );
  const rows = await res.json() as Array<{ formula_json: unknown; version: string }>;
  if (rows.length) {
    const raw = rows[0].formula_json as Record<string, unknown>;
    const formula = normalizeFormula(raw as unknown as RankingFormula);
    const syrianCompanies = Array.isArray(raw?.syrianCompanies)
      ? (raw.syrianCompanies as string[])
      : [];
    return { formula, syrianCompanies, formulaVersion: rows[0].version, usingDefault: false };
  }
  return {
    formula: DEFAULT_RANKING_FORMULA,
    syrianCompanies: [],
    formulaVersion: DEFAULT_RANKING_FORMULA.version,
    usingDefault: true,
  };
}

async function fetchPool(): Promise<RankCandidateRow[]> {
  const rows: RankCandidateRow[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const res = await rest(
      `candidate_dossier_v1?tenant_id=eq.${tenantId}&select=${DOSSIER_COLUMNS}&order=years_experience.desc.nullslast&limit=${PAGE}&offset=${offset}`,
    );
    const page = await res.json() as RankCandidateRow[];
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  return rows;
}

function computeFamilyScores(
  row: RankCandidateRow,
  formula: RankingFormula,
  syrianCompanies: string[],
) {
  const families: Record<string, unknown> = {};
  for (const family of JOB_FAMILIES) {
    const facts = buildCandidateFacts(
      row,
      { jobFamily: family.key, positionTitle: null },
      syrianCompanies,
    );
    const result = evaluateFormula(facts, formula);
    families[family.key] = {
      total: result.total,
      max: result.maxTotal,
      percent: result.percent,
      relevant: (facts.signals.same_target_position ?? 0) > 0 ||
        (facts.signals.neighbour_position_count ?? 0) > 0,
    };
  }
  return families;
}

const { formula, syrianCompanies, formulaVersion, usingDefault } = await loadActiveFormula();
console.log(`formula: ${formulaVersion} (default: ${usingDefault})`);
const pool = await fetchPool();
console.log(`pool: ${pool.length} candidates`);
const computedAt = new Date().toISOString();

let updated = 0;
const failures: string[] = [];
const CHUNK = 25;
for (let i = 0; i < pool.length; i += CHUNK) {
  const chunk = pool.slice(i, i + CHUNK);
  await Promise.all(chunk.map(async (row) => {
    try {
      const families = computeFamilyScores(row, formula, syrianCompanies);
      await rest(
        `candidates?id=eq.${row.candidate_id}&tenant_id=eq.${tenantId}`,
        {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({
            family_scores: {
              computed_at: computedAt,
              formula_version: formulaVersion,
              families,
            },
            family_scores_updated_at: computedAt,
          }),
        },
      );
      updated += 1;
    } catch (err) {
      failures.push(`${row.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }));
  if ((i / CHUNK) % 10 === 0) {
    console.log(`  ${Math.min(i + CHUNK, pool.length)}/${pool.length}`);
  }
}

console.log(`updated: ${updated}/${pool.length}`);
if (failures.length) {
  console.log(`failures (${failures.length}):`);
  for (const f of failures.slice(0, 10)) console.log("  -", f);
  process.exit(2);
}
