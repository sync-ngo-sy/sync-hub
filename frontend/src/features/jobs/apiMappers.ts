import type {
  EmployerRegion,
  JobApplication,
  JobApplicationStatus,
  JobCandidateMatch,
  JobExtractionResult,
  JobMatchingRun,
  JobMatchingRunDetail,
  JobPosting,
  JobPostingInput,
  JobPostingStatus,
  JobShortlist,
  JobShortlistCandidate,
  JobShortlistDetail,
  PublicJobApplicationInput,
  PublicJobApplicationReceipt,
  PublicJobPosting,
} from "@/lib/contracts";
import { asArray, asRecord, nullableString, toNumber, toStringArray } from "@/lib/api/json";

function normalizeJobStatus(value: unknown): JobPostingStatus {
  return value === "active" || value === "closed" ? value : "draft";
}

function normalizeEmployerRegion(value: unknown): EmployerRegion {
  return value === "EU" || value === "USA" ? value : "GCC";
}

export function mapRemoteJobPosting(row: unknown): JobPosting {
  const record = asRecord(row);
  return {
    id: String(record.id ?? ""),
    tenantId: String(record.tenant_id ?? record.tenantId ?? ""),
    title: String(record.title ?? ""),
    employerName: String(record.employer_name ?? record.employerName ?? ""),
    employerCountry: String(record.employer_country ?? record.employerCountry ?? ""),
    employerRegion: normalizeEmployerRegion(record.employer_region ?? record.employerRegion),
    jobDescription: String(record.job_description ?? record.jobDescription ?? ""),
    requiredSkills: toStringArray(record.required_skills ?? record.requiredSkills),
    preferredSkills: toStringArray(record.preferred_skills ?? record.preferredSkills),
    seniorityLevel: String(record.seniority_level ?? record.seniorityLevel ?? ""),
    employmentType: String(record.employment_type ?? record.employmentType ?? ""),
    postedDate: nullableString(record.posted_date ?? record.postedDate),
    applicationDeadline: nullableString(record.application_deadline ?? record.applicationDeadline),
    status: normalizeJobStatus(record.status),
    locationInfo: asRecord(record.location_info ?? record.locationInfo) as JobPosting["locationInfo"],
    keyResponsibilities: toStringArray(record.key_responsibilities ?? record.keyResponsibilities),
    aiProfile: asRecord(record.ai_profile ?? record.aiProfile),
    aiConfidence: asRecord(record.ai_confidence ?? record.aiConfidence),
    createdByUserId: nullableString(record.created_by_user_id ?? record.createdByUserId),
    updatedByUserId: nullableString(record.updated_by_user_id ?? record.updatedByUserId),
    closedAt: nullableString(record.closed_at ?? record.closedAt),
    closedByUserId: nullableString(record.closed_by_user_id ?? record.closedByUserId),
    isPublic: Boolean(record.is_public ?? record.isPublic),
    publicSlug: nullableString(record.public_slug ?? record.publicSlug),
    publicTitle: nullableString(record.public_title ?? record.publicTitle),
    publicSummary: nullableString(record.public_summary ?? record.publicSummary),
    publicDescription: nullableString(record.public_description ?? record.publicDescription),
    publicLocation: nullableString(record.public_location ?? record.publicLocation),
    publicApplyEnabled: record.public_apply_enabled === false || record.publicApplyEnabled === false ? false : true,
    publicPublishedAt: nullableString(record.public_published_at ?? record.publicPublishedAt),
    createdAt: String(record.created_at ?? record.createdAt ?? ""),
    updatedAt: String(record.updated_at ?? record.updatedAt ?? ""),
  };
}

export function jobPostingPayload(job: JobPostingInput) {
  return {
    id: job.id,
    tenant_id: job.tenantId,
    title: job.title,
    employer_name: job.employerName,
    employer_country: job.employerCountry,
    employer_region: job.employerRegion,
    job_description: job.jobDescription,
    required_skills: job.requiredSkills ?? [],
    preferred_skills: job.preferredSkills ?? [],
    seniority_level: job.seniorityLevel,
    employment_type: job.employmentType,
    posted_date: job.postedDate,
    application_deadline: job.applicationDeadline,
    status: job.status,
    location_info: job.locationInfo ?? {},
    key_responsibilities: job.keyResponsibilities ?? [],
    ai_profile: job.aiProfile ?? {},
    ai_confidence: job.aiConfidence ?? {},
    is_public: job.isPublic ?? false,
    public_slug: job.publicSlug ?? null,
    public_title: job.publicTitle ?? null,
    public_summary: job.publicSummary ?? null,
    public_description: job.publicDescription ?? null,
    public_location: job.publicLocation ?? null,
    public_apply_enabled: job.publicApplyEnabled ?? true,
  };
}

