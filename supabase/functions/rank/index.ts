// SCRUM-20 Profiles Ranking edge function.
//
// Actions:
//   formula_get     – load the tenant's active formula + drafts, the built-in
//                     default, the signal catalog, and the job-family list.
//   formula_save    – upsert a formula (admin only via RLS), optionally activate.
//   formula_publish – activate an existing formula version.
//   target_options  – job families + job postings to rank candidates against.
//   rank_profiles   – score the candidate pool against a target and return a
//                     ranked list with a full per-criterion breakdown.
//   scores_recompute – compute the score for every job family for every
//                     candidate in a tenant and persist it on the candidate
//                     record (candidates.family_scores). Also runs
//                     automatically after a formula is published/activated.

import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { createAuthedClient } from "../_shared/client.ts";
import {
  DEFAULT_RANKING_FORMULA,
  SIGNAL_CATALOG,
} from "../_shared/ranking/defaults.ts";
import { evaluateFormula, normalizeFormula } from "../_shared/ranking/engine.ts";
import {
  buildCandidateFacts,
  type RankCandidateRow,
} from "../_shared/ranking/facts.ts";
import {
  classifyFamily,
  JOB_FAMILIES,
  jobFamilyLabel,
} from "../_shared/ranking/families.ts";
import type { RankingFormula, RankingTarget } from "../_shared/ranking/types.ts";

type JsonRecord = Record<string, unknown>;
type AuthedClient = ReturnType<typeof createAuthedClient>;

const CANDIDATE_POOL_LIMIT = 3000;
const PAGE = 1000;

const DOSSIER_COLUMNS =
  "tenant_id, candidate_id, name, current_title, location, years_experience, seniority, primary_role, top_skills, profile_json, timeline_json, summary_short";

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? Array.from(
      new Set(
        value
          .map((item) => (typeof item === "string" ? item.trim() : ""))
          .filter(Boolean),
      ),
    )
    : [];
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function asInteger(value: unknown, fallback: number, min: number, max: number) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

function describeError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function familyOptions() {
  return JOB_FAMILIES.map((family) => ({
    key: family.key,
    label: family.label,
  }));
}

type StoredProfile = {
  id: string;
  name: string;
  description: string;
  status: string;
  version: string;
  formula: RankingFormula;
  syrianCompanies: string[];
  updatedAt: string | null;
};

function mapProfileRow(row: JsonRecord): StoredProfile {
  const formulaJson = asRecord(row.formula_json);
  return {
    id: String(row.id ?? ""),
    name: asString(row.name) ?? "Ranking formula",
    description: asString(row.description) ?? "",
    status: asString(row.status) ?? "draft",
    version: asString(row.version) ?? "v1",
    formula: normalizeFormula(formulaJson),
    syrianCompanies: asStringArray(formulaJson.syrianCompanies),
    updatedAt: asString(row.updated_at),
  };
}

async function loadProfiles(supabase: AuthedClient, tenantId: string) {
  const { data, error } = await supabase
    .from("ranking_profiles")
    .select("id, tenant_id, name, description, status, version, formula_json, updated_at")
    .eq("tenant_id", tenantId)
    .order("status", { ascending: true })
    .order("updated_at", { ascending: false });
  if (error) {
    throw error;
  }
  return (data ?? []).map((row) => mapProfileRow(row as JsonRecord));
}

function pickActive(profiles: StoredProfile[]): StoredProfile | null {
  return profiles.find((profile) => profile.status === "active") ??
    profiles[0] ?? null;
}

async function getFormula(supabase: AuthedClient, body: JsonRecord) {
  const tenantId = asString(body.tenant_id);
  if (!tenantId) {
    throw new Error("tenant_id is required");
  }
  const profiles = await loadProfiles(supabase, tenantId);
  const active = pickActive(profiles);
  return {
    profiles,
    active,
    usingDefault: !active,
    default: DEFAULT_RANKING_FORMULA,
    signals: SIGNAL_CATALOG,
    families: familyOptions(),
  };
}

