import { execFileSync } from "node:child_process";

const TEST_SLUG = "senior-react-developer-dubai";

function parseStatusEnv() {
  const values = {};
  const output = execFileSync("supabase", ["status", "-o", "env"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)="?([^"]*)"?$/);
    if (match) {
      values[match[1]] = match[2];
    }
  }
  return values;
}

const statusEnv = parseStatusEnv();
const apiUrl = process.env.SUPABASE_URL ?? statusEnv.API_URL ?? "http://127.0.0.1:54321";
const restUrl = process.env.SUPABASE_REST_URL ?? statusEnv.REST_URL ?? `${apiUrl.replace(/\/+$/, "")}/rest/v1`;
const functionsUrl = process.env.SUPABASE_FUNCTIONS_URL ?? `${apiUrl.replace(/\/+$/, "")}/functions/v1`;
const publicKey = process.env.SUPABASE_ANON_KEY ?? statusEnv.PUBLISHABLE_KEY ?? statusEnv.ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? statusEnv.SECRET_KEY ?? statusEnv.SERVICE_ROLE_KEY;

if (!publicKey || !serviceRoleKey) {
  throw new Error("Local Supabase keys were not found. Start Supabase first, or set SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY.");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function requestRest(path, { key = serviceRoleKey, method = "GET", body, headers = {} } = {}) {
  const response = await fetch(`${restUrl}${path}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const message = payload?.message ?? payload?.details ?? payload?.error ?? response.statusText;
    throw new Error(String(message));
  }
  return payload;
}

async function requestFunction(body) {
  const response = await fetch(`${functionsUrl}/public-jobs`, {
    method: "POST",
    headers: {
      apikey: publicKey,
      Authorization: `Bearer ${publicKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const message = payload?.details ?? payload?.error ?? response.statusText;
    throw new Error(String(message));
  }
  return payload;
}

function resumeUpload(email) {
  const content = [
    "Local Public Upload Applicant",
    email,
    "Senior Frontend Engineer",
    "React, TypeScript, GraphQL, PostgreSQL",
  ].join("\n");
  const bytes = Buffer.from(content, "utf8");
  return {
    fileName: `local-public-upload-${Date.now()}.txt`,
    contentType: "text/plain",
    sizeBytes: bytes.length,
    base64: bytes.toString("base64"),
  };
}

await requestRest(`/job_postings?public_slug=eq.${TEST_SLUG}`, {
  method: "PATCH",
  body: {
    status: "active",
    is_public: true,
    public_apply_enabled: true,
    application_deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
  },
});

const listPayload = await requestFunction({ action: "list" });
assert(listPayload.jobs?.some((job) => job.slug === TEST_SLUG), "Seeded public job was not returned by the public-jobs function.");

const email = `public-upload-${Date.now()}@example.test`;
const receiptPayload = await requestFunction({
  action: "apply",
  slug: TEST_SLUG,
  application: {
    name: "Local Public Upload Applicant",
    email,
    phone: "+971500000000",
    location: "Dubai",
    currentTitle: "Senior Frontend Engineer",
    yearsExperience: 7,
    seniority: "Senior",
    topSkills: ["React", "TypeScript", "Supabase"],
    linkedinUrl: "https://linkedin.com/in/local-public-upload",
    coverNote: "Submitted by check-public-jobs-upload.",
    consent: true,
    idempotencyKey: `public-upload-${Date.now()}`,
    resumeFile: resumeUpload(email),
  },
});

const receipt = receiptPayload.receipt;
assert(receipt?.accepted === true, "Application upload should be accepted.");
assert(receipt.applicationId, "Application upload receipt should include applicationId.");

const applicationRows = await requestRest(
  `/job_applications?select=id,candidate_id,applicant_email,resume_storage_path,resume_source_document_id,resume_ingestion_status,candidate_hub_visibility&applicant_email=eq.${encodeURIComponent(email)}`,
);
assert(applicationRows.length === 1, "Uploaded application row should be queryable.");
const application = applicationRows[0];
assert(application.id === receipt.applicationId, "Receipt applicationId should match stored application row.");
assert(application.resume_storage_path, "Uploaded application should store the CV storage path.");
assert(application.resume_source_document_id, "Uploaded application should link a source document.");
assert(application.candidate_id, "Uploaded application should immediately link a candidate.");
assert(application.resume_ingestion_status === "queued", "Uploaded application should be queued for worker ingestion.");
assert(application.candidate_hub_visibility === "platform", "Uploaded application should publish the candidate to the central hub.");

const sourceRows = await requestRest(
  `/source_documents?select=id,source_type,storage_path,source_uri,candidate_id&id=eq.${application.resume_source_document_id}`,
);
assert(sourceRows.length === 1, "Uploaded CV should create a source_documents row.");
assert(sourceRows[0].source_type === "public_job_application", "Source document should be marked as public_job_application.");
assert(sourceRows[0].storage_path === application.resume_storage_path, "Source document storage_path should match the application row.");
assert(String(sourceRows[0].source_uri).startsWith("supabase://cv-originals/"), "Source document source_uri should point to cv-originals.");
assert(sourceRows[0].candidate_id === application.candidate_id, "Queued upload should be linked to the immediate candidate shell.");

const cacheRows = await requestRest(
  `/candidate_search_cache?select=candidate_id,email,skills,hub_visibility&candidate_id=eq.${application.candidate_id}`,
);
assert(cacheRows.length === 1, "Immediate candidate should be present in the search cache.");
assert(cacheRows[0].hub_visibility === "platform", "Immediate candidate should be visible in the central hub.");
assert(cacheRows[0].skills.includes("React"), "Immediate candidate should expose structured skills for matching.");

const processingRows = await requestRest(
  `/processing_runs?select=status,source_document_id,metadata_json&source_document_id=eq.${application.resume_source_document_id}`,
);
assert(processingRows.some((run) => run.status === "queued"), "Queued upload should create a queued processing_run.");

const eventRows = await requestRest(
  `/job_application_events?select=event_type&application_id=eq.${application.id}`,
);
assert(eventRows.some((event) => event.event_type === "APPLICATION_SUBMITTED"), "Application submitted event should be recorded.");
assert(eventRows.some((event) => event.event_type === "CV_INGESTION_QUEUED"), "CV ingestion queued event should be recorded.");

console.log("Public jobs upload queue checks passed.");
