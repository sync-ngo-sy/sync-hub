import { corsHeaders } from "../_shared/cors.ts";
import { createServiceClient } from "../_shared/platformProvisioning.ts";

type JsonRecord = Record<string, unknown>;

const RESUME_BUCKET = Deno.env.get("SUPABASE_STORAGE_BUCKET") ?? "cv-originals";
const MAX_RESUME_BYTES = 10 * 1024 * 1024;
const ALLOWED_RESUME_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
]);

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function asStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => typeof item === "string" ? item.trim() : "").filter(
      Boolean,
    ).slice(0, 24)
    : [];
}

function splitList(value: unknown) {
  if (Array.isArray(value)) {
    return asStringArray(value);
  }
  const text = asString(value);
  if (!text) {
    return [];
  }
  return text
    .split(/[,;\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 24);
}

function uniqueStrings(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = typeof value === "string" ? value.trim() : "";
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

function skillSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9+#.]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
}

function boundedYears(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return 0;
  }
  return Math.min(80, Math.round(numeric * 10) / 10);
}

function isDeadlineOpen(value: unknown) {
  const deadline = asString(value);
  return !deadline || deadline >= new Date().toISOString().slice(0, 10);
}

function publicJob(row: JsonRecord) {
  const locationInfo = asRecord(row.location_info);
  return {
    id: String(row.public_slug ?? ""),
    slug: String(row.public_slug ?? ""),
    title: String(row.public_title ?? row.title ?? ""),
    summary: String(row.public_summary ?? ""),
    description: String(row.public_description ?? ""),
    location: String(
      row.public_location ?? locationInfo.city ?? locationInfo.country ?? "",
    ),
    remotePolicy: String(
      locationInfo.remotePolicy ?? locationInfo.remote_policy ?? "Unspecified",
    ),
    seniorityLevel: String(row.seniority_level ?? ""),
    employmentType: String(row.employment_type ?? ""),
    requiredSkills: asStringArray(row.required_skills),
    preferredSkills: asStringArray(row.preferred_skills),
    keyResponsibilities: asStringArray(row.key_responsibilities),
    applicationDeadline: asString(row.application_deadline),
    applyEnabled: row.public_apply_enabled !== false &&
      isDeadlineOpen(row.application_deadline),
    publishedAt: asString(row.public_published_at),
  };
}

function publicJobSelect() {
  return [
    "id",
    "title",
    "public_slug",
    "public_title",
    "public_summary",
    "public_description",
    "public_location",
    "public_apply_enabled",
    "public_published_at",
    "application_deadline",
    "seniority_level",
    "employment_type",
    "required_skills",
    "preferred_skills",
    "key_responsibilities",
    "location_info",
  ].join(", ");
}

