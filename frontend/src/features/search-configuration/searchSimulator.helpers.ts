import { SIMULATOR_STAGES } from "@/features/search-configuration/searchSimulator.constants";
import type { SearchDebugResponse, SearchFilters } from "@/lib/contracts";

export function prettyJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

export function formatList(values: string[]) {
  return values.length ? values.join(", ") : "none";
}

export function formatFilterValue(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return "none";
  }
  return String(value);
}

export function formatSubscoreLabel(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function topReasons(subscores: Record<string, number>) {
  return Object.entries(subscores)
    .filter(([, value]) => value > 0)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 3);
}

export function stageStatus(index: number, activeStage: number, completedCount: number, loading: boolean) {
  if (loading) {
    if (index === activeStage) {
      return "active";
    }
    if (index < activeStage) {
      return "complete";
    }
    return "pending";
  }

  if (completedCount > index) {
    return "complete";
  }

  return "pending";
}

export function hasSearchSimulatorInput(query: string, filters: SearchFilters) {
  return Boolean(
    query.trim() ||
      filters.seniority ||
      (filters.minYearsExperience ?? 0) > 0 ||
      filters.location?.trim() ||
      filters.skills?.length ||
      filters.companies?.length,
  );
}

export function buildStageNarrative(response: SearchDebugResponse | null) {
  if (!response) {
    return SIMULATOR_STAGES.map((stage) => stage.description);
  }

  return [
    `Scope: ${response.request.tenantIds.length ? `${response.request.tenantIds.length} workspace(s)` : "all visible workspaces"} · Filters: ${
      response.analysis.engine.strictFilters.length ? response.analysis.engine.strictFilters.join(", ") : "none"
    }`,
    `Intent source: ${response.analysis.intentSource}. Resolved role=${response.analysis.resolvedIntent.role ?? "none"}, seniority=${
      response.analysis.resolvedIntent.seniority ?? "none"
    }, skills=${response.analysis.resolvedIntent.skills.length ? response.analysis.resolvedIntent.skills.join(", ") : "none"}, companies=${
      response.analysis.resolvedIntent.companies.length ? response.analysis.resolvedIntent.companies.join(", ") : "none"
    }`,
    `Embedding provider: ${response.analysis.embedding.provider} · version=${response.analysis.embedding.version ?? "n/a"} · dimensions=${
      response.analysis.embedding.dimensions
    }`,
    `Lexical=${response.analysis.engine.usesLexical ? "on" : "off"} · Semantic=${
      response.analysis.engine.usesSemantic ? "on" : "off"
    } · Returned ${response.meta.count} result(s)`,
    `Rank version ${response.meta.rankVersion}. Name boost=${response.analysis.engine.usesNameBoost ? "on" : "off"}`,
  ];
}

export function buildResolvedIntentSummary(response: SearchDebugResponse) {
  return [
    response.analysis.resolvedIntent.role ? `role ${response.analysis.resolvedIntent.role}` : null,
    response.analysis.resolvedIntent.seniority ? `seniority ${response.analysis.resolvedIntent.seniority}` : null,
    response.analysis.resolvedIntent.minYearsExperience !== null ? `min ${response.analysis.resolvedIntent.minYearsExperience}+ years` : null,
    response.analysis.resolvedIntent.location ? `location ${response.analysis.resolvedIntent.location}` : null,
    response.analysis.resolvedIntent.skills.length ? `skills ${response.analysis.resolvedIntent.skills.join(", ")}` : null,
    response.analysis.resolvedIntent.companies.length ? `companies ${response.analysis.resolvedIntent.companies.join(", ")}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function buildEmbeddingLabel(response: SearchDebugResponse | null) {
  return response ? `${response.analysis.embedding.provider} · ${response.analysis.embedding.dimensions} dims` : "Not run yet";
}
