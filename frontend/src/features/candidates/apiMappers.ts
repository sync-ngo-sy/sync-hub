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

export function normalizeSeniority(value?: unknown): string {
  const text = String(value ?? "")
    .toLowerCase()
    .trim();

  if (["senior", "lead", "principal", "expert"].includes(text)) {
    return "Senior";
  }

  if (["mid", "middle", "intermediate"].includes(text)) {
    return "Mid";
  }

  if (["junior", "entry", "intern"].includes(text)) {
    return "Junior";
  }

  return "Professional";
}

export function inferPrimaryRole(profile: JsonRecord): string | null {
  const titleText = [
    profile.current_title,
    profile.currentTitle,
    profile.job_title,
    profile.title,
    profile.primary_role,
    profile.headline,
  ]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();

  if (/(database|oracle|sql|core banking|dba|pl\/sql)/i.test(titleText)) {
    return "Database";
  }

  if (/(devops|cloud engineer|aws|azure)/i.test(titleText)) {
    return "DevOps";
  }

  if (
    /(data analyst|data scientist|machine learning|ai engineer)/i.test(
      titleText,
    )
  ) {
    return "Data / AI";
  }

  if (
    /(software engineer|frontend|react|next|javascript|typescript)/i.test(
      titleText,
    )
  ) {
    return "Frontend";
  }

  const skillText = [
    profile.summary,
    ...(Array.isArray(profile.skills) ? profile.skills : []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (/(security|cyber|soc|penetration|threat)/i.test(skillText)) {
    return "Security";
  }

  if (/(react|frontend|javascript|typescript|css|html)/i.test(skillText)) {
    return "Frontend";
  }

  return null;
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

  const profileAttributes = asRecord(
    (
      row as CandidateDossierRow & {
        profile_attributes?: unknown;
      }
    ).profile_attributes,
  );

  const profile = {
    ...asRecord(row.profile_json),
    ...profileAttributes,
    ...asRecord(
      (
        row as CandidateDossierRow & {
          metadata?: unknown;
        }
      ).metadata,
    ),
  };

  const normalizeArray = (value: unknown): string[] =>
    Array.from(
      new Set(
        toStringArray(value)
          .map((item) => item.trim())
          .filter(Boolean),
      ),
    );

  const roleTags = normalizeArray(profile.role_tags ?? profile.roleTags ?? []);

  const profileSkills = normalizeArray(
    profile.skills ??
      profile.primary_skills ??
      profile.technical_skills ??
      profile.core_skills ??
      profile.skill_matrix ??
      null,
  );

  const fallbackSkills =
    profileSkills.length > 0 ? profileSkills : toStringArray(row.top_skills);

  const cleanSkills = fallbackSkills.filter(Boolean).slice(0, 8);

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

  const primarySkills = normalizeArray(
    profile.primary_skills ?? profile.primarySkills ?? profile.skills,
  );

  const employmentTypePreference = normalizeArray(
    profile.employment_type_preference ?? profile.employmentTypePreference,
  ) as EmploymentType[];

  const externalLinks = toStringArray(
    (
      row as CandidateDossierRow & {
        external_links?: unknown;
      }
    ).external_links ??
      profile.external_links ??
      profile.externalLinks ??
      [],
  );

  function getExternalProfileUrl(
  links: string[],
  domain: string,
): string | null {
  return (
    links.find((link) => {
      try {
        const url = new URL(link);
        const hostname = url.hostname.toLowerCase();

        return (
          hostname === domain ||
          hostname.endsWith(`.${domain}`)
        );
      } catch {
        return false;
      }
    }) ?? null
  );
}

const externalProfiles = {
  linkedin: getExternalProfileUrl(
    externalLinks,
    "linkedin.com",
  ),

  github: getExternalProfileUrl(
    externalLinks,
    "github.com",
  ),

  portfolio:
    externalLinks.find((link) => {
      try {
        const url = new URL(link);
        const hostname = url.hostname.toLowerCase();

        return (
          hostname !== "linkedin.com" &&
          !hostname.endsWith(".linkedin.com") &&
          hostname !== "github.com" &&
          !hostname.endsWith(".github.com")
        );
      } catch {
        return false;
      }
    }) ?? null,
};

  const cvUrl = buildCandidateCvUrl(row.source_uri);

  const timeline = asArray(row.timeline_json).map((entry) => {
    const record = asRecord(entry);

    const description = String(record.description ?? "");

    return {
      employer: String(record.company ?? "Unknown company"),
      roleTags,
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

  const listSkills = toStringArray(row.top_skills).slice(0, 5);

  const education = asArray(profile.education)
    .map((entry) => {
      if (typeof entry === "string") {
        return entry;
      }

      const record = asRecord(entry);

      return [record.degree, record.field, record.institution, record.year]
        .filter((value) => typeof value === "string" && value.trim())
        .join(" · ");
    })
    .filter(Boolean);

  return {
    candidateId: row.candidate_id,

    name: row.name,

    currentTitle:
      String(
        profile.current_title ??
          profile.currentTitle ??
          profile.job_title ??
          profile.title ??
          row.current_title ??
          "",
      ) || "Candidate",

    headline:
      String(
        profile.headline ??
          profile.summary ??
          profile.short_summary ??
          profile.current_title ??
          row.headline ??
          row.short_summary ??
          row.summary_short ??
          "",
      ) || "Candidate",

    location: row.location ?? "Unknown",

    yearsExperience: toNumber(
      profile.years_experience ??
        profile.yearsExperience ??
        profile.total_experience ??
        row.years_experience,
      0,
    ),

    seniority: normalizeSeniority(
      row.seniority ??
        profile.seniority ??
        profile.level ??
        profile.experience_level,
    ),

    primaryRole:
      inferPrimaryRole(asRecord(row)) ??
      String(row.primary_role ?? row.current_title ?? "Professional"),

    status:
      typeof profile.status === "string"
        ? (profile.status as CandidateAvailabilityStatus)
        : "active",

    topSkills: cleanSkills,

    matchScore: Math.round(
      Math.min(
        1,
        Math.max(
          0,
          toNumber(
            rowMeta.match_score ??
              rowMeta.match_rate ??
              rowMeta.score_raw ??
              profile.match_score,
            0,
          ),
        ),
      ) * 100,
    ),

    backendMatchRate: toNumber(rowMeta.match_rate, 0),

    backendScoreRaw: toNumber(rowMeta.score_raw, 0),

    matchSignals: {
      semantic: 0,

      skill: Math.min(1, Math.max(0.3, cleanSkills.length / 10)),

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
        : normalizeSeniority(profile.seniority ?? row.seniority) === "Senior"
          ? "L4"
          : normalizeSeniority(profile.seniority ?? row.seniority) === "Mid"
            ? "L3"
            : "L2",

    preferredWorkMode: normalizeWorkMode(
      profile.preferred_work_mode ?? profile.preferredWorkMode,
    ),

    primarySkills: primarySkills.length > 0 ? primarySkills : cleanSkills,

    noticePeriod:
      typeof profile.notice_period === "string"
        ? (profile.notice_period as NoticePeriod)
        : "2_weeks",

    englishProficiency:
      typeof profile.english_proficiency === "string"
        ? (profile.english_proficiency as EnglishProficiency)
        : typeof profile.english === "string"
          ? (profile.english as EnglishProficiency)
          : typeof profile.language_level === "string"
            ? (profile.language_level as EnglishProficiency)
            : null,

    syncAffiliation:
      typeof profile.sync_affiliation === "string"
        ? (profile.sync_affiliation as SyncAffiliation)
        : null,

    internalVettingNotes:
      typeof profile.internal_vetting_notes === "string"
        ? profile.internal_vetting_notes
        : null,

    isPreScreened:
      typeof profile.is_pre_screened === "boolean"
        ? profile.is_pre_screened
        : false,

    currentLocationCity:
      typeof profile.current_location_city === "string"
        ? profile.current_location_city
        : typeof profile.currentLocationCity === "string"
          ? profile.currentLocationCity
          : typeof profile.location_city === "string"
            ? profile.location_city
            : typeof profile.city === "string"
              ? profile.city
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

    aiProfileSummary:
      profile.ai_profile_summary || profile.aiProfileSummary
        ? String(profile.ai_profile_summary ?? profile.aiProfileSummary)
        : null,

    employmentTypePreference,

    lastInteractionDate:
      typeof profile.last_interaction_date === "string"
        ? profile.last_interaction_date
        : typeof profile.lastInteractionDate === "string"
          ? profile.lastInteractionDate
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
    profileAttributes,
    links: toStringArray(row.links),
    yearsOfExperience: toNumber(
      profile.years_of_experience ??
        profile.yearsExperience ??
        row.years_experience,
      0,
    ),
    education,

    certifications: normalizeArray(
      profile.certifications ??
        profile.certificates ??
        profile.licenses ??
        null,
    ),

    languages: normalizeArray(profile.languages ?? profile.language ?? null),

    projects,

    timeline,

    evidence: chunks
      .map((chunk, index) => {
        const chunkMeta = chunk as CandidateChunkRow & {
          relevance?: unknown;
          semantic_similarity?: unknown;
          score?: unknown;
        };

        return mapEvidenceSnippet(
          {
            id: chunk.id,
            chunk_type: chunk.chunk_type,
            text: chunk.text,

            relevance: toNumber(
              chunkMeta.relevance ??
                chunkMeta.semantic_similarity ??
                chunkMeta.score,
              0.5,
            ),
          },
          index,
        );
      })
      .sort((a, b) => b.relevance - a.relevance),

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

        primaryRole: String(
          row.primary_role ?? row.current_title ?? "Professional",
        ),

        appliedRole:
          typeof row.applied_role === "string" ? row.applied_role : null,

        stage: String(row.stage ?? "Indexed"),

        stageKey: String(row.stage_key ?? row.stage ?? "indexed"),

        source: String(row.source ?? "platform"),

        seniority: normalizeSeniority(row.seniority),

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
