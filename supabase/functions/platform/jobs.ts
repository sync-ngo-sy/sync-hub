import { createAuthedClient } from "../_shared/client.ts";
import {
  buildGuardedSystemPrompt,
  evaluatePlatformAiInput,
  platformAiGuardErrorMessage,
} from "../_shared/aiGuardrails.ts";
import { generateStructuredObject } from "../_shared/llm.ts";
import { buildQueryEmbedding } from "../_shared/queryEmbedding.ts";
import { writeAuditEvent } from "../_shared/platformOps.ts";
import {
  asArray,
  asNumber,
  asRecord,
  asString,
  asStringArray,
  clampInteger,
  describeError,
  type JsonRecord,
  sha256Hex,
} from "../_shared/utils.ts";
import {
  buildJobProfile,
  extractionToJobFields,
  heuristicJobExtraction,
  type JobExtractionPayload,
  jobExtractionSchema,
  normalizeEmploymentType,
  normalizeJobSeniority,
  normalizePublicSlug,
  normalizeRegion,
  normalizeSkillSet,
  normalizeStatus,
  scoreCandidateForJob,
} from "../_shared/jobMatching.ts";
import { getCurrentUserId } from "../_shared/auth.ts";

export const jobPostingSelect = [
  "id",
  "tenant_id",
  "title",
  "employer_name",
  "employer_country",
  "employer_region",
  "job_description",
  "required_skills",
  "preferred_skills",
  "seniority_level",
  "employment_type",
  "posted_date",
  "application_deadline",
  "status",
  "location_info",
  "key_responsibilities",
  "ai_profile",
  "ai_confidence",
  "created_by_user_id",
  "updated_by_user_id",
  "closed_at",
  "closed_by_user_id",
  "is_public",
  "public_slug",
  "public_title",
  "public_summary",
  "public_description",
  "public_location",
  "public_apply_enabled",
  "public_published_at",
  "created_at",
  "updated_at",
].join(", ");

export const matchingRunSelect = [
  "id",
  "tenant_id",
  "job_posting_id",
  "initiated_by_user_id",
  "status",
  "requested_limit",
  "semantic_pool_size",
  "rerank_pool_size",
  "retrieved_count",
  "filtered_count",
  "reranked_count",
  "completed_count",
  "failure_reason",
  "matching_config",
  "job_profile",
  "embedding_provider",
  "embedding_version",
  "started_at",
  "completed_at",
  "created_at",
].join(", ");

export const matchingResultSelect = [
  "id",
  "tenant_id",
  "matching_run_id",
  "job_posting_id",
  "candidate_id",
  "candidate_source_tenant_id",
  "rank",
  "semantic_score",
  "ai_score",
  "final_score",
  "matched_skills",
  "missing_skills",
  "seniority_alignment",
  "experience_summary",
  "match_explanation",
  "scoring_breakdown",
  "hard_filter_payload",
  "candidate_snapshot",
  "created_at",
].join(", ");

export const jobShortlistSelect = [
  "id",
  "tenant_id",
  "job_posting_id",
  "matching_run_id",
  "name",
  "description",
  "owner_user_id",
  "created_at",
  "updated_at",
].join(", ");

export const jobApplicationSelect = [
  "id",
  "tenant_id",
  "job_posting_id",
  "candidate_id",
  "candidate_source_tenant_id",
  "applicant_name",
  "applicant_email",
  "applicant_phone",
  "applicant_location",
  "linkedin_url",
  "portfolio_url",
  "resume_storage_path",
  "resume_source_document_id",
  "resume_original_filename",
  "resume_ingestion_status",
  "resume_ingestion_error",
  "candidate_hub_visibility",
  "cover_note",
  "consent_given",
  "status",
  "source",
  "submitted_at",
  "reviewed_by_user_id",
  "reviewed_at",
  "metadata_json",
  "created_at",
  "updated_at",
].join(", ");

