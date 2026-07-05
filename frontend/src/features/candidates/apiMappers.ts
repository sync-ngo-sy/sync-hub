import type {
  CandidateDetail,
  CandidateAvailabilityStatus,
  JobReadinessLevel,
  PreferredWorkMode,
  NoticePeriod,
  EnglishProficiency,
  SyncAffiliation,
  EmploymentType,
  CandidateListGroupBy,
  CandidateListItem,
  CandidateListOptions,
  CandidateListResponse,
} from "@/lib/contracts";
import {
  asArray,
  asRecord,
  toNumber,
  toStringArray,
  type JsonRecord,
} from "@/lib/api/json";
import { invokePlatform } from "@/lib/api/platformClient";
import type {
  CandidateChunkRow,
  CandidateDossierRow,
} from "@/lib/api/platformRows";

export function hueFromId(seed: string) {
  return (
    seed
      .split("")
      .reduce((memo, character) => memo + character.charCodeAt(0), 0) % 360
  );
}

export function mapEvidenceSnippet(
  payload: JsonRecord,
  fallbackIndex: number,
): CandidateDetail["evidence"][number] {
  return {
    id: String(payload.chunk_id ?? payload.id ?? `e-${fallbackIndex}`),
    chunkType: String(
      payload.chunk_type ?? payload.chunkType ?? "summary",
    ) as CandidateDetail["evidence"][number]["chunkType"],
    excerpt: String(payload.text ?? payload.excerpt ?? ""),
    relevance: Math.max(
      0,
      Math.min(
        1,
        toNumber(
          payload.semantic_similarity ??
            payload.relevance ??
            payload.lexical_score,
          0.72,
        ),
      ),
    ),
  };
}

export function mapDebugEvidenceSnippet(
  payload: JsonRecord,
  fallbackIndex: number,
) {
  return {
    id: String(payload.chunk_id ?? payload.id ?? `e-${fallbackIndex}`),
    chunkType: String(payload.chunk_type ?? payload.chunkType ?? "summary"),
    excerpt: String(payload.text ?? payload.excerpt ?? ""),
    relevance: Math.max(
      0,
      Math.min(
        1,
        toNumber(
          payload.semantic_similarity ??
            payload.relevance ??
            payload.lexical_score,
          0.72,
        ),
      ),
    ),
  };
}

