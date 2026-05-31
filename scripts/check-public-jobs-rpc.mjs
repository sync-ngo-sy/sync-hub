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

async function request(path, { key = publicKey, method = "GET", body, headers = {} } = {}) {
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
    const error = new Error(String(message));
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

async function expectRpcError(name, body, expectedMessage) {
  try {
    await request(`/rpc/${name}`, { method: "POST", body });
  } catch (error) {
    assert(String(error.message).includes(expectedMessage), `Expected ${expectedMessage}, got ${error.message}`);
    return;
  }
  throw new Error(`Expected ${name} to fail with ${expectedMessage}.`);
}

function application(email, overrides = {}) {
  return {
    name: "Local RPC Test Applicant",
    email,
    phone: "+971500000000",
    location: "Dubai",
    linkedinUrl: "https://linkedin.com/in/local-rpc-test",
    resumeOriginalFilename: "local-rpc-test.pdf",
    coverNote: "Submitted by check-public-jobs-rpc.",
    consent: true,
    idempotencyKey: `public-rpc-test-${email}`,
    ...overrides,
  };
}

const jobs = await request("/rpc/public_job_postings_v1", { method: "POST", body: {} });
const seededJob = jobs.find((job) => job.slug === TEST_SLUG);
assert(seededJob, "Seeded public job was not returned.");
assert(seededJob.id === TEST_SLUG, "Public job id should be the slug, not the internal UUID.");
assert(!("employer_name" in seededJob), "Public job payload must not expose employer_name.");
assert(seededJob.apply_enabled === true, "Seeded public job should accept applications.");

const details = await request("/rpc/public_job_detail_v1", { method: "POST", body: { p_slug: TEST_SLUG } });
assert(details.length === 1, "Public job detail should return exactly one row.");
assert(details[0].id === TEST_SLUG, "Public job detail id should be the slug.");

const email = `public-rpc-${Date.now()}@example.test`;
const receiptRows = await request("/rpc/submit_public_job_application_v1", {
  method: "POST",
  body: { p_slug: TEST_SLUG, p_application: application(email) },
  headers: {
    "x-forwarded-for": "203.0.113.10",
    "user-agent": "cv-intel-public-rpc-test",
  },
});
const receipt = receiptRows[0];
assert(receipt?.accepted === true, "Application should be accepted.");
assert(receipt.duplicate === false, "First application should not be marked duplicate.");
assert(receipt.application_id, "Application receipt should include application_id.");

const applicationRows = await request(
  `/job_applications?select=id,applicant_email,status,source,ip_hash,user_agent_hash&applicant_email=eq.${encodeURIComponent(email)}`,
  { key: serviceRoleKey },
);
assert(applicationRows.length === 1, "Inserted application row should be queryable.");
assert(applicationRows[0].source === "public_job_board", "Application source should be public_job_board.");
assert(applicationRows[0].ip_hash, "Application should store a hashed request IP.");
assert(applicationRows[0].user_agent_hash, "Application should store a hashed user agent.");

const eventRows = await request(
  `/job_application_events?select=event_type&application_id=eq.${receipt.application_id}`,
  { key: serviceRoleKey },
);
assert(eventRows.some((event) => event.event_type === "APPLICATION_SUBMITTED"), "Application submitted event should be recorded.");

const duplicateRows = await request("/rpc/submit_public_job_application_v1", {
  method: "POST",
  body: { p_slug: TEST_SLUG, p_application: application(email, { idempotencyKey: `public-rpc-test-duplicate-${Date.now()}` }) },
});
assert(duplicateRows[0]?.accepted === true && duplicateRows[0]?.duplicate === true, "Duplicate email should return a duplicate receipt.");
assert(duplicateRows[0]?.application_id === receipt.application_id, "Duplicate receipt should return the original application id.");

await expectRpcError("submit_public_job_application_v1", {
  p_slug: TEST_SLUG,
  p_application: application("not-an-email"),
}, "valid_email_required");

await expectRpcError("submit_public_job_application_v1", {
  p_slug: TEST_SLUG,
  p_application: application(`missing-consent-${Date.now()}@example.test`, { consent: false }),
}, "consent_required");

await request(`/job_postings?public_slug=eq.${TEST_SLUG}`, {
  key: serviceRoleKey,
  method: "PATCH",
  body: { application_deadline: "1970-01-01" },
});
try {
  const expiredDetails = await request("/rpc/public_job_detail_v1", { method: "POST", body: { p_slug: TEST_SLUG } });
  assert(expiredDetails[0]?.apply_enabled === false, "Expired job should not be apply-enabled.");
  await expectRpcError("submit_public_job_application_v1", {
    p_slug: TEST_SLUG,
    p_application: application(`expired-${Date.now()}@example.test`),
  }, "applications_closed");
} finally {
  await request(`/job_postings?public_slug=eq.${TEST_SLUG}`, {
    key: serviceRoleKey,
    method: "PATCH",
    body: { application_deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10) },
  });
}

console.log("Public jobs RPC checks passed.");