async function extractJobDescription(input: {
  title: string | null;
  jobDescription: string;
  employerRegion: string | null;
}) {
  const fallback = heuristicJobExtraction(input);
  try {
    const result = await generateStructuredObject<JobExtractionPayload>({
      schemaName: "job_description_extraction",
      schema: jobExtractionSchema,
      temperature: 0,
      systemPrompt: buildGuardedSystemPrompt(
        "Extract recruitment job requirements from a job description. Return strict JSON only. Separate required skills from preferred skills. Do not invent skills or employer details. Flag ambiguity in warnings.",
        "Job extraction",
      ),
      userPrompt: JSON.stringify({
        title: input.title,
        employerRegion: input.employerRegion,
        jobDescription: input.jobDescription,
      }),
    });
    if (!result?.object) {
      return {
        payload: fallback,
        provider: "heuristic",
        model: "local-fallback",
      };
    }
    return {
      payload: result.object,
      provider: result.provider,
      model: result.model,
    };
  } catch {
    return {
      payload: fallback,
      provider: "heuristic",
      model: "local-fallback",
    };
  }
}

export async function listJobPostings(
  supabase: ReturnType<typeof createAuthedClient>,
  tenantIds: string[],
  body: JsonRecord,
) {
  let query = supabase
    .from("job_postings")
    .select(jobPostingSelect)
    .order("updated_at", { ascending: false });
  if (tenantIds.length) {
    query = query.in("tenant_id", tenantIds);
  }
  const status = normalizeStatus(body.status);
  if (body.status && status) {
    query = query.eq("status", status);
  }
  const { data, error } = await query.limit(
    clampInteger(body.limit, 100, 1, 500),
  );
  if (error) {
    throw error;
  }
  return data ?? [];
}

export async function getJobPosting(
  supabase: ReturnType<typeof createAuthedClient>,
  jobId: string,
) {
  if (!jobId) {
    throw new Error("job_id is required");
  }
  const { data, error } = await supabase
    .from("job_postings")
    .select(jobPostingSelect)
    .eq("id", jobId)
    .maybeSingle();
  if (error) {
    throw error;
  }
  if (!data) {
    throw new Error(`Job posting ${jobId} was not found.`);
  }
  return data;
}