export function isBrowserOpenableSource(sourceUri?: string | null) {
  return Boolean(sourceUri && /^(https?:)?\/\//i.test(sourceUri));
}

export function isGcsSource(sourceUri?: string | null) {
  return Boolean(sourceUri && /^gs:\/\//i.test(sourceUri));
}

export function buildCandidateCvUrl(sourceUri?: string | null) {
  return isBrowserOpenableSource(sourceUri) ? (sourceUri ?? null) : null;
}

export function mapRemoteCandidate(
  row: CandidateDossierRow,
  chunks: CandidateChunkRow[],
): CandidateDetail {
  const rowMeta = row as CandidateDossierRow & {
    match_score?: unknown;
    match_rate?: unknown;
    score_raw?: unknown;
  };

  const profile = {
    ...asRecord(row.profile_json),
    ...asRecord((row as CandidateDossierRow & { metadata?: unknown }).metadata),
  };

  const profileSkills = toStringArray(profile.skills);

  const fallbackSkills =
    profileSkills.length > 0 ? profileSkills : toStringArray(row.top_skills);

  const normalizeWorkMode = (value?: unknown): PreferredWorkMode => {
    if (typeof value !== "string") {
      return "hybrid";
    }

    const mode = value.toLowerCase();

    if (mode === "remote") return "remote";
    if (mode === "onsite") return "onsite";

    return "hybrid";
  };

  const expectedSalary = asRecord(profile.expected_salary);

 const externalProfiles = asRecord(
  profile.external_profiles ??
    profile.externalProfiles ??
    (row as CandidateDossierRow & {
      external_profiles?: unknown;
      externalProfiles?: unknown;
      linkedin?: unknown;
      github?: unknown;
      portfolio?: unknown;
    }).external_profiles ??
    (row as CandidateDossierRow & {
      externalProfiles?: unknown;
    }).externalProfiles ??
    {
      linkedin:
        (row as CandidateDossierRow & { linkedin?: unknown }).linkedin,

      github:
        (row as CandidateDossierRow & { github?: unknown }).github,

      portfolio:
        (row as CandidateDossierRow & { portfolio?: unknown }).portfolio,
    },
);

  const cvUrl = buildCandidateCvUrl(row.source_uri);

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

      const name = String(record.name ?? "").trim();

      const description = String(record.description ?? "").trim();

      return name && description
        ? `${name}: ${description}`
        : name || description;
    })
    .filter(Boolean);

  const education = asArray(profile.education)
    .map((entry) => {
      const record = asRecord(entry);

      return [
        String(record.degree ?? "").trim(),
        String(record.field ?? "").trim(),
        String(record.institution ?? "").trim(),
      ]
        .filter(Boolean)
        .join(" · ");
    })
    .filter(Boolean);

  return {
    candidateId: row.candidate_id,

    name: row.name,

    currentTitle:
      String(profile.current_title ?? "") || row.current_title || "Candidate",

    headline:
      String(profile.headline ?? "") ||
      row.headline ||
      row.short_summary ||
      row.summary_short ||
      row.current_title ||
      "Candidate",

    location: row.location ?? "Unknown",

    yearsExperience: toNumber(
      profile.years_experience,
      row.years_experience ?? 0,
    ),

    seniority: row.seniority ?? "unknown",

    primaryRole: row.primary_role ?? "generalist",

    topSkills: fallbackSkills,

    matchScore: toNumber(rowMeta.match_score, 0),

    backendMatchRate: toNumber(rowMeta.match_rate, 0),

    backendScoreRaw: toNumber(rowMeta.score_raw, 0),

    matchSignals: {
      semantic: 0,

      skill: Math.min(1, Math.max(0.3, fallbackSkills.length / 10)),

      experience: Math.min(1, toNumber(row.years_experience) / 10),
    },

    shortSummary:
      String(profile.summary ?? "") ||
      row.short_summary ||
      row.summary_short ||
      "",

    longSummary:
      String(profile.summary ?? "") ||
      row.long_summary ||
      row.short_summary ||
      row.summary_short ||
      row.headline ||
      "",

    strengths: toStringArray(row.strengths),

    risks: toStringArray(row.risks),

    recommendedRoles: toStringArray(row.recommended_roles),

    stage: "Indexed",

    avatarHue: hueFromId(row.candidate_id),

    matchNarrative:
      row.short_summary ??
      row.summary_short ??
      "Grounded dossier view from candidate_dossier_v1.",

    email: row.email,

    phone: row.phone,

    originalFilename: row.original_filename,

    sourceUri: row.source_uri,

    storagePath: row.storage_path,

    cvUrl,

    manatalCandidateId: row.manatal_candidate_id ?? null,

    jobReadinessLevel:
      typeof profile.job_readiness_level === "string"
        ? (profile.job_readiness_level as JobReadinessLevel)
        : row.seniority === "staff" || row.seniority === "senior"
          ? "L4"
          : row.seniority === "mid"
            ? "L3"
            : "L2",

    preferredWorkMode: normalizeWorkMode(
      profile.preferred_work_mode ?? profile.preferredWorkMode,
    ),

    primarySkills: toStringArray(profile.primary_skills).length
      ? toStringArray(profile.primary_skills)
      : fallbackSkills,

    noticePeriod:
      typeof profile.notice_period === "string"
        ? (profile.notice_period as NoticePeriod)
        : "2_weeks",

    englishProficiency:
      typeof profile.english_proficiency === "string"
        ? (profile.english_proficiency as EnglishProficiency)
        : "fluent",

    syncAffiliation:
      typeof profile.sync_affiliation === "string"
        ? (profile.sync_affiliation as SyncAffiliation)
        : null,

    internalVettingNotes:
      typeof profile.internal_vetting_notes === "string"
        ? profile.internal_vetting_notes
        : null,

    currentLocationCity:
      typeof profile.current_location_city === "string"
        ? profile.current_location_city
        : (row.location ?? null),

    willingnessToRelocate:
      typeof profile.willingness_to_relocate === "boolean"
        ? profile.willingness_to_relocate
        : undefined,
    externalProfiles: {
      linkedin:
        typeof externalProfiles.linkedin === "string"
          ? externalProfiles.linkedin
          : null,

      github:
        typeof externalProfiles.github === "string"
          ? externalProfiles.github
          : null,

      portfolio:
        typeof externalProfiles.portfolio === "string"
          ? externalProfiles.portfolio
          : null,
    },

    aiProfileSummary: profile.ai_profile_summary
      ? String(profile.ai_profile_summary)
      : null,

    employmentTypePreference: toStringArray(
      profile.employment_type_preference,
    ) as EmploymentType[],

    lastInteractionDate:
      typeof profile.last_interaction_date === "string"
        ? profile.last_interaction_date
        : null,

    expectedSalary:
      expectedSalary.amount || expectedSalary.currency
        ? {
            amount: toNumber(expectedSalary.amount, 0),
            currency:
              typeof expectedSalary.currency === "string"
                ? expectedSalary.currency
                : "USD",
          }
        : null,

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
      row.original_filename ? `CV file: ${row.original_filename}` : "",

      row.mime_type ? `MIME type: ${row.mime_type}` : "",

      cvUrl ? `Drive link: ${cvUrl}` : "",
    ].filter(Boolean),
  };
}
export async function fetchCandidatesListRpc(
  tenantIds: string[],
  options?: CandidateListOptions,
): Promise<CandidateListResponse> {
  const payload = await invokePlatform<JsonRecord>("candidates_list", {
    tenant_ids: tenantIds,
    ...(options ?? {}),
  });

  const rows = asArray(payload.data ?? payload.rows);

  return {
    items: rows.map((item, index) => {
      const row = asRecord(item);

      return {
        tenantId: String(row.tenant_id ?? tenantIds[0] ?? ""),

        candidateId: String(row.candidate_id ?? row.id ?? `candidate-${index}`),

        name: String(row.name ?? "Candidate"),

        email: typeof row.email === "string" ? row.email : null,

        location: String(row.location ?? "Unknown"),

        primaryRole: String(row.primary_role ?? "generalist"),

        appliedRole:
          typeof row.applied_role === "string" ? row.applied_role : null,

        stage: String(row.stage ?? "Indexed"),

        stageKey: String(row.stage_key ?? row.stage ?? "indexed"),

        source: String(row.source ?? "platform"),

        seniority: String(row.seniority ?? "unknown"),

        updatedAt:
          typeof row.updated_at === "string"
            ? row.updated_at
            : new Date().toISOString(),

        groupKey: typeof row.group_key === "string" ? row.group_key : null,

        groupLabel:
          typeof row.group_label === "string" ? row.group_label : null,
      } satisfies CandidateListItem;
    }),

    itemsTotalCount: toNumber(
      payload.items_total_count ?? payload.total ?? rows.length,
      rows.length,
    ),

    pageLimit: toNumber(
      payload.page_limit ?? options?.pageSize ?? rows.length,
      rows.length,
    ),

    pageOffset: toNumber(payload.page_offset ?? 0, 0),

    groupBy:
      typeof payload.group_by === "string"
        ? (payload.group_by as CandidateListGroupBy)
        : "",

    groups: asArray(payload.groups).map((group) => {
      const item = asRecord(group);

      return {
        key: String(item.key ?? ""),
        label: String(item.label ?? ""),
        count: toNumber(item.count, 0),
      };
    }),

    filterOptions: {
      statuses: toStringArray(asRecord(payload.filter_options).statuses),

      roles: toStringArray(asRecord(payload.filter_options).roles),

      sources: toStringArray(asRecord(payload.filter_options).sources),

      locations: toStringArray(asRecord(payload.filter_options).locations),
    },
  };
}
