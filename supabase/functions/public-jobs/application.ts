import { createServiceClient } from "../_shared/platformProvisioning.ts";
import { asRecord, asString, uniqueStrings } from "../_shared/utils.ts";
import { type JsonRecord } from "./types.ts";
import { MAX_RESUME_BYTES } from "./constants.ts";
import {
  asStringArray,
  boundedYears,
  contentTypeForFile,
  decodeBase64,
  safeFileName,
  skillSlug,
  splitList,
} from "./helpers.ts";

export function parseResumeFile(input: JsonRecord) {
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

export function assertApplication(input: JsonRecord) {
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

export async function upsertCandidateShell(
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