export function mapRemoteJobExtraction(payload: unknown): JobExtractionResult {
  const record = asRecord(payload);
  const mapSkill = (item: unknown) => {
    const row = asRecord(item);
    return {
      name: String(row.name ?? ""),
      confidence: toNumber(row.confidence),
      evidence: String(row.evidence ?? ""),
    };
  };
  const seniority = asRecord(record.seniorityLevel ?? record.seniority_level);
  const employmentType = asRecord(record.employmentType ?? record.employment_type);
  return {
    requiredSkills: asArray(record.requiredSkills ?? record.required_skills).map(mapSkill).filter((skill) => skill.name),
    preferredSkills: asArray(record.preferredSkills ?? record.preferred_skills).map(mapSkill).filter((skill) => skill.name),
    seniorityLevel: {
      value: String(seniority.value ?? ""),
      confidence: toNumber(seniority.confidence),
      evidence: String(seniority.evidence ?? ""),
    },
    employmentType: {
      value: String(employmentType.value ?? ""),
      confidence: toNumber(employmentType.confidence),
      evidence: String(employmentType.evidence ?? ""),
    },
    location: asRecord(record.location) as JobExtractionResult["location"],
    keyResponsibilities: toStringArray(record.keyResponsibilities ?? record.key_responsibilities),
    warnings: asArray(record.warnings).map((item) => {
      const row = asRecord(item);
      return {
        type: String(row.type ?? "WARNING"),
        message: String(row.message ?? ""),
      };
    }),
    modelProvider: String(record.modelProvider ?? record.model_provider ?? "unknown"),
    modelName: String(record.modelName ?? record.model_name ?? "unknown"),
    promptVersion: String(record.promptVersion ?? record.prompt_version ?? "job-extraction-v1"),
    inputHash: String(record.inputHash ?? record.input_hash ?? ""),
  };
}

export function mapRemoteJobMatchingRun(row: unknown): JobMatchingRun {
  const record = asRecord(row);
  const status = String(record.status ?? "failed");
  return {
    id: String(record.id ?? ""),
    tenantId: String(record.tenant_id ?? record.tenantId ?? ""),
    jobPostingId: String(record.job_posting_id ?? record.jobPostingId ?? ""),
    initiatedByUserId: nullableString(record.initiated_by_user_id ?? record.initiatedByUserId),
    status: status === "queued" || status === "running" || status === "completed" || status === "cancelled" ? status : "failed",
    requestedLimit: toNumber(record.requested_limit ?? record.requestedLimit),
    semanticPoolSize: toNumber(record.semantic_pool_size ?? record.semanticPoolSize),
    rerankPoolSize: toNumber(record.rerank_pool_size ?? record.rerankPoolSize),
    retrievedCount: toNumber(record.retrieved_count ?? record.retrievedCount),
    filteredCount: toNumber(record.filtered_count ?? record.filteredCount),
    rerankedCount: toNumber(record.reranked_count ?? record.rerankedCount),
    completedCount: toNumber(record.completed_count ?? record.completedCount),
    failureReason: nullableString(record.failure_reason ?? record.failureReason),
    matchingConfig: asRecord(record.matching_config ?? record.matchingConfig),
    jobProfile: asRecord(record.job_profile ?? record.jobProfile),
    embeddingProvider: nullableString(record.embedding_provider ?? record.embeddingProvider),
    embeddingVersion: nullableString(record.embedding_version ?? record.embeddingVersion),
    startedAt: nullableString(record.started_at ?? record.startedAt),
    completedAt: nullableString(record.completed_at ?? record.completedAt),
    createdAt: String(record.created_at ?? record.createdAt ?? ""),
  };
}

