import type {
  CandidateDetail,
  CandidateAvailabilityStatus,
  JobReadinessLevel,
  PreferredWorkMode,
  NoticePeriod,
  EnglishProficiency,
  SyncAffiliation,
  EmploymentType,
} from "@/lib/contracts";
import { asArray, asRecord, toNumber, toStringArray, type JsonRecord } from "@/lib/api/json";
import type { CandidateChunkRow, CandidateDossierRow } from "@/lib/api/platformRows";

export function hueFromId(seed: string) {
  return seed.split("").reduce((memo, character) => memo + character.charCodeAt(0), 0) % 360;
}

export function mapEvidenceSnippet(payload: JsonRecord, fallbackIndex: number): CandidateDetail["evidence"][number] {
  return {
    id: String(payload.chunk_id ?? payload.id ?? `e-${fallbackIndex}`),
    chunkType: String(payload.chunk_type ?? payload.chunkType ?? "summary") as CandidateDetail["evidence"][number]["chunkType"],
    excerpt: String(payload.text ?? payload.excerpt ?? ""),
    relevance: Math.max(0, Math.min(1, toNumber(payload.semantic_similarity ?? payload.relevance ?? payload.lexical_score, 0.72))),
  };
}

export function mapDebugEvidenceSnippet(payload: JsonRecord, fallbackIndex: number) {
  return {
    id: String(payload.chunk_id ?? payload.id ?? `e-${fallbackIndex}`),
    chunkType: String(payload.chunk_type ?? payload.chunkType ?? "summary"),
    excerpt: String(payload.text ?? payload.excerpt ?? ""),
    relevance: Math.max(0, Math.min(1, toNumber(payload.semantic_similarity ?? payload.relevance ?? payload.lexical_score, 0.72))),
  };
}

export function isBrowserOpenableSource(sourceUri?: string | null) {
  return Boolean(sourceUri && /^(https?:)?\/\//i.test(sourceUri));
}

export function isGcsSource(sourceUri?: string | null) {
  return Boolean(sourceUri && /^gs:\/\//i.test(sourceUri));
}

export function buildCandidateCvUrl(sourceUri?: string | null) {
  return isBrowserOpenableSource(sourceUri) ? sourceUri ?? null : null;
}

export function mapRemoteCandidate(row: CandidateDossierRow, chunks: CandidateChunkRow[]): CandidateDetail {
  const profile = asRecord(row.profile_json);
  const expectedSalary = asRecord(
  profile.expected_salary,
);

const externalProfiles = asRecord(
  profile.external_profiles,
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
    matchScore: 0,
    backendMatchRate: 0,
    backendScoreRaw: 0,
    matchSignals: {
      semantic: 0,
      skill: Math.min(1, Math.max(0.3, toStringArray(row.top_skills).length / 10)),
      experience: Math.min(1, toNumber(row.years_experience) / 10),
    },
    shortSummary: row.short_summary ?? row.summary_short ?? "",
    strengths: toStringArray(row.strengths),
    risks: toStringArray(row.risks),
    recommendedRoles: toStringArray(row.recommended_roles),
    stage: "Indexed",
    avatarHue: hueFromId(row.candidate_id),
    matchNarrative: row.short_summary ?? row.summary_short ?? "Grounded dossier view from candidate_dossier_v1.",
    longSummary: row.long_summary ?? row.short_summary ?? row.summary_short ?? "",
    email: row.email,
    phone: row.phone,
    originalFilename: row.original_filename,
    sourceUri: row.source_uri,
    storagePath: row.storage_path,
    cvUrl,
    manatalCandidateId: row.manatal_candidate_id ?? null,
    status:
  typeof profile.status === "string"
    ? (profile.status as CandidateAvailabilityStatus)
    : null,

jobReadinessLevel:
  typeof profile.job_readiness_level === "string"
    ? (profile.job_readiness_level as JobReadinessLevel)
    : "L1",

preferredWorkMode:
  typeof profile.preferred_work_mode === "string"
    ? (profile.preferred_work_mode as PreferredWorkMode)
    : null,

    yearsOfExperience:
  toNumber(
    profile.years_of_experience,
    row.years_experience ?? undefined,
  ),

primarySkills:
  toStringArray(profile.primary_skills),

noticePeriod:
  typeof profile.notice_period === "string"
    ? (profile.notice_period as NoticePeriod)
    : null,

englishProficiency:
  typeof profile.english_proficiency === "string"
    ? (profile.english_proficiency as EnglishProficiency)
    : null,

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
    : row.location ?? null,

willingnessToRelocate:
  Boolean(profile.willingness_to_relocate),
externalProfiles:
  Object.keys(externalProfiles).length
    ? {
        linkedin:
          externalProfiles.linkedin
            ? String(
                externalProfiles.linkedin,
              )
            : null,

        github:
          externalProfiles.github
            ? String(
                externalProfiles.github,
              )
            : null,

        portfolio:
          externalProfiles.portfolio
            ? String(
                externalProfiles.portfolio,
              )
            : null,
      }
    : null,
aiProfileSummary:
  profile.ai_profile_summary
    ? String(profile.ai_profile_summary)
    : null,

employmentTypePreference:
  toStringArray(
    profile.employment_type_preference,
  ) as EmploymentType[],

lastInteractionDate:
  typeof profile.last_interaction_date === "string"
    ? profile.last_interaction_date
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