export async function saveJobPosting(
  supabase: ReturnType<typeof createAuthedClient>,
  body: JsonRecord,
) {
  const userId = await getCurrentUserId(supabase);
  const job = asRecord(body.job);
  const jobId = asString(job.id);
  const existing = jobId
    ? ((await getJobPosting(supabase, jobId)) as unknown as JsonRecord)
    : null;
  const tenantId = asString(job.tenant_id) ??
    asString(job.tenantId) ??
    asString(existing?.tenant_id);
  if (!tenantId) {
    throw new Error("tenant_id is required");
  }

  const status = normalizeStatus(job.status ?? existing?.status);
  const currentStatus = normalizeStatus(existing?.status);
  const title = asString(job.title) ?? asString(existing?.title) ?? "";
  const employerName = asString(job.employer_name) ??
    asString(job.employerName) ??
    asString(existing?.employer_name) ??
    "";
  const employerCountry = asString(job.employer_country) ??
    asString(job.employerCountry) ??
    asString(existing?.employer_country) ??
    "";
  const employerRegion = normalizeRegion(
    job.employer_region ?? job.employerRegion ?? existing?.employer_region,
  );
  const jobDescription = asString(job.job_description) ??
    asString(job.jobDescription) ??
    asString(existing?.job_description) ??
    "";
  const requiredSkills = normalizeSkillSet(
    job.required_skills ?? job.requiredSkills ?? existing?.required_skills,
  );
  const preferredSkills = normalizeSkillSet(
    job.preferred_skills ?? job.preferredSkills ?? existing?.preferred_skills,
  ).filter((skill) => !requiredSkills.includes(skill));
  const seniorityLevel = normalizeJobSeniority(
    job.seniority_level ?? job.seniorityLevel ?? existing?.seniority_level,
  );
  const employmentType = normalizeEmploymentType(
    job.employment_type ?? job.employmentType ?? existing?.employment_type,
  );
  const deadline = asString(job.application_deadline) ??
    asString(job.applicationDeadline) ??
    asString(existing?.application_deadline);
  const isPublic = typeof job.is_public === "boolean"
    ? job.is_public
    : typeof job.isPublic === "boolean"
    ? job.isPublic
    : existing?.is_public === true;
  const publicSlug = normalizePublicSlug(
    job.public_slug ?? job.publicSlug ?? existing?.public_slug,
  );
  const publicTitle = asString(job.public_title) ??
    asString(job.publicTitle) ??
    asString(existing?.public_title) ??
    title;
  const publicSummary = asString(job.public_summary) ??
    asString(job.publicSummary) ??
    asString(existing?.public_summary);
  const publicDescription = asString(job.public_description) ??
    asString(job.publicDescription) ??
    asString(existing?.public_description);
  const publicLocation = asString(job.public_location) ??
    asString(job.publicLocation) ??
    asString(existing?.public_location);
  const publicApplyEnabled = typeof job.public_apply_enabled === "boolean"
    ? job.public_apply_enabled
    : typeof job.publicApplyEnabled === "boolean"
    ? job.publicApplyEnabled
    : existing?.public_apply_enabled !== false;
  if (deadline) {
    const deadlineDate = new Date(`${deadline}T00:00:00Z`);
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    if (Number.isFinite(deadlineDate.getTime()) && deadlineDate < today) {
      throw new Error("application_deadline must be today or a future date");
    }
  }
  if (
    status === "active" &&
    (!title ||
      !employerName ||
      !employerCountry ||
      !employerRegion ||
      !jobDescription ||
      !requiredSkills.length ||
      !seniorityLevel ||
      !employmentType)
  ) {
    throw new Error(
      "Publishing requires title, employer, region, description, required skills, seniority, and employment type.",
    );
  }
  if (
    isPublic &&
    status === "active" &&
    (!publicSlug || !publicTitle || !publicDescription)
  ) {
    throw new Error(
      "Public jobs require a public slug, public title, and redacted public description.",
    );
  }
  const now = new Date().toISOString();

  const payload = {
    tenant_id: tenantId,
    title,
    employer_name: employerName,
    employer_country: employerCountry,
    employer_region: employerRegion ?? "GCC",
    job_description: jobDescription,
    required_skills: requiredSkills,
    preferred_skills: preferredSkills,
    seniority_level: seniorityLevel,
    employment_type: employmentType,
    application_deadline: deadline,
    status,
    posted_date: status === "active" && currentStatus !== "active"
      ? now.slice(0, 10)
      : asString(existing?.posted_date),
    location_info: asRecord(
      job.location_info ?? job.locationInfo ?? existing?.location_info,
    ),
    key_responsibilities: asStringArray(
      job.key_responsibilities ??
        job.keyResponsibilities ??
        existing?.key_responsibilities,
    ).slice(0, 12),
    ai_profile: asRecord(
      job.ai_profile ?? job.aiProfile ?? existing?.ai_profile,
    ),
    ai_confidence: asRecord(
      job.ai_confidence ?? job.aiConfidence ?? existing?.ai_confidence,
    ),
    created_by_user_id: asString(existing?.created_by_user_id) ?? userId,
    updated_by_user_id: userId,
    closed_at: status === "closed" && currentStatus !== "closed"
      ? now
      : status !== "closed"
      ? null
      : asString(existing?.closed_at),
    closed_by_user_id: status === "closed" && currentStatus !== "closed"
      ? userId
      : status !== "closed"
      ? null
      : asString(existing?.closed_by_user_id),
    is_public: isPublic,
    public_slug: publicSlug,
    public_title: publicTitle,
    public_summary: publicSummary,
    public_description: publicDescription,
    public_location: publicLocation,
    public_apply_enabled: publicApplyEnabled,
    public_published_at: isPublic && status === "active"
      ? (asString(existing?.public_published_at) ?? now)
      : null,
  };

  const mutation = jobId
    ? supabase
      .from("job_postings")
      .update(payload)
      .eq("id", jobId)
      .select(jobPostingSelect)
      .single()
    : supabase
      .from("job_postings")
      .insert(payload)
      .select(jobPostingSelect)
      .single();
  const { data, error } = await mutation;
  if (error) {
    throw error;
  }
  const savedJob = asRecord(data);
  const savedJobId = asString(savedJob.id) ?? "";
  await writeAuditEvent(supabase, {
    tenantId,
    actorUserId: userId,
    action: jobId
      ? "JOB_UPDATED"
      : status === "active"
      ? "JOB_PUBLISHED"
      : "JOB_CREATED",
    entityType: "job_posting",
    entityId: savedJobId,
    payload: { status, requiredSkills, preferredSkills },
  });
  return savedJob;
}