function mapRemoteJobCandidateMatch(row: unknown): JobCandidateMatch {
  const record = asRecord(row);
  const alignment = String(record.seniority_alignment ?? record.seniorityAlignment);
  return {
    id: String(record.id ?? ""),
    tenantId: String(record.tenant_id ?? record.tenantId ?? ""),
    matchingRunId: String(record.matching_run_id ?? record.matchingRunId ?? ""),
    jobPostingId: String(record.job_posting_id ?? record.jobPostingId ?? ""),
    candidateId: String(record.candidate_id ?? record.candidateId ?? ""),
    sourceTenantId: nullableString(record.candidate_source_tenant_id ?? record.sourceTenantId),
    rank: toNumber(record.rank),
    semanticScore: toNumber(record.semantic_score ?? record.semanticScore),
    aiScore: toNumber(record.ai_score ?? record.aiScore),
    finalScore: toNumber(record.final_score ?? record.finalScore),
    matchedSkills: toStringArray(record.matched_skills ?? record.matchedSkills),
    missingSkills: toStringArray(record.missing_skills ?? record.missingSkills),
    seniorityAlignment: alignment === "Exact Match" || alignment === "Partial Match" ? alignment : "Mismatch",
    experienceSummary: String(record.experience_summary ?? record.experienceSummary ?? ""),
    matchExplanation: String(record.match_explanation ?? record.matchExplanation ?? ""),
    scoringBreakdown: asRecord(record.scoring_breakdown ?? record.scoringBreakdown),
    hardFilterPayload: asRecord(record.hard_filter_payload ?? record.hardFilterPayload),
    candidateSnapshot: asRecord(record.candidate_snapshot ?? record.candidateSnapshot),
    createdAt: String(record.created_at ?? record.createdAt ?? ""),
  };
}

export function mapRemoteJobMatchingRunDetail(payload: unknown): JobMatchingRunDetail {
  const record = asRecord(payload);
  return {
    run: mapRemoteJobMatchingRun(record.run),
    results: asArray(record.results).map(mapRemoteJobCandidateMatch),
  };
}

export function mapRemoteJobShortlist(row: unknown): JobShortlist {
  const record = asRecord(row);
  return {
    id: String(record.id ?? ""),
    tenantId: String(record.tenant_id ?? record.tenantId ?? ""),
    jobPostingId: String(record.job_posting_id ?? record.jobPostingId ?? ""),
    matchingRunId: nullableString(record.matching_run_id ?? record.matchingRunId),
    name: String(record.name ?? ""),
    description: String(record.description ?? ""),
    ownerUserId: nullableString(record.owner_user_id ?? record.ownerUserId),
    createdAt: String(record.created_at ?? record.createdAt ?? ""),
    updatedAt: String(record.updated_at ?? record.updatedAt ?? ""),
  };
}

function mapRemoteJobShortlistCandidate(row: unknown): JobShortlistCandidate {
  const record = asRecord(row);
  return {
    id: String(record.id ?? ""),
    tenantId: String(record.tenant_id ?? record.tenantId ?? ""),
    shortlistId: String(record.shortlist_id ?? record.shortlistId ?? ""),
    candidateId: String(record.candidate_id ?? record.candidateId ?? ""),
    sourceTenantId: nullableString(record.candidate_source_tenant_id ?? record.sourceTenantId),
    savedRank: toNumber(record.saved_rank ?? record.savedRank),
    savedScore: toNumber(record.saved_score ?? record.savedScore),
    savedResultPayload: asRecord(record.saved_result_payload ?? record.savedResultPayload),
    addedByUserId: nullableString(record.added_by_user_id ?? record.addedByUserId),
    createdAt: String(record.created_at ?? record.createdAt ?? ""),
  };
}

export function mapRemoteJobShortlistDetail(payload: unknown): JobShortlistDetail {
  const record = asRecord(payload);
  return {
    shortlist: mapRemoteJobShortlist(record.shortlist),
    candidates: asArray(record.candidates).map(mapRemoteJobShortlistCandidate),
  };
}

function normalizeJobApplicationStatus(value: unknown): JobApplicationStatus {
  return value === "reviewing" || value === "shortlisted" || value === "rejected" || value === "withdrawn" ? value : "new";
}

function normalizeResumeIngestionStatus(value: unknown) {
  return value === "queued" || value === "parsing" || value === "parsed" || value === "failed" ? value : "not_uploaded";
}

function normalizeCandidateHubVisibility(value: unknown) {
  return value === "platform" || value === "private" ? value : "tenant";
}