async function sha256Hex(value: string) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(bytes)).map((byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

async function sha256Bytes(bytes: Uint8Array) {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const hash = await crypto.subtle.digest("SHA-256", copy.buffer);
  return Array.from(new Uint8Array(hash)).map((byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

function safeFileName(value: string) {
  const normalized = value
    .trim()
    .replace(/[/\\]/g, "-")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return (normalized || "candidate-cv.pdf").slice(0, 160);
}

function contentTypeForFile(fileName: string, contentType: string | null) {
  if (contentType && ALLOWED_RESUME_TYPES.has(contentType)) {
    return contentType;
  }
  const lowerName = fileName.toLowerCase();
  if (lowerName.endsWith(".pdf")) {
    return "application/pdf";
  }
  if (lowerName.endsWith(".docx")) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  if (lowerName.endsWith(".txt")) {
    return "text/plain";
  }
  return null;
}

function decodeBase64(value: string) {
  const normalized = value.includes(",") ? value.split(",").pop() ?? "" : value;
  const binary = atob(normalized.replace(/\s/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function parseResumeFile(input: JsonRecord) {
  const resumeFile = asRecord(input.resumeFile ?? input.resume_file);
  const base64 = asString(resumeFile.base64);
  if (!base64) {
    return null;
  }
  const fileName = safeFileName(
    asString(resumeFile.fileName ?? resumeFile.file_name) ?? "candidate-cv.pdf",
  );
  const contentType = contentTypeForFile(
    fileName,
    asString(resumeFile.contentType ?? resumeFile.content_type),
  );
  if (!contentType) {
    throw new Error("Upload a PDF, DOCX, or TXT CV.");
  }
  const bytes = decodeBase64(base64);
  const declaredSize = Number(
    resumeFile.sizeBytes ?? resumeFile.size_bytes ?? bytes.byteLength,
  );
  if (
    !Number.isFinite(declaredSize) || declaredSize <= 0 ||
    declaredSize > MAX_RESUME_BYTES || bytes.byteLength > MAX_RESUME_BYTES
  ) {
    throw new Error("CV upload must be 10 MB or smaller.");
  }
  if (bytes.byteLength === 0) {
    throw new Error("CV upload is empty.");
  }
  return { fileName, contentType, bytes };
}

async function upsertCandidateShell(
  supabase: ReturnType<typeof createServiceClient>,
  jobRecord: JsonRecord,
  application: ReturnType<typeof assertApplication>,
  applicationId: string,
  preferredCandidateId: string | null,
  resumeSourceDocumentId: string | null,
) {
  const tenantId = String(jobRecord.tenant_id ?? "");
  let existingCandidate: JsonRecord | null = null;

  if (preferredCandidateId) {
    const { data, error } = await supabase
      .from("candidates")
      .select(
        "id, current_title, years_experience, seniority, primary_role, top_skills, links, latest_document_id, summary_short, status, metadata_json",
      )
      .eq("tenant_id", tenantId)
      .eq("id", preferredCandidateId)
      .maybeSingle();
    if (error) throw error;
    existingCandidate = data ? asRecord(data) : null;
  }

  if (!existingCandidate) {
    const { data, error } = await supabase
      .from("candidates")
      .select(
        "id, current_title, years_experience, seniority, primary_role, top_skills, links, latest_document_id, summary_short, status, metadata_json",
      )
      .eq("tenant_id", tenantId)
      .eq("email", application.email)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    existingCandidate = data ? asRecord(data) : null;
  }

  const candidateId = asString(existingCandidate?.id) ?? crypto.randomUUID();
  const existingSkills = asStringArray(existingCandidate?.top_skills);
  const topSkills = uniqueStrings([...application.topSkills, ...existingSkills])
    .slice(0, 24);
  const currentTitle = application.currentTitle ||
    asString(existingCandidate?.current_title) || "Public job applicant";
  const yearsExperience = application.yearsExperience ??
    Number(existingCandidate?.years_experience ?? 0);
  const seniority = application.seniority ||
    asString(existingCandidate?.seniority) || "unclassified";
  const links = uniqueStrings([
    ...asStringArray(existingCandidate?.links),
    application.linkedinUrl,
    application.portfolioUrl,
  ]).slice(0, 12);
  const jobTitle = String(
    jobRecord.public_title ?? jobRecord.title ?? "public role",
  );
  const coverSummary = application.coverNote
    ? ` ${application.coverNote.slice(0, 220)}`
    : "";
  const summaryShort = asString(existingCandidate?.summary_short) ??
    `Applied for ${jobTitle}.${coverSummary}`;
  const metadata = {
    ...asRecord(existingCandidate?.metadata_json),
    public_application: {
      application_id: applicationId,
      job_posting_id: jobRecord.id,
      job_title: jobTitle,
      submitted_from: "public_job_board",
      source_document_id: resumeSourceDocumentId,
    },
  };
  const candidatePayload = {
    id: candidateId,
    tenant_id: tenantId,
    name: application.name,
    headline: currentTitle,
    current_title: currentTitle,
    location: application.location,
    years_experience: boundedYears(yearsExperience),
    seniority,
    primary_role: currentTitle,
    top_skills: topSkills,
    email: application.email,
    phone: application.phone,
    links,
    latest_document_id: resumeSourceDocumentId ??
      asString(existingCandidate?.latest_document_id),
    summary_short: summaryShort,
    status: asString(existingCandidate?.status) === "completed"
      ? "completed"
      : "application_submitted",
    metadata_json: metadata,
    hub_visibility: "platform",
  };

  const { error: upsertError } = await supabase
    .from("candidates")
    .upsert(candidatePayload, { onConflict: "id" });
  if (upsertError) throw upsertError;

  if (topSkills.length) {
    const skillRows = topSkills
      .map((skill) => ({ skill, slug: skillSlug(skill) }))
      .filter((skill) => skill.slug)
      .map(({ skill, slug }) => ({
        id: crypto.randomUUID(),
        tenant_id: tenantId,
        candidate_id: candidateId,
        skill_slug: slug,
        canonical_skill: skill,
        evidence: {
          source: "public_application_form",
          job_application_id: applicationId,
        },
      }));
    if (skillRows.length) {
      const { error: skillError } = await supabase
        .from("candidate_skill_map")
        .upsert(skillRows, {
          onConflict: "tenant_id,candidate_id,skill_slug",
          ignoreDuplicates: true,
        });
      if (skillError) throw skillError;
    }
  }

  if (resumeSourceDocumentId) {
    const { error: sourceError } = await supabase
      .from("source_documents")
      .update({ candidate_id: candidateId })
      .eq("tenant_id", tenantId)
      .eq("id", resumeSourceDocumentId)
      .is("candidate_id", null);
    if (sourceError) throw sourceError;
  }

  return {
    candidateId,
    created: !existingCandidate,
  };
}

function assertApplication(input: JsonRecord) {
  const name = asString(input.name);
  const email = asString(input.email)?.toLowerCase();
  const consent = input.consent === true || input.consentGiven === true;
  const topSkills = splitList(input.topSkills ?? input.top_skills);
  const currentTitle =
    asString(input.currentTitle ?? input.current_title)?.slice(0, 180) ?? "";
  const seniority = asString(input.seniority)?.slice(0, 80) ?? "";
  if (!name || name.length > 160) {
    throw new Error("Applicant name is required.");
  }
  if (
    !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254
  ) {
    throw new Error("A valid email address is required.");
  }
  if (!consent) {
    throw new Error("Consent is required before submitting an application.");
  }
  if (!currentTitle) {
    throw new Error("Current title is required.");
  }
  if (!topSkills.length) {
    throw new Error("At least one skill is required.");
  }
  const resumeFile = parseResumeFile(input);
  return {
    name,
    email,
    phone: asString(input.phone)?.slice(0, 80) ?? null,
    location: asString(input.location)?.slice(0, 160) ?? null,
    currentTitle,
    yearsExperience: boundedYears(
      input.yearsExperience ?? input.years_experience,
    ),
    seniority,
    topSkills,
    linkedinUrl:
      asString(input.linkedinUrl ?? input.linkedin_url)?.slice(0, 500) ?? null,
    portfolioUrl:
      asString(input.portfolioUrl ?? input.portfolio_url)?.slice(0, 500) ??
        null,
    coverNote: asString(input.coverNote ?? input.cover_note)?.slice(0, 4000) ??
      "",
    resumeOriginalFilename: resumeFile?.fileName ??
      asString(input.resumeOriginalFilename ?? input.resume_original_filename)
        ?.slice(0, 255) ??
      null,
    resumeFile,
    idempotencyKey:
      asString(input.idempotencyKey ?? input.idempotency_key)?.slice(0, 120) ??
        null,
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
    const body = await req.json() as JsonRecord;
    const action = asString(body.action);
    const supabase = createServiceClient();

    if (action === "list") {
      const { data, error } = await supabase
        .from("job_postings")
        .select(publicJobSelect())
        .eq("status", "active")
        .eq("is_public", true)
        .not("public_slug", "is", null)
        .order("public_published_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return jsonResponse(200, {
        jobs: (data ?? []).map((row) => publicJob(asRecord(row))),
      });
    }

    const slug = asString(body.slug);
    if (!slug) {
      throw new Error("slug is required");
    }

    const { data: job, error: jobError } = await supabase
      .from("job_postings")
      .select(`tenant_id, ${publicJobSelect()}`)
      .eq("public_slug", slug)
      .eq("status", "active")
      .eq("is_public", true)
      .maybeSingle();
    if (jobError) throw jobError;
    if (!job) {
      return jsonResponse(404, { error: "job_not_found" });
    }

    if (action === "detail") {
      return jsonResponse(200, { job: publicJob(asRecord(job)) });
    }

    if (action === "apply") {
      const jobRecord = asRecord(job);
      if (
        jobRecord.public_apply_enabled === false ||
        !isDeadlineOpen(jobRecord.application_deadline)
      ) {
        return jsonResponse(409, { error: "applications_closed" });
      }
      const application = assertApplication(asRecord(body.application));
      const { data: existingApplication, error: existingError } = await supabase
        .from("job_applications")
        .select("id, submitted_at")
        .eq("job_posting_id", jobRecord.id)
        .eq("applicant_email", application.email)
        .eq("source", "public_job_board")
        .neq("status", "withdrawn")
        .order("submitted_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (existingError) throw existingError;
      if (existingApplication) {
        return jsonResponse(200, {
          receipt: {
            accepted: true,
            duplicate: true,
            applicationId: existingApplication.id,
            submittedAt: existingApplication.submitted_at,
          },
        });
      }
      const ipHash = await sha256Hex(
        req.headers.get("x-forwarded-for") ??
          req.headers.get("cf-connecting-ip") ?? "",
      );
      const userAgentHash = await sha256Hex(
        req.headers.get("user-agent") ?? "",
      );
      const applicationId = crypto.randomUUID();
      let resumeStoragePath: string | null = null;
      let resumeSourceDocumentId: string | null = null;
      let resumeIngestionStatus: "not_uploaded" | "queued" | "parsed" =
        "not_uploaded";
      let linkedCandidateId: string | null = null;
      let createdCandidateId: string | null = null;
      let resumeSha256: string | null = null;
      let uploadedResumeStoragePath: string | null = null;
      let insertedResumeSourceDocumentId: string | null = null;

      if (application.resumeFile) {
        resumeSha256 = await sha256Bytes(application.resumeFile.bytes);
        resumeStoragePath =
          `${jobRecord.tenant_id}/public-applications/${jobRecord.id}/${applicationId}/${application.resumeFile.fileName}`;
        const uploadResult = await supabase.storage
          .from(RESUME_BUCKET)
          .upload(resumeStoragePath, application.resumeFile.bytes, {
            contentType: application.resumeFile.contentType,
            upsert: false,
          });
        if (uploadResult.error) {
          throw uploadResult.error;
        }
        uploadedResumeStoragePath = resumeStoragePath;

        const existingSource = await supabase
          .from("source_documents")
          .select("id, candidate_id")
          .eq("tenant_id", jobRecord.tenant_id)
          .eq("document_sha256", resumeSha256)
          .maybeSingle();
        if (existingSource.error) {
          await supabase.storage.from(RESUME_BUCKET).remove([
            resumeStoragePath,
          ]);
          throw existingSource.error;
        }

        if (existingSource.data?.id) {
          resumeSourceDocumentId = existingSource.data.id;
          const sourceCandidateId = asString(existingSource.data.candidate_id);
          const candidateResult = await upsertCandidateShell(
            supabase,
            jobRecord,
            application,
            applicationId,
            sourceCandidateId,
            resumeSourceDocumentId,
          );
          linkedCandidateId = candidateResult.candidateId;
          createdCandidateId = candidateResult.created
            ? linkedCandidateId
            : createdCandidateId;
          resumeIngestionStatus = sourceCandidateId ? "parsed" : "queued";
        } else {
          resumeSourceDocumentId = crypto.randomUUID();
          const candidateResult = await upsertCandidateShell(
            supabase,
            jobRecord,
            application,
            applicationId,
            null,
            resumeSourceDocumentId,
          );
          linkedCandidateId = candidateResult.candidateId;
          createdCandidateId = candidateResult.created
            ? linkedCandidateId
            : createdCandidateId;
          const sourceInsert = await supabase
            .from("source_documents")
            .insert({
              id: resumeSourceDocumentId,
              tenant_id: jobRecord.tenant_id,
              candidate_id: linkedCandidateId,
              source_type: "public_job_application",
              original_filename: application.resumeFile.fileName,
              mime_type: application.resumeFile.contentType,
              document_sha256: resumeSha256,
              source_uri: `supabase://${RESUME_BUCKET}/${resumeStoragePath}`,
              storage_path: resumeStoragePath,
              uploaded_by: application.email,
              metadata_json: {
                source: "public_job_application",
                job_posting_id: jobRecord.id,
                application_id: applicationId,
                candidate_hub_visibility: "platform",
              },
            });
          if (sourceInsert.error) {
            await supabase.storage.from(RESUME_BUCKET).remove([
              resumeStoragePath,
            ]);
            if (createdCandidateId) {
              await supabase.from("candidates").delete().eq(
                "id",
                createdCandidateId,
              ).eq("tenant_id", jobRecord.tenant_id);
            }
            throw sourceInsert.error;
          }
          insertedResumeSourceDocumentId = resumeSourceDocumentId;
          resumeIngestionStatus = "queued";
        }
      }

      if (!linkedCandidateId) {
        const candidateResult = await upsertCandidateShell(
          supabase,
          jobRecord,
          application,
          applicationId,
          null,
          resumeSourceDocumentId,
        );
        linkedCandidateId = candidateResult.candidateId;
        createdCandidateId = candidateResult.created
          ? linkedCandidateId
          : createdCandidateId;
      }

      const { data, error } = await supabase
        .from("job_applications")
        .insert({
          id: applicationId,
          tenant_id: jobRecord.tenant_id,
          job_posting_id: jobRecord.id,
          candidate_id: linkedCandidateId,
          candidate_source_tenant_id: jobRecord.tenant_id,
          applicant_name: application.name,
          applicant_email: application.email,
          applicant_phone: application.phone,
          applicant_location: application.location,
          linkedin_url: application.linkedinUrl,
          portfolio_url: application.portfolioUrl,
          resume_storage_path: resumeStoragePath,
          resume_source_document_id: resumeSourceDocumentId,
          resume_original_filename: application.resumeOriginalFilename,
          resume_ingestion_status: resumeIngestionStatus,
          candidate_hub_visibility: "platform",
          cover_note: application.coverNote,
          consent_given: true,
          source: "public_job_board",
          idempotency_key: application.idempotencyKey,
          ip_hash: ipHash,
          user_agent_hash: userAgentHash,
        })
        .select("id, submitted_at")
        .single();
      if (error && error.code === "23505") {
        if (insertedResumeSourceDocumentId) {
          await supabase.from("source_documents").delete().eq(
            "id",
            insertedResumeSourceDocumentId,
          );
        }
        if (uploadedResumeStoragePath) {
          await supabase.storage.from(RESUME_BUCKET).remove([
            uploadedResumeStoragePath,
          ]);
        }
        if (createdCandidateId) {
          await supabase.from("candidates").delete().eq(
            "id",
            createdCandidateId,
          ).eq("tenant_id", jobRecord.tenant_id);
        }
        let duplicate = await supabase
          .from("job_applications")
          .select("id, submitted_at")
          .eq("job_posting_id", jobRecord.id)
          .eq("applicant_email", application.email)
          .eq("source", "public_job_board")
          .neq("status", "withdrawn")
          .order("submitted_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (duplicate.error) {
          throw duplicate.error;
        }
        if (!duplicate.data && application.idempotencyKey) {
          duplicate = await supabase
            .from("job_applications")
            .select("id, submitted_at")
            .eq("job_posting_id", jobRecord.id)
            .eq("idempotency_key", application.idempotencyKey)
            .eq("source", "public_job_board")
            .neq("status", "withdrawn")
            .order("submitted_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (duplicate.error) {
            throw duplicate.error;
          }
        }
        if (!duplicate.data?.id) {
          throw error;
        }
        return jsonResponse(200, {
          receipt: {
            accepted: true,
            duplicate: true,
            applicationId: duplicate.data?.id,
            submittedAt: duplicate.data?.submitted_at,
          },
        });
      }
      if (error) throw error;

      if (
        resumeSourceDocumentId && resumeStoragePath && resumeSha256 &&
        resumeIngestionStatus === "queued"
      ) {
        const { error: processingError } = await supabase
          .from("processing_runs")
          .insert({
            id: crypto.randomUUID(),
            tenant_id: jobRecord.tenant_id,
            candidate_id: linkedCandidateId,
            source_document_id: resumeSourceDocumentId,
            ingestion_run_id: crypto.randomUUID(),
            status: "queued",
            input_hash: await sha256Hex(
              `${jobRecord.tenant_id}:${resumeSourceDocumentId}:${applicationId}:public_job_application`,
            ),
            source_path: `supabase://${RESUME_BUCKET}/${resumeStoragePath}`,
            source_sha256: resumeSha256,
            parser_version: "queued-public-application",
            model_version: "queued-public-application",
            prompt_version: "queued-public-application",
            chunk_version: "queued-public-application",
            embedding_version: "queued-public-application",
            warnings: [],
            metadata_json: {
              source: "public_job_application",
              job_application_id: data.id,
              job_posting_id: jobRecord.id,
              storage_bucket: RESUME_BUCKET,
              storage_path: resumeStoragePath,
              candidate_hub_visibility: "platform",
            },
          });
        if (processingError) {
          throw processingError;
        }
      }

      const { error: eventError } = await supabase
        .from("job_application_events")
        .insert({
          tenant_id: jobRecord.tenant_id,
          application_id: data.id,
          actor_user_id: null,
          event_type: "APPLICATION_SUBMITTED",
          payload: {
            source: "public_job_board",
            candidate_id: linkedCandidateId,
          },
        });
      if (eventError) throw eventError;
      const { error: refreshError } = await supabase.rpc(
        "refresh_candidate_search_cache_v1",
      );
      if (refreshError) {
        console.error("candidate_search_cache_refresh_failed", refreshError);
      }
      if (resumeSourceDocumentId && resumeIngestionStatus === "queued") {
        const { error: queueEventError } = await supabase
          .from("job_application_events")
          .insert({
            tenant_id: jobRecord.tenant_id,
            application_id: data.id,
            actor_user_id: null,
            event_type: "CV_INGESTION_QUEUED",
            payload: {
              source_document_id: resumeSourceDocumentId,
              storage_path: resumeStoragePath,
              candidate_hub_visibility: "platform",
            },
          });
        if (queueEventError) {
          throw queueEventError;
        }
      }
      return jsonResponse(200, {
        receipt: {
          accepted: true,
          applicationId: data.id,
          submittedAt: data.submitted_at,
        },
      });
    }

    return jsonResponse(400, { error: "unknown_action" });
  } catch (error) {
    console.error("public_jobs_failed", error);
    return jsonResponse(400, {
      error: "public_jobs_failed",
      details: "An unexpected error occurred.",
    });
  }
});