export async function extractJobPosting(
  supabase: ReturnType<typeof createAuthedClient>,
  body: JsonRecord,
) {
  const userId = await getCurrentUserId(supabase);
  const jobId = asString(body.job_id);
  const job = jobId
    ? ((await getJobPosting(supabase, jobId)) as unknown as JsonRecord)
    : null;
  const tenantId = asString(body.tenant_id) ?? asString(job?.tenant_id);
  const title = asString(body.title) ?? asString(job?.title);
  const employerRegion = normalizeRegion(
    body.employer_region ?? job?.employer_region,
  );
  const jobDescription = asString(body.job_description) ??
    asString(body.jobDescription) ??
    asString(job?.job_description);
  if (!tenantId || !jobDescription) {
    throw new Error("tenant_id and job_description are required");
  }

  const jobTextGuard = evaluatePlatformAiInput(
    [title, jobDescription].filter(Boolean).join("\n"),
    { injectionOnly: true, maxLength: 50000 },
  );
  if (!jobTextGuard.allowed) {
    throw new Error(platformAiGuardErrorMessage(jobTextGuard));
  }

  const { payload, provider, model } = await extractJobDescription({
    title,
    jobDescription,
    employerRegion,
  });
  const fields = extractionToJobFields(payload);
  const inputHash = await sha256Hex(
    JSON.stringify({ title, employerRegion, jobDescription }),
  );
  const extraction = {
    ...payload,
    ...fields,
    modelProvider: provider,
    modelName: model,
    promptVersion: "job-extraction-v1",
    inputHash,
  };
  const { error } = await supabase.from("job_ai_extractions").insert({
    tenant_id: tenantId,
    job_posting_id: jobId,
    model_provider: provider,
    model_name: model,
    prompt_version: "job-extraction-v1",
    input_hash: inputHash,
    extracted_payload: payload,
    confidence_payload: fields.aiConfidence,
    warnings: payload.warnings,
    created_by_user_id: userId,
  });
  if (error) {
    throw error;
  }
  await writeAuditEvent(supabase, {
    tenantId,
    actorUserId: userId,
    action: "AI_EXTRACTION_COMPLETED",
    entityType: jobId ? "job_posting" : "job_extraction",
    entityId: jobId ?? inputHash,
    payload: {
      modelProvider: provider,
      modelName: model,
      warningCount: payload.warnings.length,
    },
  });
  return extraction;
}