export function mapRemoteJobApplication(row: unknown): JobApplication {
  const record = asRecord(row);
  return {
    id: String(record.id ?? ""),
    tenantId: String(record.tenant_id ?? record.tenantId ?? ""),
    jobPostingId: String(record.job_posting_id ?? record.jobPostingId ?? ""),
    candidateId: nullableString(record.candidate_id ?? record.candidateId),
    sourceTenantId: nullableString(record.candidate_source_tenant_id ?? record.sourceTenantId),
    applicantName: String(record.applicant_name ?? record.applicantName ?? ""),
    applicantEmail: String(record.applicant_email ?? record.applicantEmail ?? ""),
    applicantPhone: nullableString(record.applicant_phone ?? record.applicantPhone),
    applicantLocation: nullableString(record.applicant_location ?? record.applicantLocation),
    linkedinUrl: nullableString(record.linkedin_url ?? record.linkedinUrl),
    portfolioUrl: nullableString(record.portfolio_url ?? record.portfolioUrl),
    resumeStoragePath: nullableString(record.resume_storage_path ?? record.resumeStoragePath),
    resumeSourceDocumentId: nullableString(record.resume_source_document_id ?? record.resumeSourceDocumentId),
    resumeOriginalFilename: nullableString(record.resume_original_filename ?? record.resumeOriginalFilename),
    resumeIngestionStatus: normalizeResumeIngestionStatus(record.resume_ingestion_status ?? record.resumeIngestionStatus),
    resumeIngestionError: nullableString(record.resume_ingestion_error ?? record.resumeIngestionError),
    candidateHubVisibility: normalizeCandidateHubVisibility(record.candidate_hub_visibility ?? record.candidateHubVisibility),
    coverNote: String(record.cover_note ?? record.coverNote ?? ""),
    consentGiven: Boolean(record.consent_given ?? record.consentGiven),
    status: normalizeJobApplicationStatus(record.status),
    source: String(record.source ?? "public_job_board"),
    submittedAt: String(record.submitted_at ?? record.submittedAt ?? ""),
    reviewedByUserId: nullableString(record.reviewed_by_user_id ?? record.reviewedByUserId),
    reviewedAt: nullableString(record.reviewed_at ?? record.reviewedAt),
    metadata: asRecord(record.metadata_json ?? record.metadata),
    createdAt: String(record.created_at ?? record.createdAt ?? ""),
    updatedAt: String(record.updated_at ?? record.updatedAt ?? ""),
  };
}

export function mapRemotePublicJob(row: unknown): PublicJobPosting {
  const record = asRecord(row);
  return {
    id: String(record.id ?? ""),
    slug: String(record.slug ?? ""),
    title: String(record.title ?? ""),
    summary: String(record.summary ?? ""),
    description: String(record.description ?? ""),
    location: String(record.location ?? ""),
    remotePolicy: String(record.remotePolicy ?? record.remote_policy ?? "Unspecified"),
    seniorityLevel: String(record.seniorityLevel ?? record.seniority_level ?? ""),
    employmentType: String(record.employmentType ?? record.employment_type ?? ""),
    requiredSkills: toStringArray(record.requiredSkills ?? record.required_skills),
    preferredSkills: toStringArray(record.preferredSkills ?? record.preferred_skills),
    keyResponsibilities: toStringArray(record.keyResponsibilities ?? record.key_responsibilities),
    applicationDeadline: nullableString(record.applicationDeadline ?? record.application_deadline),
    applyEnabled: record.applyEnabled === false || record.apply_enabled === false ? false : true,
    publishedAt: nullableString(record.publishedAt ?? record.published_at),
  };
}

export function publicApplicationPayload(application: PublicJobApplicationInput) {
  return {
    name: application.name,
    email: application.email,
    phone: application.phone ?? "",
    location: application.location ?? "",
    currentTitle: application.currentTitle ?? "",
    yearsExperience: application.yearsExperience ?? 0,
    seniority: application.seniority ?? "",
    topSkills: application.topSkills ?? [],
    linkedinUrl: application.linkedinUrl ?? "",
    portfolioUrl: application.portfolioUrl ?? "",
    resumeOriginalFilename: application.resumeOriginalFilename ?? "",
    resumeFile: application.resumeFile ?? null,
    coverNote: application.coverNote ?? "",
    consent: application.consent,
    idempotencyKey: application.idempotencyKey ?? "",
  };
}

export function mapPublicReceipt(payload: unknown): PublicJobApplicationReceipt {
  const receipt = asRecord(asRecord(payload).receipt ?? payload);
  return {
    accepted: receipt.accepted !== false,
    duplicate: Boolean(receipt.duplicate),
    applicationId: nullableString(receipt.applicationId ?? receipt.application_id) ?? undefined,
    submittedAt: nullableString(receipt.submittedAt ?? receipt.submitted_at) ?? undefined,
  };
}