async function saveFormula(supabase: AuthedClient, body: JsonRecord) {
  const tenantId = asString(body.tenant_id);
  if (!tenantId) {
    throw new Error("tenant_id is required");
  }
  const profile = asRecord(body.profile);
  const normalized = normalizeFormula(profile.formula);
  const syrianCompanies = asStringArray(profile.syrianCompanies);
  const formulaJson = {
    version: normalized.version,
    criteria: normalized.criteria,
    syrianCompanies,
  };

  const profileId = asString(profile.id);
  let savedId = profileId;

  if (profileId) {
    const { data, error } = await supabase
      .from("ranking_profiles")
      .update({
        name: asString(profile.name) ?? "Ranking formula",
        description: asString(profile.description) ?? "",
        formula_json: formulaJson,
      })
      .eq("id", profileId)
      .eq("tenant_id", tenantId)
      .select("id")
      .maybeSingle();
    if (error) {
      throw error;
    }
    savedId = data?.id ? String(data.id) : profileId;
  } else {
    const { data, error } = await supabase
      .from("ranking_profiles")
      .insert({
        tenant_id: tenantId,
        name: asString(profile.name) ?? "Ranking formula",
        description: asString(profile.description) ?? "",
        status: "active",
        version: asString(profile.version) ?? "v1",
        formula_json: formulaJson,
      })
      .select("id")
      .single();
    if (error) {
      throw error;
    }
    savedId = String(data.id);
  }

  if (body.activate && savedId) {
    const { error } = await supabase.rpc("publish_ranking_profile_v1", {
      p_profile_id: savedId,
    });
    if (error) {
      throw error;
    }
    // Keep the persisted per-family scores in sync with the new formula.
    await recomputeScores(supabase, { tenant_id: tenantId });
  }

  return getFormula(supabase, { tenant_id: tenantId });
}

async function publishFormula(supabase: AuthedClient, body: JsonRecord) {
  const tenantId = asString(body.tenant_id);
  const profileId = asString(body.profile_id);
  if (!tenantId || !profileId) {
    throw new Error("tenant_id and profile_id are required");
  }
  const { error } = await supabase.rpc("publish_ranking_profile_v1", {
    p_profile_id: profileId,
  });
  if (error) {
    throw error;
  }
  // Keep the persisted per-family scores in sync with the new formula.
  await recomputeScores(supabase, { tenant_id: tenantId });
  return getFormula(supabase, { tenant_id: tenantId });
}

async function loadActiveFormula(supabase: AuthedClient, tenantId: string | null) {
  if (tenantId) {
    const profiles = await loadProfiles(supabase, tenantId);
    const active = pickActive(profiles);
    if (active) {
      return {
        formula: active.formula,
        syrianCompanies: active.syrianCompanies,
        formulaVersion: active.version,
        usingDefault: false,
      };
    }
  }
  return {
    formula: DEFAULT_RANKING_FORMULA,
    syrianCompanies: [] as string[],
    formulaVersion: DEFAULT_RANKING_FORMULA.version,
    usingDefault: true,
  };
}

