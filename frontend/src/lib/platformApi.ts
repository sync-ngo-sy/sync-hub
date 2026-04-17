import type {
  AccessRoster,
  AnalyticsSnapshot,
  AskResponse,
  CandidateDetail,
  ComparisonResponse,
  DataConnector,
  IndexingWorkbench,
  SearchFilters,
  SearchResponse,
  SystemHealth,
} from "@/lib/contracts";
import {
  accessRoster,
  analyticsSnapshot,
  askCandidates,
  compareCandidates,
  dataConnectors,
  defaultCompareIds,
  defaultIntelligenceIds,
  getCandidate,
  indexingWorkbench,
  searchCandidates,
  systemHealth,
} from "@/data/mockData";
import { deriveSearchFilters } from "@/lib/queryIntent";
import { hasSupabaseConfig, supabase } from "@/lib/supabaseClient";

type JsonRecord = Record<string, unknown>;

type PlatformApi = {
  search: (query: string, filters: SearchFilters) => Promise<SearchResponse>;
  getCandidate: (candidateId: string) => Promise<CandidateDetail>;
  compare: (candidateIds: string[], requiredSkills?: string[]) => Promise<ComparisonResponse>;
  ask: (question: string, candidateIds: string[]) => Promise<AskResponse>;
  getAnalytics: () => Promise<AnalyticsSnapshot>;
  getSystemHealth: () => Promise<SystemHealth>;
  getDataConnectors: () => Promise<DataConnector[]>;
  getIndexingWorkbench: () => Promise<IndexingWorkbench>;
  getAccessRoster: () => Promise<AccessRoster>;
};

type CandidateDossierRow = {
  candidate_id: string;
  name: string;
  headline: string | null;
  current_title: string | null;
  location: string | null;
  years_experience: number | null;
  seniority: string | null;
  primary_role: string | null;
  top_skills: string[] | null;
  links: string[] | null;
  summary_short: string | null;
  short_summary: string | null;
  long_summary: string | null;
  strengths: unknown;
  risks: unknown;
  recommended_roles: unknown;
  timeline_json: unknown;
  profile_json: unknown;
  original_filename: string | null;
  mime_type: string | null;
  storage_path: string | null;
  source_uri: string | null;
  confidence: number | null;
};

type CandidateChunkRow = {
  id: string;
  chunk_type: string;
  text: string;
};

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function toStringArray(value: unknown): string[] {
  return asArray(value)
    .map((item) => String(item).trim())
    .filter(Boolean);
}

function toNumber(value: unknown, fallback = 0) {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : fallback;
}

function hueFromId(seed: string) {
  return seed.split("").reduce((memo, character) => memo + character.charCodeAt(0), 0) % 360;
}

function calibrateMatchScore(rawScore: unknown, subscores: JsonRecord) {
  const semantic = toNumber(subscores.semantic_similarity);
  const role = toNumber(subscores.role_match);
  const seniority = toNumber(subscores.seniority_match);
  const skill = toNumber(subscores.skill_match);
  const experience = toNumber(subscores.experience_match);
  const maxChunkRrf = toNumber(subscores.max_chunk_rrf);
  const avgTop3ChunkRrf = toNumber(subscores.avg_top3_chunk_rrf);
  const lexicalSignal = Math.max(
    Math.min(1, maxChunkRrf * 32),
    Math.min(1, avgTop3ChunkRrf * 40),
  );
  const retrievalSignal = Math.max(semantic, lexicalSignal);
  const calibrated = (0.42 * retrievalSignal) + (0.22 * role) + (0.12 * seniority) + (0.14 * skill) + (0.10 * experience);
  return Math.round(Math.max(0, Math.min(1, Math.max(toNumber(rawScore), calibrated))) * 100);
}

function mapEvidenceSnippet(payload: JsonRecord, fallbackIndex: number): CandidateDetail["evidence"][number] {
  return {
    id: String(payload.chunk_id ?? payload.id ?? `e-${fallbackIndex}`),
    chunkType: String(payload.chunk_type ?? payload.chunkType ?? "summary") as CandidateDetail["evidence"][number]["chunkType"],
    excerpt: String(payload.text ?? payload.excerpt ?? ""),
    relevance: Math.max(0, Math.min(1, toNumber(payload.semantic_similarity ?? payload.relevance ?? payload.lexical_score, 0.72))),
  };
}