export async function startJobMatchingRun(
  supabase: ReturnType<typeof createAuthedClient>,
  body: JsonRecord,
) {
  const userId = await getCurrentUserId(supabase);
  const jobId = asString(body.job_id);
  const job = (await getJobPosting(
    supabase,
    jobId ?? "",
  )) as unknown as JsonRecord;
  if (normalizeStatus(job.status) !== "active") {
    throw new Error("Only active job postings can be matched.");
  }
  const limit = clampInteger(body.limit, 20, 1, 100);
  const semanticPoolSize = clampInteger(
    body.semantic_pool_size ?? body.semanticPoolSize,
    200,
    limit,
    500,
  );
  const rerankPoolSize = clampInteger(
    body.rerank_pool_size ?? body.rerankPoolSize,
    50,
    limit,
    100,
  );
  const profileText = buildJobProfile(job);
  const embeddingPayload = await buildQueryEmbedding(profileText);
  const matchingConfig = {
    limit,
    semanticPoolSize,
    rerankPoolSize,
    mandatoryCriteria: asRecord(
      body.mandatory_criteria ?? body.mandatoryCriteria,
    ),
  };
  const runInsert = await supabase
    .from("job_matching_runs")
    .insert({
      tenant_id: job.tenant_id,
      job_posting_id: job.id,
      initiated_by_user_id: userId,
      status: "running",
      requested_limit: limit,
      semantic_pool_size: semanticPoolSize,
      rerank_pool_size: rerankPoolSize,
      matching_config: matchingConfig,
      job_profile: {
        text: profileText,
        requiredSkills: job.required_skills,
        preferredSkills: job.preferred_skills,
        seniorityLevel: job.seniority_level,
        employmentType: job.employment_type,
        locationInfo: job.location_info,
      },
      embedding_provider: embeddingPayload.provider,
      embedding_version: embeddingPayload.embeddingVersion,
      started_at: new Date().toISOString(),
    })
    .select(matchingRunSelect)
    .single();
  if (runInsert.error) {
    throw runInsert.error;
  }
  const insertedRun = asRecord(runInsert.data);
  const insertedRunId = asString(insertedRun.id) ?? "";

  await writeAuditEvent(supabase, {
    tenantId: String(job.tenant_id),
    actorUserId: userId,
    action: "MATCHING_RUN_STARTED",
    entityType: "job_matching_run",
    entityId: insertedRunId,
    payload: matchingConfig,
  });

  try {
    const mandatory = asRecord(matchingConfig.mandatoryCriteria);
    const location = asString(asRecord(job.location_info).country) ??
      asString(job.employer_country);
    const rpcPayload = {
      p_q: profileText,
      p_query_embedding: embeddingPayload.embedding,
      p_limit: Math.max(semanticPoolSize, rerankPoolSize),
      p_offset: 0,
      p_role: asString(job.title),
      p_seniority: normalizeSeniorityValue(asString(job.seniority_level)) ??
        null,
      p_min_years: null,
      p_skills: asStringArray(job.required_skills),
      p_embedding_version: null,
      p_rank_version: "job-match-v1",
      p_tenant_ids: null,
      p_filter_role: null,
      p_filter_seniority: normalizeSeniorityValue(
        asString(mandatory.minimum_seniority ?? mandatory.minimumSeniority),
      ) ?? null,
      p_filter_min_years: asNumber(
        mandatory.minimum_years ?? mandatory.minimumYears,
      ),
      p_filter_skills: asStringArray(
        mandatory.required_skills ?? mandatory.requiredSkills,
      ),
      p_filter_companies: [],
      p_filter_location: asString(mandatory.location) ?? null,
    };
    let { data: rawCandidates, error } = await supabase.rpc(
      "search_candidates_with_rate_v1",
      rpcPayload,
    );
    if (
      error &&
      `${error.message}`.includes("search_candidates_with_rate_v1")
    ) {
      const fallback = await supabase.rpc("search_candidates_v1", rpcPayload);
      rawCandidates = fallback.data;
      error = fallback.error;
    }
    if (error) {
      throw error;
    }

    const candidates = ((rawCandidates ?? []) as JsonRecord[])
      .filter((candidate) => {
        if (
          !location ||
          !asString(mandatory.location_required ?? mandatory.locationRequired)
        ) {
          return true;
        }
        return String(candidate.location ?? "")
          .toLowerCase()
          .includes(location.toLowerCase());
      })
      .slice(0, rerankPoolSize)
      .map((candidate) => {
        const score = scoreCandidateForJob(candidate, job);
        return { candidate, score };
      })
      .sort((left, right) => right.score.finalScore - left.score.finalScore)
      .slice(0, limit);

    if (candidates.length) {
      const rows = candidates.map(({ candidate, score }, index) => ({
        tenant_id: job.tenant_id,
        matching_run_id: insertedRunId,
        job_posting_id: job.id,
        candidate_id: candidate.candidate_id,
        candidate_source_tenant_id: asString(candidate.tenant_id) ??
          asString(job.tenant_id),
        rank: index + 1,
        semantic_score: score.semanticScore,
        ai_score: score.aiScore,
        final_score: score.finalScore,
        matched_skills: score.matchedSkills,
        missing_skills: score.missingSkills,
        seniority_alignment: score.seniorityAlignment,
        experience_summary: score.experienceSummary,
        match_explanation: score.matchExplanation,
        scoring_breakdown: score.scoringBreakdown,
        hard_filter_payload: {
          mandatoryCriteria: matchingConfig.mandatoryCriteria,
          evidence: candidate.evidence,
          matchedFilters: candidate.matched_filters,
        },
        candidate_snapshot: {
          tenant_id: candidate.tenant_id,
          candidate_id: candidate.candidate_id,
          name: candidate.name,
          current_title: candidate.current_title,
          location: candidate.location,
          years_experience: candidate.years_experience,
          seniority: candidate.seniority,
          primary_role: candidate.primary_role,
          summary_short: candidate.summary_short,
          match_rate: candidate.match_rate,
          subscores: candidate.subscores,
        },
      }));
      const insertResults = await supabase
        .from("job_matching_results")
        .insert(rows);
      if (insertResults.error) {
        throw insertResults.error;
      }
    }

    const completedAt = new Date().toISOString();
    const update = await supabase
      .from("job_matching_runs")
      .update({
        status: "completed",
        retrieved_count: (rawCandidates ?? []).length,
        filtered_count: Math.max(
          0,
          (rawCandidates ?? []).length - candidates.length,
        ),
        reranked_count: Math.min((rawCandidates ?? []).length, rerankPoolSize),
        completed_count: candidates.length,
        completed_at: completedAt,
      })
      .eq("id", insertedRunId)
      .select(matchingRunSelect)
      .single();
    if (update.error) {
      throw update.error;
    }
    await writeAuditEvent(supabase, {
      tenantId: String(job.tenant_id),
      actorUserId: userId,
      action: "MATCHING_RUN_COMPLETED",
      entityType: "job_matching_run",
      entityId: insertedRunId,
      payload: {
        completedCount: candidates.length,
        retrievedCount: (rawCandidates ?? []).length,
      },
    });
    return getMatchingRun(supabase, insertedRunId);
  } catch (error) {
    await supabase
      .from("job_matching_runs")
      .update({
        status: "failed",
        failure_reason: describeError(error),
        completed_at: new Date().toISOString(),
      })
      .eq("id", insertedRunId);
    await writeAuditEvent(supabase, {
      tenantId: String(job.tenant_id),
      actorUserId: userId,
      action: "MATCHING_RUN_FAILED",
      entityType: "job_matching_run",
      entityId: insertedRunId,
      payload: { error: describeError(error) },
    });
    throw error;
  }
}

