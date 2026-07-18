import { createClient } from "@supabase/supabase-js";

type JsonRecord = Record<string, unknown>;

function jsonResponse(status: number, payload: JsonRecord) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function candidateIdFromPayload(payload: JsonRecord) {
  const direct = asString(payload.candidate_id) ??
    asString(payload.candidate_pk) ??
    asString(payload.id);
  if (direct) {
    return direct;
  }

  const nestedCandidates = [
    asRecord(payload.candidate),
    asRecord(payload.object),
    asRecord(payload.data),
    asRecord(payload.payload),
  ];

  for (const record of nestedCandidates) {
    const nested = asString(record.candidate_id) ??
      asString(record.candidate_pk) ??
      asString(record.id);
    if (nested) {
      return nested;
    }
  }

  return null;
}

function requestSecret(req: Request, url: URL) {
  return (
    req.headers.get("x-webhook-secret") ??
      req.headers.get("x-manatal-webhook-secret") ??
      url.searchParams.get("secret")
  );
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return jsonResponse(405, { error: "method_not_allowed" });
  }

  const url = new URL(req.url);
  const expectedSecret = Deno.env.get("MANATAL_WEBHOOK_SECRET") ?? "";
  if (expectedSecret && requestSecret(req, url) !== expectedSecret) {
    return jsonResponse(401, { error: "invalid_webhook_secret" });
  }

  const tenantId = url.searchParams.get("tenant_id") ??
    Deno.env.get("MANATAL_WEBHOOK_TENANT_ID") ??
    "";
  if (!tenantId) {
    return jsonResponse(400, { error: "tenant_id_required" });
  }

  let payload: JsonRecord;
  try {
    payload = (await req.json()) as JsonRecord;
  } catch (_error) {
    return jsonResponse(400, { error: "invalid_json" });
  }

  const candidateId = candidateIdFromPayload(payload);
  if (!candidateId) {
    return jsonResponse(400, { error: "candidate_id_not_found" });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(500, { error: "supabase_service_not_configured" });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const { error } = await supabase.from("manatal_candidate_sync").upsert(
    {
      tenant_id: tenantId,
      manatal_candidate_id: candidateId,
      sync_status: "pending",
      error_message: "",
      metadata_json: {
        webhook_payload: payload,
        queued_at: new Date().toISOString(),
      },
    },
    { onConflict: "tenant_id,manatal_candidate_id" },
  );

  if (error) {
    return jsonResponse(500, { error: "queue_failed", details: error.message });
  }

  return jsonResponse(202, {
    ok: true,
    tenant_id: tenantId,
    manatal_candidate_id: candidateId,
    sync_status: "pending",
  });
});
