import type {
  ParsingDocumentDetail,
  ParsingDocumentSummary,
  ParsingFieldState,
  ParsingFieldStatus,
  ParsingOverview,
  TimelineEntry,
} from "@/lib/contracts";

type JsonRecord = Record<string, unknown>;

export type ParsingSourceDocumentRow = {
  id: string;
  candidate_id: string | null;
  source_type: string | null;
  original_filename: string;
  mime_type: string;
  source_uri: string;
  storage_path: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type ParsingCandidateRow = {
  id: string;
  name: string | null;
  headline: string | null;
  current_title: string | null;
  location: string | null;
  years_experience: number | null;
  seniority: string | null;
  primary_role: string | null;
  top_skills: string[] | null;
  email: string | null;
  phone: string | null;
  links: string[] | null;
  summary_short: string | null;
  status: string | null;
};

export type ParsingProfileRow = {
  candidate_id: string;
  source_document_id: string;
  profile_json: unknown;
  timeline_json: unknown;
  skill_matrix_json: unknown;
  raw_text: string | null;
  confidence: number | null;
  missing_fields: string[] | null;
  parse_warnings: string[] | null;
  created_at: string | null;
  updated_at: string | null;
};

export type ParsingProcessingRunRow = {
  source_document_id: string | null;
  status: string;
  parser_version: string | null;
  model_version: string | null;
  prompt_version: string | null;
  chunk_version: string | null;
  embedding_version: string | null;
  warnings: string[] | null;
  error_code: string | null;
  error_message: string | null;
  created_at: string | null;
  updated_at: string | null;
  metadata_json: unknown;
};

type CoverageDraft = {
  label: string;
  state: ParsingFieldState;
  detail: string;
  weight: number;
};

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

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function coverageFraction(state: ParsingFieldState) {
  if (state === "parsed") {
    return 1;
  }
  if (state === "partial") {
    return 0.55;
  }
  return 0;
}

function summarizeArray(values: string[], emptyLabel: string) {
  return values.length ? values.join(", ") : emptyLabel;
}

function splitHighlights(text: string) {
  return text
    .split(/[.;]\s+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 3);
}

function normalizeTimeline(value: unknown): TimelineEntry[] {
  return asArray(value)
    .map((entry) => {
      const record = asRecord(entry);
      const scope = String(record.description ?? "").trim();
      return {
        employer: String(record.company ?? "Unknown company").trim() || "Unknown company",
        role: String(record.title ?? "Role not parsed").trim() || "Role not parsed",
        start: String(record.start_date ?? "Unknown").trim() || "Unknown",
        end: String(record.end_date ?? "Present").trim() || "Present",
        scope,
        highlights: splitHighlights(scope),
      } satisfies TimelineEntry;
    })
    .filter((entry) => entry.employer !== "Unknown company" || entry.role !== "Role not parsed" || entry.scope);
}

function normalizeEducation(profile: JsonRecord) {
  return asArray(profile.education)
    .map((entry) => {
      const record = asRecord(entry);
      return [String(record.degree ?? "").trim(), String(record.field ?? "").trim(), String(record.institution ?? "").trim()]
        .filter(Boolean)
        .join(" · ");
    })
    .filter(Boolean);
}

function normalizeProjects(profile: JsonRecord) {
  return asArray(profile.projects)
    .map((entry) => {
      const record = asRecord(entry);
      const name = String(record.name ?? "").trim();
      const description = String(record.description ?? "").trim();
      return name && description ? `${name}: ${description}` : name || description;
    })
    .filter(Boolean);
}

function normalizeSkills(profile: JsonRecord, candidate: ParsingCandidateRow | undefined) {
  const profileSkills = toStringArray(profile.skills);
  return profileSkills.length ? profileSkills : toStringArray(candidate?.top_skills);
}

function qualityBand(parsedPercentage: number, status: string, extractionConfidence: number) {
  if (status === "failed" || status === "partial_failed" || parsedPercentage < 55 || extractionConfidence < 45) {
    return "critical" as const;
  }
  if (parsedPercentage < 75 || extractionConfidence < 65) {
    return "review" as const;
  }
  return "healthy" as const;
}

function buildCoverage(
  profile: JsonRecord,
  candidate: ParsingCandidateRow | undefined,
  timeline: TimelineEntry[],
  skills: string[],
  education: string[],
  projects: string[],
  rawText: string,
) {
  const links = toStringArray(profile.links).length ? toStringArray(profile.links) : toStringArray(candidate?.links);
  const summary = String(profile.summary ?? candidate?.summary_short ?? "").trim();
  const email = String(profile.email ?? candidate?.email ?? "").trim();
  const phone = String(profile.phone ?? candidate?.phone ?? "").trim();
  const name = String(profile.name ?? candidate?.name ?? "").trim();
  const currentTitle = String(profile.current_title ?? candidate?.current_title ?? "").trim();
  const headline = String(profile.headline ?? candidate?.headline ?? "").trim();
  const location = String(profile.location ?? candidate?.location ?? "").trim();
  const yearsExperience = toNumber(profile.years_experience ?? candidate?.years_experience, 0);
  const seniority = String(profile.seniority ?? candidate?.seniority ?? "").trim();
  const primaryRole = String((profile.role_tags && toStringArray(profile.role_tags)[0]) ?? candidate?.primary_role ?? "").trim();
  const hasExperienceDates = timeline.some((entry) => entry.start !== "Unknown" || entry.end !== "Present");

  const coverage: CoverageDraft[] = [
    {
      label: "Document text",
      weight: 10,
      state: rawText.length > 1600 ? "parsed" : rawText.length > 200 ? "partial" : "missing",
      detail:
        rawText.length > 1600
          ? `${rawText.length.toLocaleString()} characters extracted from the document body.`
          : rawText.length > 200
            ? `${rawText.length.toLocaleString()} characters extracted, but the text body is shorter than expected.`
            : "Very little raw text was extracted from the source document.",
    },
    {
      label: "Identity",
      weight: 16,
      state: name && (currentTitle || headline) ? "parsed" : name || currentTitle || headline ? "partial" : "missing",
      detail:
        name && (currentTitle || headline)
          ? `${name}${currentTitle ? ` · ${currentTitle}` : headline ? ` · ${headline}` : ""}`
          : name || currentTitle || headline || "Candidate name and title were not parsed reliably.",
    },
    {
      label: "Location",
      weight: 4,
      state: location ? "parsed" : "missing",
      detail: location || "No location was parsed.",
    },
    {
      label: "Contact details",
      weight: 8,
      state: email && phone ? "parsed" : email || phone ? "partial" : "missing",
      detail: email && phone ? `${email} · ${phone}` : email || phone || "No email or phone number was extracted.",
    },
    {
      label: "Skills",
      weight: 14,
      state: skills.length >= 6 ? "parsed" : skills.length >= 2 ? "partial" : "missing",
      detail: skills.length ? `${pluralize(skills.length, "skill")} normalized: ${skills.slice(0, 6).join(", ")}` : "No normalized skills were parsed.",
    },
    {
      label: "Experience timeline",
      weight: 18,
      state: timeline.length >= 3 && hasExperienceDates ? "parsed" : timeline.length >= 1 ? "partial" : "missing",
      detail: timeline.length
        ? `${pluralize(timeline.length, "experience entry")} captured across the employment timeline.`
        : "No experience timeline was segmented from the CV.",
    },
    {
      label: "Education",
      weight: 8,
      state: education.length >= 1 ? "parsed" : "missing",
      detail: education.length ? education[0] : "No education section was parsed.",
    },
    {
      label: "Projects",
      weight: 6,
      state: projects.length >= 2 ? "parsed" : projects.length === 1 ? "partial" : "missing",
      detail: projects.length ? `${pluralize(projects.length, "project")} extracted.` : "No projects were extracted.",
    },
    {
      label: "Links",
      weight: 4,
      state: links.length >= 2 ? "parsed" : links.length === 1 ? "partial" : "missing",
      detail: links.length ? summarizeArray(links.slice(0, 3), "No links were extracted.") : "No links were extracted.",
    },
    {
      label: "Summary",
      weight: 4,
      state: summary.length > 120 ? "parsed" : summary.length > 0 ? "partial" : "missing",
      detail: summary ? `${summary.slice(0, 160)}${summary.length > 160 ? "…" : ""}` : "No summary text was extracted.",
    },
    {
      label: "Derived recruiter facets",
      weight: 8,
      state: yearsExperience > 0 && seniority && primaryRole ? "parsed" : yearsExperience > 0 || seniority || primaryRole ? "partial" : "missing",
      detail:
        yearsExperience > 0 || seniority || primaryRole
          ? `${yearsExperience > 0 ? `${yearsExperience} yrs` : "No years"} · ${seniority || "No seniority"} · ${primaryRole || "No primary role"}`
          : "No derived recruiter-facing facets were populated.",
    },
  ];

  return coverage;
}

function calculateParsedPercentage(coverage: CoverageDraft[], warningsCount: number, status: string) {
  if (status === "failed") {
    return 0;
  }

  const totalWeight = coverage.reduce((sum, item) => sum + item.weight, 0) || 100;
  const weightedScore = coverage.reduce((sum, item) => sum + (item.weight * coverageFraction(item.state)), 0);
  const penalty = Math.min(10, warningsCount * 2);
  return clamp(Math.round((weightedScore / totalWeight) * 100) - penalty, 0, 100);
}

function buildOptimizationHints(
  parsedPercentage: number,
  extractionConfidence: number,
  rawText: string,
  timeline: TimelineEntry[],
  skills: string[],
  warnings: string[],
  missingFields: string[],
  status: string,
) {
  const hints: string[] = [];

  if (status === "failed" || status === "partial_failed") {
    hints.push("This document did not complete the full ingestion flow. Inspect the processing run and rerun the file before trusting downstream search quality.");
  }
  if (rawText.length < 500) {
    hints.push("Raw text extraction is unusually short. This PDF likely needs OCR fallback or a better PDF text extractor before embeddings will be useful.");
  }
  if (!timeline.length && rawText.length > 1000) {
    hints.push("Experience sections were not segmented even though there is enough text. Tighten section detection or rerun with model-backed extraction.");
  }
  if (skills.length < 3 && rawText.length > 1000) {
    hints.push("Skill extraction is sparse relative to document size. Expand skill alias normalization and capture more evidence lines from the source text.");
  }
  if (missingFields.includes("email") || missingFields.includes("phone")) {
    hints.push("Contact details were not fully parsed. Add a deterministic header/contact regex pass before handing off to the LLM.");
  }
  if (warnings.length) {
    hints.push("The parser emitted warnings for this document. Review warning patterns to decide whether OCR, layout parsing, or prompt tuning is the correct fix.");
  }
  if (extractionConfidence < 65) {
    hints.push("Extraction confidence is low. Rerun this document with the Ollama structured extraction path and compare the normalized profile diff.");
  }
  if (parsedPercentage >= 80 && extractionConfidence >= 70 && !warnings.length) {
    hints.push("This document parsed cleanly. Use it as a baseline example when tuning prompts or parser heuristics for weaker resumes.");
  }

  return hints.slice(0, 4);
}

function buildParsedSections(profile: JsonRecord, timeline: TimelineEntry[], education: string[], projects: string[], skills: string[]) {
  const sections: string[] = ["Identity"];

  if (String(profile.summary ?? "").trim()) {
    sections.push("Summary");
  }
  if (skills.length) {
    sections.push("Skills");
  }
  if (timeline.length) {
    sections.push("Experience");
  }
  if (education.length) {
    sections.push("Education");
  }
  if (projects.length) {
    sections.push("Projects");
  }
  if (toStringArray(profile.languages).length) {
    sections.push("Languages");
  }
  if (toStringArray(profile.certifications).length) {
    sections.push("Certifications");
  }
  if (toStringArray(profile.links).length) {
    sections.push("Links");
  }

  return sections;
}

function buildSummary(
  document: ParsingSourceDocumentRow,
  candidate: ParsingCandidateRow | undefined,
  profileRow: ParsingProfileRow | undefined,
  run: ParsingProcessingRunRow | undefined,
) {
  const profile = asRecord(profileRow?.profile_json);
  const timeline = normalizeTimeline(profileRow?.timeline_json);
  const education = normalizeEducation(profile);
  const projects = normalizeProjects(profile);
  const skills = normalizeSkills(profile, candidate);
  const rawText = String(profileRow?.raw_text ?? "").trim();
  const parseWarnings = toStringArray(profileRow?.parse_warnings);
  const processingWarnings = toStringArray(run?.warnings);
  const warnings = Array.from(new Set([...parseWarnings, ...processingWarnings]));
  const missingFields = toStringArray(profileRow?.missing_fields);
  const extractionConfidence = Math.round(clamp(toNumber(profileRow?.confidence, 0), 0, 1) * 100);
  const status = String(run?.status ?? candidate?.status ?? "queued");
  const coverageDraft = buildCoverage(profile, candidate, timeline, skills, education, projects, rawText);
  const parsedPercentage = calculateParsedPercentage(coverageDraft, warnings.length, status);
  const keyFindings = [
    timeline.length ? `${pluralize(timeline.length, "role")} parsed` : "No experience timeline",
    skills.length ? `${pluralize(skills.length, "skill")} normalized` : "No skills normalized",
    warnings.length ? `${pluralize(warnings.length, "warning")} raised` : "No parser warnings",
  ];

  return {
    summary: {
      documentId: document.id,
      candidateId: document.candidate_id,
      candidateName: String(profile.name ?? candidate?.name ?? "Unassigned candidate").trim() || "Unassigned candidate",
      currentTitle: String(profile.current_title ?? candidate?.current_title ?? "").trim() || "Title not parsed",
      originalFilename: document.original_filename,
      mimeType: document.mime_type,
      sourceType: String(document.source_type ?? "upload"),
      sourceUri: document.source_uri,
      uploadedAt: String(document.created_at ?? ""),
      parsedPercentage,
      extractionConfidence,
      rawTextLength: rawText.length,
      status,
      qualityBand: qualityBand(parsedPercentage, status, extractionConfidence),
      parserVersion: String(run?.parser_version ?? "unknown"),
      modelVersion: String(run?.model_version ?? "unknown"),
      promptVersion: String(run?.prompt_version ?? "unknown"),
      embeddingVersion: String(run?.embedding_version ?? "unknown"),
      warnings,
      missingFields,
      keyFindings,
      needsAttention: parsedPercentage < 75 || extractionConfidence < 65 || status === "failed" || status === "partial_failed",
    } satisfies ParsingDocumentSummary,
    profile,
    timeline,
    education,
    projects,
    skills,
    rawText,
    warnings,
    processingWarnings,
    missingFields,
    coverageDraft,
  };
}

export function buildParsingOverview(
  documents: ParsingSourceDocumentRow[],
  candidates: ParsingCandidateRow[],
  profiles: ParsingProfileRow[],
  runs: ParsingProcessingRunRow[],
): ParsingOverview {
  const candidatesById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const profilesByDocumentId = new Map(profiles.map((profile) => [profile.source_document_id, profile]));
  const latestRunByDocumentId = new Map<string, ParsingProcessingRunRow>();

  runs.forEach((run) => {
    if (!run.source_document_id || latestRunByDocumentId.has(run.source_document_id)) {
      return;
    }
    latestRunByDocumentId.set(run.source_document_id, run);
  });

  const items = documents
    .map((document) => {
      const candidate = document.candidate_id ? candidatesById.get(document.candidate_id) : undefined;
      const profile = profilesByDocumentId.get(document.id);
      const run = latestRunByDocumentId.get(document.id);
      return buildSummary(document, candidate, profile, run).summary;
    })
    .sort((left, right) => {
      if (left.needsAttention !== right.needsAttention) {
        return Number(right.needsAttention) - Number(left.needsAttention);
      }
      if (left.parsedPercentage !== right.parsedPercentage) {
        return left.parsedPercentage - right.parsedPercentage;
      }
      return left.originalFilename.localeCompare(right.originalFilename);
    });

  const documentsCount = items.length;
  const completedCount = items.filter((item) => item.status === "completed").length;
  const failedCount = items.filter((item) => item.status === "failed" || item.status === "partial_failed").length;
  const needsReviewCount = items.filter((item) => item.needsAttention).length;
  const overallParsedPercentage = documentsCount
    ? Math.round(items.reduce((sum, item) => sum + item.parsedPercentage, 0) / documentsCount)
    : 0;
  const averageConfidence = documentsCount
    ? Math.round(items.reduce((sum, item) => sum + item.extractionConfidence, 0) / documentsCount)
    : 0;

  return {
    overallParsedPercentage,
    averageConfidence,
    documentsCount,
    completedCount,
    needsReviewCount,
    failedCount,
    items,
  };
}

export function buildParsingDocumentDetail(
  documentId: string,
  documents: ParsingSourceDocumentRow[],
  candidates: ParsingCandidateRow[],
  profiles: ParsingProfileRow[],
  runs: ParsingProcessingRunRow[],
): ParsingDocumentDetail | null {
  const document = documents.find((item) => item.id === documentId);
  if (!document) {
    return null;
  }

  const candidatesById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const profilesByDocumentId = new Map(profiles.map((profile) => [profile.source_document_id, profile]));
  const latestRunByDocumentId = new Map<string, ParsingProcessingRunRow>();

  runs.forEach((run) => {
    if (!run.source_document_id || latestRunByDocumentId.has(run.source_document_id)) {
      return;
    }
    latestRunByDocumentId.set(run.source_document_id, run);
  });

  const candidate = document.candidate_id ? candidatesById.get(document.candidate_id) : undefined;
  const profileRow = profilesByDocumentId.get(document.id);
  const run = latestRunByDocumentId.get(document.id);
  const built = buildSummary(document, candidate, profileRow, run);
  const profile = built.profile;
  const coverage: ParsingFieldStatus[] = built.coverageDraft.map((item) => ({
    label: item.label,
    state: item.state,
    detail: item.detail,
  }));

  return {
    ...built.summary,
    storagePath: document.storage_path,
    updatedAt: String(document.updated_at ?? ""),
    location: String(profile.location ?? candidate?.location ?? "").trim(),
    email: String(profile.email ?? candidate?.email ?? "").trim(),
    phone: String(profile.phone ?? candidate?.phone ?? "").trim(),
    seniority: String(profile.seniority ?? candidate?.seniority ?? "").trim() || "unclassified",
    primaryRole:
      String((profile.role_tags && toStringArray(profile.role_tags)[0]) ?? candidate?.primary_role ?? "").trim() || "unclassified",
    yearsExperience: toNumber(profile.years_experience ?? candidate?.years_experience, 0),
    headline: String(profile.headline ?? candidate?.headline ?? "").trim(),
    summary: String(profile.summary ?? candidate?.summary_short ?? "").trim(),
    links: toStringArray(profile.links).length ? toStringArray(profile.links) : toStringArray(candidate?.links),
    skills: built.skills,
    languages: toStringArray(profile.languages),
    certifications: toStringArray(profile.certifications),
    education: built.education,
    projects: built.projects,
    timeline: built.timeline,
    fieldCoverage: coverage,
    parsedSections: buildParsedSections(profile, built.timeline, built.education, built.projects, built.skills),
    parseWarnings: toStringArray(profileRow?.parse_warnings),
    processingWarnings: built.processingWarnings,
    errorCode: run?.error_code ?? null,
    errorMessage: run?.error_message ?? null,
    rawTextPreview: built.rawText.slice(0, 3200),
    optimizationHints: buildOptimizationHints(
      built.summary.parsedPercentage,
      built.summary.extractionConfidence,
      built.rawText,
      built.timeline,
      built.skills,
      built.warnings,
      built.missingFields,
      built.summary.status,
    ),
  };
}