async function invokeFunction<T>(name: string, body: JsonRecord): Promise<T> {
  if (!supabase) {
    throw new Error("Missing Supabase browser client configuration.");
  }

  const { data, error } = await supabase.functions.invoke(name, { body });

  if (error) {
    throw error;
  }

  return data as T;
}

function mapRemoteSearch(payload: JsonRecord): SearchResponse {
  const rawResults = asArray(payload.results);

  return {
    results: rawResults.map((row) => {
      const record = asRecord(row);
      const subscores = asRecord(record.subscores);
      const matchedFilters = asRecord(record.matched_filters);

      return {
        candidateId: String(record.candidate_id),
        name: String(record.name ?? "Unknown candidate"),
        currentTitle: String(record.current_title ?? "Candidate"),
        headline: String(record.summary_short ?? record.current_title ?? "Candidate"),
        location: String(record.location ?? "Unknown"),
        yearsExperience: toNumber(record.years_experience),
        seniority: String(record.seniority ?? "unknown"),
        primaryRole: String(record.primary_role ?? "generalist"),
        topSkills: toStringArray(matchedFilters.matched_skills),
        matchScore: calibrateMatchScore(record.score, subscores),
        matchSignals: {
          semantic: toNumber(subscores.semantic_similarity),
          skill: toNumber(subscores.skill_match),
          experience: toNumber(subscores.experience_match),
        },
        shortSummary: String(record.summary_short ?? ""),
        strengths: [],
        risks: [],
        recommendedRoles: [],
        stage: "Retrieved",
        availability: "Unknown",
        avatarHue: hueFromId(String(record.candidate_id)),
        matchNarrative: String(record.summary_short ?? "Live result from search_candidates_v1."),
      };
    }),
    nextCursor: typeof payload.next_cursor === "number" ? payload.next_cursor : null,
    meta: {
      count: toNumber(asRecord(payload.meta).count, rawResults.length),
      rankVersion: String(asRecord(payload.meta).rank_version ?? "v1"),
      source: "remote",
    },
  };
}

function mapRemoteComparison(payload: JsonRecord): ComparisonResponse {
  const nested = asRecord(payload.comparison);
  const normalized = Object.keys(nested).length ? nested : payload;
  const rawItems = asArray(normalized.items);

  return {
    source: String(payload.source ?? normalized.source ?? "deterministic_fallback") as ComparisonResponse["source"],
    overlap: toStringArray(normalized.overlap),
    recommendedCandidateId: normalized.recommended_candidate_id
      ? String(normalized.recommended_candidate_id)
      : normalized.recommendedCandidateId
        ? String(normalized.recommendedCandidateId)
        : null,
    items: rawItems.map((row) => {
      const record = asRecord(row);
      return {
        candidateId: String(record.candidate_id ?? record.candidateId),
        name: String(record.name ?? "Unknown candidate"),
        currentTitle: String(record.current_title ?? record.currentTitle ?? "Candidate"),
        yearsExperience: toNumber(record.years_experience ?? record.yearsExperience),
        seniority: String(record.seniority ?? "unknown"),
        score: toNumber(record.score),
        matchedSkills: toStringArray(record.matched_skills ?? record.matchedSkills),
        gaps: toStringArray(record.gaps),
        strengths: toStringArray(record.strengths),
        risks: toStringArray(record.risks),
        summary: String(record.summary ?? ""),
      };
    }),
    meta: {
      comparedCount: toNumber(asRecord(normalized.meta).compared_count ?? asRecord(normalized.meta).comparedCount, rawItems.length),
    },
  };
}

