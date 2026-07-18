import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { createAuthedClient } from "../_shared/client.ts";
import { type DossierRow } from "./types.ts";
import { normalizeTextSet } from "./helpers.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { error: "method_not_allowed" });
  }

  try {
    const body = await req.json();
    const candidateIds = body.candidate_ids ?? [];

    if (!Array.isArray(candidateIds) || candidateIds.length < 2) {
      return jsonResponse(400, {
        error: "candidate_ids must contain at least two ids",
      });
    }

    const queryFingerprint = `${(body.q ?? "").trim().toLowerCase()}|${
      candidateIds.slice().sort().join("|")
    }`;
    const supabase = createAuthedClient(req);

    const artifactLookup = await supabase
      .from("comparison_artifacts")
      .select("artifact_key, comparison_json, artifact_version")
      .eq("query_fingerprint", queryFingerprint)
      .contains("candidate_ids", candidateIds)
      .limit(1)
      .maybeSingle();

    if (artifactLookup.data?.comparison_json) {
      return jsonResponse(200, {
        source: "cached_artifact",
        artifact_key: artifactLookup.data.artifact_key,
        artifact_version: artifactLookup.data.artifact_version,
        comparison: artifactLookup.data.comparison_json,
      });
    }

    const dossiers = await supabase
      .from("candidate_dossier_v1")
      .select(
        "tenant_id, candidate_id, name, current_title, years_experience, seniority, top_skills, short_summary, long_summary, strengths, risks, recommended_roles",
      )
      .in("candidate_id", candidateIds);

    if (dossiers.error) {
      return jsonResponse(400, {
        error: "compare_failed",
        details: dossiers.error.message,
      });
    }

    const rows = (dossiers.data ?? []) as DossierRow[];
    const overlap = rows.reduce<string[]>((memo, row, index) => {
      const skills = (row.top_skills ?? []).map((skill) => skill.toLowerCase());
      if (index === 0) {
        return skills;
      }
      return memo.filter((skill) => skills.includes(skill));
    }, []);

    const items = rows
      .map((row) => {
        const roleTerms = normalizeTextSet(row.recommended_roles);
        const matchedSkills = (row.top_skills ?? []).filter((skill) =>
          overlap.includes(skill.toLowerCase())
        );
        const score = Number(
          (
            Number(row.years_experience ?? 0) +
            matchedSkills.length * 0.4 +
            roleTerms.size * 0.25
          ).toFixed(3),
        );
        return {
          tenant_id: row.tenant_id,
          candidate_id: row.candidate_id,
          name: row.name,
          current_title: row.current_title,
          years_experience: row.years_experience,
          seniority: row.seniority,
          score,
          matched_skills: matchedSkills,
          gaps: (body.required_skills ?? []).filter(
            (skill: string) =>
              !normalizeTextSet(row.top_skills).has(skill.toLowerCase()),
          ),
          strengths: row.strengths ?? [],
          risks: row.risks ?? [],
          summary: row.short_summary ?? row.long_summary ?? "",
        };
      })
      .sort((left, right) => right.score - left.score);

    return jsonResponse(200, {
      source: "deterministic_fallback",
      overlap,
      recommended_candidate_id: items[0]?.candidate_id ?? null,
      items,
      meta: {
        compared_count: items.length,
      },
    });
  } catch (error) {
    return jsonResponse(500, {
      error: "unexpected_error",
      details: `${error}`,
    });
  }
});