/** Score one candidate against every job family with the given formula. */
function computeFamilyScores(
  row: RankCandidateRow,
  formula: RankingFormula,
  syrianCompanies: string[],
) {
  const families: JsonRecord = {};
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

async function recomputeScores(supabase: AuthedClient, body: JsonRecord) {
  const tenantId = asString(body.tenant_id);
  if (!tenantId) {
    throw new Error("tenant_id is required");
  }

  const { formula, syrianCompanies, formulaVersion, usingDefault } =
    await loadActiveFormula(supabase, tenantId);
  const pool = await fetchCandidatePool(supabase, [tenantId]);
  const computedAt = new Date().toISOString();

  let updated = 0;
  const failures: string[] = [];
  const CHUNK = 20;
  for (let i = 0; i < pool.length; i += CHUNK) {
    const chunk = pool.slice(i, i + CHUNK);
    await Promise.all(chunk.map(async (row) => {
      const families = computeFamilyScores(row, formula, syrianCompanies);
      const { error } = await supabase
        .from("candidates")
        .update({
          family_scores: {
            computed_at: computedAt,
            formula_version: formulaVersion,
            families,
          },
          family_scores_updated_at: computedAt,
        })
        .eq("id", row.candidate_id)
        .eq("tenant_id", tenantId);
      if (error) {
        failures.push(`${row.name}: ${error.message}`);
      } else {
        updated += 1;
      }
    }));
  }

  return {
    updated,
    poolSize: pool.length,
    formulaVersion,
    usingDefault,
    computedAt,
    failures,
  };
}

async function getTargetOptions(supabase: AuthedClient, tenantIds: string[]) {
  let jobs: Array<{ id: string; title: string; seniority: string | null }> = [];
  try {
    let query = supabase
      .from("job_postings")
      .select("id, title, seniority_level, status")
      .order("updated_at", { ascending: false })
      .limit(100);
    if (tenantIds.length) {
      query = query.in("tenant_id", tenantIds);
    }
    const { data, error } = await query;
    if (!error && Array.isArray(data)) {
      jobs = data
        .filter((row) => (asString((row as JsonRecord).status) ?? "active") !== "closed")
        .map((row) => {
          const record = row as JsonRecord;
          return {
            id: String(record.id ?? ""),
            title: asString(record.title) ?? "Untitled role",
            seniority: asString(record.seniority_level),
          };
        });
    }
  } catch {
    jobs = [];
  }
  return { families: familyOptions(), jobs };
}

async function fetchCandidatePool(supabase: AuthedClient, tenantIds: string[]) {
  const rows: RankCandidateRow[] = [];
  for (let offset = 0; offset < CANDIDATE_POOL_LIMIT; offset += PAGE) {
    let query = supabase
      .from("candidate_dossier_v1")
      .select(DOSSIER_COLUMNS)
      .order("years_experience", { ascending: false })
      .range(offset, offset + PAGE - 1);
    if (tenantIds.length) {
      query = query.in("tenant_id", tenantIds);
    }
    const { data, error } = await query;
    if (error) {
      throw error;
    }
    const page = (data ?? []) as unknown as RankCandidateRow[];
    rows.push(...page);
    if (page.length < PAGE) {
      break;
    }
  }
  return rows;
}

async function resolveTarget(
  supabase: AuthedClient,
  body: JsonRecord,
): Promise<RankingTarget & { label: string }> {
  const target = asRecord(body.target);
  const jobPostingId = asString(target.job_posting_id) ??
    asString(target.jobPostingId);
  let positionTitle = asString(target.position_title) ??
    asString(target.positionTitle);
  let jobFamily = asString(target.job_family) ?? asString(target.jobFamily);

  if (jobPostingId) {
    const { data } = await supabase
      .from("job_postings")
      .select("title")
      .eq("id", jobPostingId)
      .maybeSingle();
    const title = asString((data as JsonRecord | null)?.title);
    if (title) {
      positionTitle = title;
    }
  }

  if (!jobFamily && positionTitle) {
    jobFamily = classifyFamily(positionTitle, []);
  }

  const label = jobFamily
    ? jobFamilyLabel(jobFamily)
    : positionTitle ?? "All families";

  return { jobFamily, positionTitle, label };
}

async function rankProfiles(supabase: AuthedClient, body: JsonRecord) {
  const tenantIds = asStringArray(body.tenant_ids);
  const formulaTenantId = asString(body.tenant_id) ?? tenantIds[0] ?? null;
  const limit = asInteger(body.limit, 25, 1, 200);
  const offset = asInteger(body.offset, 0, 0, 100000);
  const filters = asRecord(body.filters);
  const filterQuery = (asString(filters.query) ?? "").toLowerCase();
  const filterSeniority = asString(filters.seniority);
  const filterFamily = asString(filters.job_family) ?? asString(filters.jobFamily);
  const minScore = asInteger(filters.min_score, 0, 0, 100);
  const relevantOnly = filters.relevant_only === true ||
    filters.relevant_only === "true";

  const { formula, syrianCompanies, formulaVersion, usingDefault } =
    await loadActiveFormula(supabase, formulaTenantId);

  const target = await resolveTarget(supabase, body);
  const pool = await fetchCandidatePool(supabase, tenantIds);

  const scored = pool.map((row) => {
    const facts = buildCandidateFacts(row, target, syrianCompanies);
    const result = evaluateFormula(facts, formula);
    const relevant = (facts.signals.same_target_position ?? 0) > 0 ||
      (facts.signals.neighbour_position_count ?? 0) > 0;
    return {
      relevant,
      candidateId: facts.candidateId,
      tenantId: facts.tenantId,
      name: facts.name,
      currentTitle: facts.currentTitle,
      location: facts.location,
      yearsExperience: facts.yearsExperience,
      seniority: facts.seniority,
      jobFamily: facts.jobFamily,
      jobFamilyLabel: jobFamilyLabel(facts.jobFamily),
      skills: facts.skills.slice(0, 12),
      recognitions: facts.recognitions,
      total: result.total,
      maxTotal: result.maxTotal,
      percent: result.percent,
      breakdown: result.criteria,
    };
  });

  const filtered = scored.filter((item) => {
    if (relevantOnly && !item.relevant) {
      return false;
    }
    if (minScore && item.percent < minScore) {
      return false;
    }
    if (filterSeniority && (item.seniority ?? "") !== filterSeniority) {
      return false;
    }
    if (filterFamily && item.jobFamily !== filterFamily) {
      return false;
    }
    if (filterQuery) {
      const haystack = `${item.name} ${item.currentTitle ?? ""}`.toLowerCase();
      if (!haystack.includes(filterQuery)) {
        return false;
      }
    }
    return true;
  });

  filtered.sort((left, right) =>
    right.total - left.total ||
    (right.yearsExperience ?? 0) - (left.yearsExperience ?? 0) ||
    left.name.localeCompare(right.name)
  );

  const items = filtered
    .slice(offset, offset + limit)
    .map((item, index) => ({ ...item, rank: offset + index + 1 }));

  return {
    items,
    total: filtered.length,
    poolSize: pool.length,
    limit,
    offset,
    target: {
      jobFamily: target.jobFamily,
      jobFamilyLabel: target.jobFamily ? jobFamilyLabel(target.jobFamily) : null,
      positionTitle: target.positionTitle,
      label: target.label,
    },
    formula: {
      version: formulaVersion,
      usingDefault,
      maxTotal: formula.criteria.reduce((sum, c) => sum + c.cap, 0),
      criteria: formula.criteria.map((c) => ({
        key: c.key,
        label: c.label,
        cap: c.cap,
      })),
    },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse(405, { error: "method_not_allowed" });
  }

  try {
    const body = (await req.json()) as JsonRecord;
    const action = asString(body.action);
    const supabase = createAuthedClient(req);

    switch (action) {
      case "formula_get":
        return jsonResponse(200, await getFormula(supabase, body));
      case "formula_save":
        return jsonResponse(200, await saveFormula(supabase, body));
      case "formula_publish":
        return jsonResponse(200, await publishFormula(supabase, body));
      case "target_options":
        return jsonResponse(
          200,
          await getTargetOptions(supabase, asStringArray(body.tenant_ids)),
        );
      case "rank_profiles":
        return jsonResponse(200, await rankProfiles(supabase, body));
      case "scores_recompute":
        return jsonResponse(200, await recomputeScores(supabase, body));
      default:
        return jsonResponse(400, { error: "unknown_action", details: action });
    }
  } catch (error) {
    const message = describeError(error);
    if (/permission denied|not_authorized|row-level security/i.test(message)) {
      return jsonResponse(403, { error: "forbidden", details: message });
    }
    return jsonResponse(500, { error: "unexpected_error", details: message });
  }
});