export async function listMatchingRuns(
  supabase: ReturnType<typeof createAuthedClient>,
  body: JsonRecord,
) {
  const jobId = asString(body.job_id);
  if (!jobId) {
    throw new Error("job_id is required");
  }
  const { data, error } = await supabase
    .from("job_matching_runs")
    .select(matchingRunSelect)
    .eq("job_posting_id", jobId)
    .order("created_at", { ascending: false })
    .limit(clampInteger(body.limit, 50, 1, 200));
  if (error) {
    throw error;
  }
  return data ?? [];
}

export async function getMatchingRun(
  supabase: ReturnType<typeof createAuthedClient>,
  runId: string,
) {
  if (!runId) {
    throw new Error("run_id is required");
  }
  const [runResult, resultsResult] = await Promise.all([
    supabase
      .from("job_matching_runs")
      .select(matchingRunSelect)
      .eq("id", runId)
      .maybeSingle(),
    supabase
      .from("job_matching_results")
      .select(matchingResultSelect)
      .eq("matching_run_id", runId)
      .order("rank", { ascending: true }),
  ]);
  if (runResult.error) {
    throw runResult.error;
  }
  if (!runResult.data) {
    throw new Error(`Matching run ${runId} was not found.`);
  }
  if (resultsResult.error) {
    throw resultsResult.error;
  }
  return {
    run: runResult.data,
    results: resultsResult.data ?? [],
  };
}

export async function listJobApplications(
  supabase: ReturnType<typeof createAuthedClient>,
  body: JsonRecord,
) {
  const jobId = asString(body.job_id);
  if (!jobId) {
    throw new Error("job_id is required");
  }
  const { data, error } = await supabase
    .from("job_applications")
    .select(jobApplicationSelect)
    .eq("job_posting_id", jobId)
    .order("submitted_at", { ascending: false })
    .limit(clampInteger(body.limit, 100, 1, 500));
  if (error) {
    throw error;
  }
  return data ?? [];
}

function normalizeApplicationStatus(value: unknown) {
  const status = String(value ?? "")
    .trim()
    .toLowerCase();
  return ["new", "reviewing", "shortlisted", "rejected", "withdrawn"].includes(
      status,
    )
    ? status
    : null;
}

