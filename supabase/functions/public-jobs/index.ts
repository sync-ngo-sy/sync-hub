import { corsHeaders } from "../_shared/cors.ts";
import { createServiceClient } from "../_shared/platformProvisioning.ts";
import { asRecord, asString, sha256Hex } from "../_shared/utils.ts";
import { type JsonRecord } from "./types.ts";
import { RESUME_BUCKET } from "./constants.ts";
import {
  isDeadlineOpen,
  jsonResponse,
  publicJob,
  publicJobSelect,
  sha256Bytes,
} from "./helpers.ts";
import { assertApplication, upsertCandidateShell } from "./application.ts";

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
        jobs: (data ?? []).map((row: Record<string, unknown>) =>
          publicJob(asRecord(row))
        ),
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
              source_uri: `supabase:${RESUME_BUCKET}/${resumeStoragePath}`,
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
            source_path: `supabase:${RESUME_BUCKET}/${resumeStoragePath}`,
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