function mapRemoteAsk(payload: JsonRecord, candidateIds: string[]): AskResponse {
  return {
    intent: String(payload.intent ?? "why_matched"),
    facts: asArray(payload.facts).map((row) => {
      const record = asRecord(row);
      return {
        candidateId: String(record.candidate_id ?? record.candidateId),
        candidateName: String(record.candidate_name ?? record.candidateName ?? "Candidate"),
        fact: String(record.fact ?? ""),
      };
    }),
    citations: asArray(payload.citations).map((row, index) => mapEvidenceSnippet(asRecord(row), index)),
    contextBlocks: asArray(payload.context_blocks).map((row, index) => mapEvidenceSnippet(asRecord(row), index)),
    extractiveAnswer: String(payload.extractive_answer ?? ""),
    meta: {
      candidateCount: toNumber(asRecord(payload.meta).candidate_count, candidateIds.length),
      topK: toNumber(asRecord(payload.meta).top_k, 6),
    },
  };
}

function mapRemoteCandidate(row: CandidateDossierRow, chunks: CandidateChunkRow[]): CandidateDetail {
  const profile = asRecord(row.profile_json);
  const timeline = asArray(row.timeline_json).map((entry) => {
    const record = asRecord(entry);
    const description = String(record.description ?? "");

    return {
      employer: String(record.company ?? "Unknown company"),
      role: String(record.title ?? "Role not parsed"),
      start: String(record.start_date ?? "Unknown"),
      end: String(record.end_date ?? "Present"),
      scope: description,
      highlights: description
        .split(/[.;]\s+/)
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 3),
    };
  });

  const projects = asArray(profile.projects)
    .map((entry) => {
      const record = asRecord(entry);
      const projectName = String(record.name ?? "").trim();
      const description = String(record.description ?? "").trim();
      return projectName && description ? `${projectName}: ${description}` : projectName || description;
    })
    .filter(Boolean);

  const education = asArray(profile.education)
    .map((entry) => {
      const record = asRecord(entry);
      return [String(record.degree ?? "").trim(), String(record.field ?? "").trim(), String(record.institution ?? "").trim()]
        .filter(Boolean)
        .join(" · ");
    })
    .filter(Boolean);

  return {
    candidateId: row.candidate_id,
    name: row.name,
    currentTitle: row.current_title ?? "Candidate",
    headline: row.headline ?? row.short_summary ?? row.summary_short ?? row.current_title ?? "Candidate",
    location: row.location ?? "Unknown",
    yearsExperience: toNumber(row.years_experience),
    seniority: row.seniority ?? "unknown",
    primaryRole: row.primary_role ?? "generalist",
    topSkills: toStringArray(row.top_skills),
    matchScore: Math.round(toNumber(row.confidence, 0.72) * 100),
    matchSignals: {
      semantic: Math.min(1, Math.max(0.4, toNumber(row.confidence, 0.72))),
      skill: Math.min(1, Math.max(0.3, toStringArray(row.top_skills).length / 10)),
      experience: Math.min(1, toNumber(row.years_experience) / 10),
    },
    shortSummary: row.short_summary ?? row.summary_short ?? "",
    strengths: toStringArray(row.strengths),
    risks: toStringArray(row.risks),
    recommendedRoles: toStringArray(row.recommended_roles),
    stage: "Indexed",
    availability: "Unknown",
    avatarHue: hueFromId(row.candidate_id),
    matchNarrative: row.short_summary ?? row.summary_short ?? "Grounded dossier view from candidate_dossier_v1.",
    longSummary: row.long_summary ?? row.short_summary ?? row.summary_short ?? "",
    links: toStringArray(row.links),
    education,
    certifications: toStringArray(profile.certifications),
    languages: toStringArray(profile.languages),
    projects,
    timeline,
    evidence: chunks.map((chunk, index) =>
      mapEvidenceSnippet(
        {
          id: chunk.id,
          chunk_type: chunk.chunk_type,
          text: chunk.text,
          relevance: Math.max(0.4, 0.95 - index * 0.08),
        },
        index,
      ),
    ),
    cvPreview: [
      row.original_filename ? `Source file: ${row.original_filename}` : "",
      row.mime_type ? `MIME type: ${row.mime_type}` : "",
      row.storage_path ? `Storage path: ${row.storage_path}` : "",
      row.source_uri ? `Source URI: ${row.source_uri}` : "",
    ].filter(Boolean),
  };
}