export async function updateJobApplicationStatus(
  supabase: ReturnType<typeof createAuthedClient>,
  body: JsonRecord,
) {
  const userId = await getCurrentUserId(supabase);
  const applicationId = asString(body.application_id);
  const status = normalizeApplicationStatus(body.status);
  if (!applicationId || !status) {
    throw new Error("application_id and valid status are required");
  }
  const { data, error } = await supabase
    .from("job_applications")
    .update({
      status,
      reviewed_by_user_id: userId,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", applicationId)
    .select(jobApplicationSelect)
    .single();
  if (error) {
    throw error;
  }
  const application = asRecord(data);
  await supabase.from("job_application_events").insert({
    tenant_id: application.tenant_id,
    application_id: applicationId,
    actor_user_id: userId,
    event_type: "STATUS_UPDATED",
    payload: { status },
  });
  return data;
}

export async function listJobShortlists(
  supabase: ReturnType<typeof createAuthedClient>,
  body: JsonRecord,
) {
  const jobId = asString(body.job_id);
  if (!jobId) {
    throw new Error("job_id is required");
  }
  const { data, error } = await supabase
    .from("job_shortlists")
    .select(jobShortlistSelect)
    .eq("job_posting_id", jobId)
    .order("created_at", { ascending: false });
  if (error) {
    throw error;
  }
  return data ?? [];
}

export async function getJobShortlist(
  supabase: ReturnType<typeof createAuthedClient>,
  shortlistId: string,
) {
  if (!shortlistId) {
    throw new Error("shortlist_id is required");
  }
  const [shortlistResult, candidatesResult] = await Promise.all([
    supabase
      .from("job_shortlists")
      .select(jobShortlistSelect)
      .eq("id", shortlistId)
      .maybeSingle(),
    supabase
      .from("job_shortlist_candidates")
      .select("*")
      .eq("shortlist_id", shortlistId)
      .order("saved_rank", { ascending: true }),
  ]);
  if (shortlistResult.error) {
    throw shortlistResult.error;
  }
  if (!shortlistResult.data) {
    throw new Error(`Shortlist ${shortlistId} was not found.`);
  }
  if (candidatesResult.error) {
    throw candidatesResult.error;
  }
  return {
    shortlist: shortlistResult.data,
    candidates: candidatesResult.data ?? [],
  };
}

export async function saveJobShortlist(
  supabase: ReturnType<typeof createAuthedClient>,
  body: JsonRecord,
) {
  const userId = await getCurrentUserId(supabase);
  const jobId = asString(body.job_id);
  const runId = asString(body.run_id);
  const name = asString(body.name);
  if (!jobId || !name) {
    throw new Error("job_id and name are required");
  }
  const job = (await getJobPosting(supabase, jobId)) as unknown as JsonRecord;
  const runDetail = runId ? await getMatchingRun(supabase, runId) : null;
  const inputCandidates = asStringArray(body.candidate_ids);
  const resultRows = (asArray(runDetail?.results) as JsonRecord[]).filter(
    (result) =>
      !inputCandidates.length ||
      inputCandidates.includes(String(result.candidate_id)),
  );
  const shortlistResult = await supabase
    .from("job_shortlists")
    .insert({
      tenant_id: job.tenant_id,
      job_posting_id: jobId,
      matching_run_id: runId,
      name,
      description: asString(body.description) ?? "",
      owner_user_id: userId,
    })
    .select(jobShortlistSelect)
    .single();
  if (shortlistResult.error) {
    throw shortlistResult.error;
  }
  const savedShortlist = asRecord(shortlistResult.data);
  const savedShortlistId = asString(savedShortlist.id) ?? "";
  if (resultRows.length) {
    const insert = await supabase.from("job_shortlist_candidates").insert(
      resultRows.map((result) => ({
        tenant_id: job.tenant_id,
        shortlist_id: savedShortlistId,
        candidate_id: result.candidate_id,
        candidate_source_tenant_id:
          asString(result.candidate_source_tenant_id) ??
            asString(asRecord(result.candidate_snapshot).tenant_id) ??
            asString(job.tenant_id),
        saved_rank: result.rank,
        saved_score: result.final_score,
        saved_result_payload: result,
        added_by_user_id: userId,
      })),
    );
    if (insert.error) {
      throw insert.error;
    }
  }
  await writeAuditEvent(supabase, {
    tenantId: String(job.tenant_id),
    actorUserId: userId,
    action: "SHORTLIST_CREATED",
    entityType: "job_shortlist",
    entityId: savedShortlistId,
    payload: { jobId, runId, candidateCount: resultRows.length },
  });
  return getJobShortlist(supabase, savedShortlistId);
}