function createMockApi(): PlatformApi {
  return {
    async search(query, filters) {
      await wait(180);
      return searchCandidates(query, filters);
    },
    async getCandidate(candidateId) {
      await wait(120);
      return getCandidate(candidateId);
    },
    async compare(candidateIds, requiredSkills) {
      await wait(140);
      return compareCandidates(candidateIds.length ? candidateIds : defaultCompareIds, requiredSkills);
    },
    async ask(question, candidateIds) {
      await wait(130);
      return askCandidates(question, candidateIds.length ? candidateIds : defaultIntelligenceIds);
    },
    async getAnalytics() {
      await wait(80);
      return analyticsSnapshot;
    },
    async getSystemHealth() {
      await wait(80);
      return systemHealth;
    },
    async getDataConnectors() {
      await wait(80);
      return dataConnectors;
    },
    async getIndexingWorkbench() {
      await wait(80);
      return indexingWorkbench;
    },
    async getAccessRoster() {
      await wait(80);
      return accessRoster;
    },
  };
}

function createRemoteApi(): PlatformApi {
  const mock = createMockApi();

  return {
    async search(query, filters) {
      try {
        const derivedFilters = deriveSearchFilters(query, filters);
        const payload = await invokeFunction<JsonRecord>("search", {
          q: query,
          filters: {
            role: derivedFilters.role ?? null,
            seniority: derivedFilters.seniority ?? null,
            min_years_experience: derivedFilters.minYearsExperience ?? null,
            location: derivedFilters.location ?? null,
            skills: derivedFilters.skills ?? [],
          },
          limit: 8,
        });
        return mapRemoteSearch(payload);
      } catch {
        return mock.search(query, filters);
      }
    },
    async getCandidate(candidateId) {
      if (!supabase) {
        return mock.getCandidate(candidateId);
      }

      try {
        const [dossier, chunks] = await Promise.all([
          supabase
            .from("candidate_dossier_v1")
            .select(
              "candidate_id, name, headline, current_title, location, years_experience, seniority, primary_role, top_skills, links, summary_short, short_summary, long_summary, strengths, risks, recommended_roles, timeline_json, profile_json, original_filename, mime_type, storage_path, source_uri, confidence",
            )
            .eq("candidate_id", candidateId)
            .maybeSingle(),
          supabase
            .from("candidate_chunks")
            .select("id, chunk_type, text")
            .eq("candidate_id", candidateId)
            .eq("is_active", true)
            .order("chunk_index", { ascending: true })
            .limit(6),
        ]);

        if (dossier.error) {
          throw dossier.error;
        }
        if (!dossier.data) {
          throw new Error(`Candidate ${candidateId} was not found.`);
        }
        if (chunks.error) {
          throw chunks.error;
        }

        return mapRemoteCandidate(dossier.data as CandidateDossierRow, (chunks.data ?? []) as CandidateChunkRow[]);
      } catch {
        return mock.getCandidate(candidateId);
      }
    },
    async compare(candidateIds, requiredSkills) {
      try {
        const payload = await invokeFunction<JsonRecord>("compare", {
          candidate_ids: candidateIds,
          required_skills: requiredSkills ?? [],
        });
        return mapRemoteComparison(payload);
      } catch {
        return mock.compare(candidateIds, requiredSkills);
      }
    },
    async ask(question, candidateIds) {
      try {
        const payload = await invokeFunction<JsonRecord>("ask", {
          question,
          candidate_ids: candidateIds,
        });
        return mapRemoteAsk(payload, candidateIds);
      } catch {
        return mock.ask(question, candidateIds);
      }
    },
    async getAnalytics() {
      return mock.getAnalytics();
    },
    async getSystemHealth() {
      return mock.getSystemHealth();
    },
    async getDataConnectors() {
      return mock.getDataConnectors();
    },
    async getIndexingWorkbench() {
      return mock.getIndexingWorkbench();
    },
    async getAccessRoster() {
      return mock.getAccessRoster();
    },
  };
}

export const platformApi = hasSupabaseConfig ? createRemoteApi() : createMockApi();
