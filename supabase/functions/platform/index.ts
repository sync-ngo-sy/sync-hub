import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { createAuthedClient } from "../_shared/client.ts";
import { generateStructuredObject } from "../_shared/llm.ts";
import { buildQueryEmbedding } from "../_shared/queryEmbedding.ts";
import {
  addUserToTenant,
  assertPlatformAdmin,
  createServiceClient,
  createTenantAccount,
  listAdminTenants,
} from "../_shared/platformProvisioning.ts";
import {
  buildPlatformRuntimeConfigView,
  savePlatformRuntimeSettings,
} from "../_shared/platformRuntimeSettings.ts";
import {
  normalizeLocationValue,
  normalizeSeniorityValue,
  normalizeSkillList,
} from "../_shared/searchTaxonomy.ts";

const SEARCH_PAGE_SIZE = 1000;
const INSIGHTS_FALLBACK_MAX_ROWS = 20000;
const DEFAULT_GCS_SIGNED_URL_SECONDS = 10 * 60;

type JsonRecord = Record<string, unknown>;
type SupabaseQueryResult = {
  data?: Array<Record<string, unknown>> | null;
  error?: unknown;
  count?: number | null;
};
type SupabaseQueryLike = PromiseLike<SupabaseQueryResult> & {
  eq: (column: string, value: unknown) => SupabaseQueryLike;
  not: (column: string, operator: string, value: unknown) => SupabaseQueryLike;
  like: (column: string, pattern: string) => SupabaseQueryLike;
  ilike: (column: string, pattern: string) => SupabaseQueryLike;
};
type TenantFilterableQuery<T> = T & {
  in: (column: string, values: readonly string[]) => T;
};
type GcsServiceAccountCredentials = {
  client_email?: string;
  private_key?: string;
};
type GcsSignedUrlResult = {
  url: string;
  expiresAt: string;
};

type OriginalDocumentRow = {
  id: string;
  tenant_id: string;
  candidate_id: string | null;
  source_uri: string | null;
  storage_path: string | null;
  original_filename: string | null;
};

type InsightsCandidateSearchCacheRow = {
  tenant_id: string;
  candidate_id: string;
  current_title: string | null;
  headline: string | null;
  location: string | null;
  years_experience: number | null;
  seniority: string | null;
  primary_role: string | null;
  role_tags: string[] | null;
  skills: string[] | null;
  created_at: string | null;
  updated_at: string | null;
};

type InsightsDistributionItem = {
  label: string;
  value: number;
  percent?: number | null;
};

type InsightsGapAnalysis = {
  targetRole: string | null;
  targetSkills: string[];
  fullyMatchingCandidates: number;
  partiallyMatchingCandidates: number;
  zeroMatchCandidates: number;
  missingSkills: Array<{ skill: string; missingFromPartialCandidates: number }>;
};

function describeError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  if (error && typeof error === "object") {
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }
  return String(error);
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asStringArray(value: unknown) {
  return Array.isArray(value)
    ? Array.from(
      new Set(
        value
          .map((item) => (typeof item === "string" ? item.trim() : ""))
          .filter(Boolean),
      ),
    )
    : [];
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function asNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isMissingRpcError(error: unknown) {
  const record = asRecord(error);
  const code = String(record.code ?? "");
  const message = describeError(error).toLowerCase();
  return (
    code === "PGRST202" ||
    message.includes("could not find the function") ||
    message.includes("schema cache")
  );
}

function isBrowserOpenableSource(sourceUri: string | null) {
  return Boolean(sourceUri && /^(https?:)?\/\//i.test(sourceUri));
}

function parseIntegerEnv(
  name: string,
  fallback: number,
  min: number,
  max: number,
) {
  const parsed = Number(Deno.env.get(name));
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

function rfc3986Encode(value: string) {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function decodeBase64Secret(value: string, envName: string) {
  try {
    const binary = atob(value.replace(/\s/g, ""));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return new TextDecoder().decode(bytes);
  } catch (error) {
    throw new Error(`${envName} must be valid base64: ${describeError(error)}`);
  }
}

function normalizeSecretValue(value: string) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function normalizePrivateKey(privateKey: string) {
  return normalizeSecretValue(privateKey).replace(/\\n/g, "\n");
}

function encodePath(value: string) {
  return value.split("/").map(rfc3986Encode).join("/");
}

function bytesToHex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Hex(value: string) {
  return bytesToHex(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  );
}

function pemToArrayBuffer(pem: string) {
  const base64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s/g, "");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

async function signRsaSha256(privateKey: string, value: string) {
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(privateKey),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return bytesToHex(
    await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      key,
      new TextEncoder().encode(value),
    ),
  );
}

function getGcsBucketName() {
  return (
    asString(Deno.env.get("GCS_ORIGINALS_BUCKET")) ??
      asString(Deno.env.get("CV_GCS_BUCKET")) ??
      asString(Deno.env.get("CV_BUCKET_NAME"))
  );
}

function getGcsCredentials() {
  const rawJson = asString(Deno.env.get("GCS_SIGNED_URL_SERVICE_ACCOUNT_JSON"));
  const rawJsonBase64 = asString(
    Deno.env.get("GCS_SIGNED_URL_SERVICE_ACCOUNT_JSON_BASE64"),
  );
  const raw = rawJson
    ? normalizeSecretValue(rawJson)
    : rawJsonBase64
    ? decodeBase64Secret(
      rawJsonBase64,
      "GCS_SIGNED_URL_SERVICE_ACCOUNT_JSON_BASE64",
    )
    : null;
  if (!raw) {
    const clientEmail = asString(Deno.env.get("GCS_SIGNED_URL_CLIENT_EMAIL"));
    const privateKey = asString(Deno.env.get("GCS_SIGNED_URL_PRIVATE_KEY"));
    const privateKeyBase64 = asString(
      Deno.env.get("GCS_SIGNED_URL_PRIVATE_KEY_BASE64"),
    );
    const normalizedPrivateKey = privateKey
      ? normalizePrivateKey(privateKey)
      : privateKeyBase64
      ? normalizePrivateKey(
        decodeBase64Secret(
          privateKeyBase64,
          "GCS_SIGNED_URL_PRIVATE_KEY_BASE64",
        ),
      )
      : null;
    if (!clientEmail && !normalizedPrivateKey) {
      return null;
    }
    if (!clientEmail || !normalizedPrivateKey) {
      throw new Error(
        "GCS signed URL credentials require GCS_SIGNED_URL_CLIENT_EMAIL and a private key secret.",
      );
    }
    return {
      client_email: clientEmail,
      private_key: normalizedPrivateKey,
    };
  }
  const parsed = JSON.parse(raw) as GcsServiceAccountCredentials;
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error(
      "GCS signed URL service account JSON must include client_email and private_key.",
    );
  }
  return {
    client_email: parsed.client_email,
    private_key: normalizePrivateKey(parsed.private_key),
  };
}

function parseGcsUri(value: string) {
  if (!/^gs:\/\//i.test(value)) {
    return null;
  }
  const withoutScheme = value.slice("gs://".length);
  const slashIndex = withoutScheme.indexOf("/");
  if (slashIndex < 1 || slashIndex === withoutScheme.length - 1) {
    return null;
  }
  return {
    bucket: withoutScheme.slice(0, slashIndex),
    objectName: withoutScheme.slice(slashIndex + 1),
  };
}

function resolveGcsLocation(document: OriginalDocumentRow) {
  const configuredBucket = getGcsBucketName();
  const sourceUri = asString(document.source_uri);
  const storagePath = asString(document.storage_path);

  const sourceGcsUri = sourceUri ? parseGcsUri(sourceUri) : null;
  if (sourceGcsUri) {
    return sourceGcsUri;
  }

  const storageGcsUri = storagePath ? parseGcsUri(storagePath) : null;
  if (storageGcsUri) {
    return storageGcsUri;
  }

  if (!configuredBucket || !storagePath) {
    return null;
  }

  const objectName = storagePath.startsWith(`${configuredBucket}/`)
    ? storagePath.slice(configuredBucket.length + 1)
    : storagePath;
  return { bucket: configuredBucket, objectName };
}

async function createRemoteGcsSignedUrl(
  bucket: string,
  objectName: string,
): Promise<GcsSignedUrlResult | null> {
  const signerUrl = asString(Deno.env.get("GCS_SIGNER_SERVICE_URL"));
  const signerSecret = asString(Deno.env.get("GCS_SIGNER_SHARED_SECRET"));
  if (!signerUrl && !signerSecret) {
    return null;
  }
  if (!signerUrl || !signerSecret) {
    throw new Error(
      "GCS signer service requires GCS_SIGNER_SERVICE_URL and GCS_SIGNER_SHARED_SECRET.",
    );
  }

  const expiresSeconds = parseIntegerEnv(
    "GCS_SIGNED_URL_EXPIRES_SECONDS",
    DEFAULT_GCS_SIGNED_URL_SECONDS,
    60,
    3600,
  );
  const response = await fetch(`${signerUrl.replace(/\/+$/, "")}/sign`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${signerSecret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ bucket, objectName, expiresSeconds }),
  });

  const payload = asRecord(await response.json().catch(() => ({})));
  if (!response.ok) {
    throw new Error(
      `GCS signer service failed (${response.status}): ${
        describeError(payload)
      }`,
    );
  }

  const url = asString(payload.url);
  const expiresAt = asString(payload.expiresAt) ?? asString(payload.expires_at);
  if (!url || !expiresAt) {
    throw new Error("GCS signer service returned an invalid response.");
  }
  return { url, expiresAt };
}

async function createGcsSignedUrl(bucket: string, objectName: string) {
  const remoteSignedUrl = await createRemoteGcsSignedUrl(bucket, objectName);
  if (remoteSignedUrl) {
    return remoteSignedUrl;
  }

  const credentials = getGcsCredentials();
  if (!credentials) {
    throw new Error(
      "GCS signed URL access is not configured. Set GCS_SIGNER_SERVICE_URL and GCS_SIGNER_SHARED_SECRET, or configure service account signing credentials.",
    );
  }

  const expiresSeconds = parseIntegerEnv(
    "GCS_SIGNED_URL_EXPIRES_SECONDS",
    DEFAULT_GCS_SIGNED_URL_SECONDS,
    60,
    3600,
  );
  const now = new Date();
  const timestamp = now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
  const datestamp = timestamp.slice(0, 8);
  const algorithm = "GOOG4-RSA-SHA256";
  const credentialScope = `${datestamp}/auto/storage/goog4_request`;
  const credential = `${credentials.client_email}/${credentialScope}`;
  const host = "storage.googleapis.com";
  const canonicalUri = `/${rfc3986Encode(bucket)}/${encodePath(objectName)}`;
  const queryParams = [
    ["X-Goog-Algorithm", algorithm],
    ["X-Goog-Credential", credential],
    ["X-Goog-Date", timestamp],
    ["X-Goog-Expires", String(expiresSeconds)],
    ["X-Goog-SignedHeaders", "host"],
  ];
  const canonicalQueryString = queryParams
    .map(([key, value]) => `${rfc3986Encode(key)}=${rfc3986Encode(value)}`)
    .join("&");
  const canonicalHeaders = `host:${host}\n`;
  const canonicalRequest = [
    "GET",
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    "host",
    "UNSIGNED-PAYLOAD",
  ].join("\n");
  const stringToSign = [
    algorithm,
    timestamp,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join("\n");
  const signature = await signRsaSha256(credentials.private_key, stringToSign);
  return {
    url:
      `https://${host}${canonicalUri}?${canonicalQueryString}&X-Goog-Signature=${signature}`,
    expiresAt: new Date(now.getTime() + expiresSeconds * 1000).toISOString(),
  };
}

function dedupeSorted(values: string[]) {
  return Array.from(new Set(values.filter(Boolean))).sort((left, right) =>
    left.localeCompare(right)
  );
}

async function fetchAllSearchCacheRows(
  supabase: ReturnType<typeof createAuthedClient>,
  tenantIds: string[],
) {
  const rows: Array<{
    seniority: string | null;
    skills: string[] | null;
    companies: string[] | null;
    location: string | null;
  }> = [];

  for (let offset = 0;; offset += SEARCH_PAGE_SIZE) {
    let request = supabase
      .from("candidate_search_cache")
      .select("seniority, skills, companies, location")
      .range(offset, offset + SEARCH_PAGE_SIZE - 1);

    if (tenantIds.length) {
      request = request.in("tenant_id", tenantIds);
    }

    const { data, error } = await request;
    if (error) {
      throw error;
    }
    const page = data ?? [];
    rows.push(...page);
    if (page.length < SEARCH_PAGE_SIZE) {
      break;
    }
  }

  return rows;
}

async function getSearchFilterOptions(
  supabase: ReturnType<typeof createAuthedClient>,
  tenantIds: string[],
) {
  const rows = await fetchAllSearchCacheRows(supabase, tenantIds);
  return {
    seniority: dedupeSorted(
      rows
        .map((row) => row.seniority ?? "")
        .filter((value) => value && value !== "unclassified"),
    ),
    skills: dedupeSorted(
      normalizeSkillList(rows.flatMap((row) => row.skills ?? [])),
    ),
    companies: dedupeSorted(rows.flatMap((row) => row.companies ?? [])),
    locations: dedupeSorted(
      rows
        .map((row) => normalizeLocationValue(row.location))
        .filter((value): value is string => Boolean(value)),
    ),
  };
}

async function getWorkspaceStats(
  supabase: ReturnType<typeof createAuthedClient>,
  tenantIds: string[],
) {
  const { data, error } = await supabase.rpc("workspace_stats_v1", {
    p_tenant_ids: tenantIds.length ? tenantIds : null,
  });
  if (error) {
    throw error;
  }
  return Array.isArray(data)
    ? (data[0] ?? { document_count: 0, candidate_count: 0, company_count: 0 })
    : data;
}

function withTenantFilter<T>(
  query: T,
  tenantIds: string[],
  column = "tenant_id",
) {
  return tenantIds.length
    ? (query as TenantFilterableQuery<T>).in(column, tenantIds)
    : query;
}

async function countRows(
  supabase: ReturnType<typeof createAuthedClient>,
  table: string,
  tenantIds: string[],
  apply?: (query: SupabaseQueryLike) => SupabaseQueryLike,
) {
  let query = supabase
    .from(table)
    .select("*", {
      count: "exact",
      head: true,
    }) as unknown as SupabaseQueryLike;
  query = withTenantFilter(query, tenantIds);
  if (apply) {
    query = apply(query);
  }
  const { count, error } = await query;
  if (error) {
    throw error;
  }
  return count ?? 0;
}

function asPercent(numerator: number, denominator: number) {
  if (!denominator) {
    return 0;
  }
  return Math.round((numerator / denominator) * 100);
}

function mapManatalStatusRow(row: unknown) {
  const record = asRecord(row);
  return {
    manatalCandidateId: String(record.manatal_candidate_id ?? ""),
    candidateName: String(record.manatal_full_name ?? "Unknown candidate"),
    email: asString(record.manatal_email),
    syncStatus: String(record.sync_status ?? "unknown"),
    lastSyncedAt: asString(record.last_synced_at),
    updatedAt: asString(record.updated_at),
    sourceDocumentId: asString(record.source_document_id),
    errorMessage: asString(record.error_message),
  };
}

async function getManatalSyncStatus(
  supabase: ReturnType<typeof createAuthedClient>,
  tenantIds: string[],
) {
  const [
    sourceDocuments,
    gcsOriginals,
    driveOriginals,
    manatalRows,
    mappedManatalRows,
    syncedRows,
    pendingRows,
    failedRows,
    skippedRows,
    recentResult,
    lastSyncedResult,
    lastFailureResult,
  ] = await Promise.all([
    countRows(supabase, "source_documents", tenantIds),
    countRows(
      supabase,
      "source_documents",
      tenantIds,
      (query) => query.like("source_uri", "gs://%"),
    ),
    countRows(
      supabase,
      "source_documents",
      tenantIds,
      (query) => query.ilike("source_uri", "%drive.google.com%"),
    ),
    countRows(supabase, "manatal_candidate_sync", tenantIds),
    countRows(
      supabase,
      "manatal_candidate_sync",
      tenantIds,
      (query) => query.not("source_document_id", "is", null),
    ),
    countRows(
      supabase,
      "manatal_candidate_sync",
      tenantIds,
      (query) => query.eq("sync_status", "synced"),
    ),
    countRows(
      supabase,
      "manatal_candidate_sync",
      tenantIds,
      (query) => query.eq("sync_status", "pending"),
    ),
    countRows(
      supabase,
      "manatal_candidate_sync",
      tenantIds,
      (query) => query.eq("sync_status", "failed"),
    ),
    countRows(
      supabase,
      "manatal_candidate_sync",
      tenantIds,
      (query) => query.eq("sync_status", "skipped"),
    ),
    (() => {
      let query = supabase
        .from("manatal_candidate_sync")
        .select(
          "manatal_candidate_id, manatal_full_name, manatal_email, sync_status, last_synced_at, updated_at, source_document_id, error_message",
        )
        .order("updated_at", { ascending: false })
        .limit(12);
      query = withTenantFilter(query, tenantIds);
      return query;
    })(),
    (() => {
      let query = supabase
        .from("manatal_candidate_sync")
        .select("last_synced_at")
        .eq("sync_status", "synced")
        .not("last_synced_at", "is", null)
        .order("last_synced_at", { ascending: false })
        .limit(1);
      query = withTenantFilter(query, tenantIds);
      return query;
    })(),
    (() => {
      let query = supabase
        .from("manatal_candidate_sync")
        .select(
          "manatal_candidate_id, manatal_full_name, error_message, updated_at",
        )
        .eq("sync_status", "failed")
        .order("updated_at", { ascending: false })
        .limit(1);
      query = withTenantFilter(query, tenantIds);
      return query;
    })(),
  ]);

  if (recentResult.error) {
    throw recentResult.error;
  }
  if (lastSyncedResult.error) {
    throw lastSyncedResult.error;
  }
  if (lastFailureResult.error) {
    throw lastFailureResult.error;
  }

  const lastFailureRow = (lastFailureResult.data ?? [])[0] ?? null;
  return {
    generatedAt: new Date().toISOString(),
    totals: {
      sourceDocuments,
      gcsOriginals,
      driveOriginals,
      manatalRows,
      mappedManatalRows,
      syncedRows,
      pendingRows,
      failedRows,
      skippedRows,
    },
    coverage: {
      gcsOriginalsPercent: asPercent(gcsOriginals, sourceDocuments),
      manatalSyncedPercent: asPercent(syncedRows, manatalRows),
      mappedRowsPercent: asPercent(mappedManatalRows, manatalRows),
    },
    lastSyncedAt: asString((lastSyncedResult.data ?? [])[0]?.last_synced_at),
    lastFailure: lastFailureRow
      ? {
        manatalCandidateId: String(lastFailureRow.manatal_candidate_id ?? ""),
        candidateName: String(
          lastFailureRow.manatal_full_name ?? "Unknown candidate",
        ),
        errorMessage: String(lastFailureRow.error_message ?? ""),
        updatedAt: asString(lastFailureRow.updated_at),
      }
      : null,
    recentRows: (recentResult.data ?? []).map(mapManatalStatusRow),
  };
}

type OpsHealthRow = {
  severity: string;
  component: string;
  tenant_id: string | null;
  alert_key: string;
  message: string;
  current_value: number | null;
  threshold: number | null;
  last_seen_at: string;
  dedupe_key: string;
  context_json: JsonRecord | null;
};

function severityRank(severity: string) {
  switch (severity) {
    case "P0":
      return 0;
    case "P1":
      return 1;
    case "P2":
      return 2;
    default:
      return 3;
  }
}

function statusForAlerts(alerts: OpsHealthRow[]) {
  if (
    alerts.some((alert) => alert.severity === "P0" || alert.severity === "P1")
  ) {
    return "degraded";
  }
  if (alerts.some((alert) => alert.severity === "P2")) {
    return "warning";
  }
  return "healthy";
}

function overallStatus(alerts: OpsHealthRow[]) {
  if (alerts.some((alert) => alert.severity === "P0")) {
    return "Critical";
  }
  if (alerts.some((alert) => alert.severity === "P1")) {
    return "Degraded";
  }
  if (alerts.some((alert) => alert.severity === "P2")) {
    return "Warning";
  }
  return "Healthy";
}

function percentile(values: number[], percentileValue: number) {
  if (!values.length) {
    return 0;
  }
  const sorted = values.slice().sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((percentileValue / 100) * sorted.length) - 1),
  );
  return Math.round(sorted[index]);
}

function formatHeartbeatAge(value: unknown) {
  const timestamp = asString(value);
  if (!timestamp) {
    return "no heartbeat";
  }
  const ageSeconds = Math.max(
    0,
    Math.round((Date.now() - new Date(timestamp).getTime()) / 1000),
  );
  if (ageSeconds < 60) {
    return `${ageSeconds}s ago`;
  }
  const ageMinutes = Math.round(ageSeconds / 60);
  return `${ageMinutes}m ago`;
}

async function getSystemHealth(
  supabase: ReturnType<typeof createAuthedClient>,
  tenantIds: string[],
) {
  const [snapshotResult, eventsResult, workersResult] = await Promise.all([
    supabase.rpc("ops_health_snapshot_v1", {
      p_tenant_ids: tenantIds.length ? tenantIds : null,
    }),
    (() => {
      let query = supabase
        .from("analytics_events")
        .select("event_name, payload, created_at")
        .like("event_name", "edge.%.request");
      if (tenantIds.length) {
        query = query.in("tenant_id", tenantIds);
      }
      return query.order("created_at", { ascending: false }).limit(100);
    })(),
    (() => {
      let query = supabase
        .from("worker_devices")
        .select("tenant_id, device_name, status, last_seen_at, metadata_json")
        .eq("status", "active");
      if (tenantIds.length) {
        query = query.in("tenant_id", tenantIds);
      }
      return query.order("last_seen_at", { ascending: false }).limit(12);
    })(),
  ]);

  if (snapshotResult.error) {
    throw snapshotResult.error;
  }
  if (eventsResult.error) {
    throw eventsResult.error;
  }
  if (workersResult.error) {
    throw workersResult.error;
  }

  const alerts = ((snapshotResult.data ?? []) as OpsHealthRow[]).sort(
    (left, right) => severityRank(left.severity) - severityRank(right.severity),
  );
  const recentEvents = (eventsResult.data ?? []) as Array<{
    event_name: string;
    payload: unknown;
    created_at: string;
  }>;
  const durations = recentEvents
    .map((event) => asNumber(asRecord(event.payload).duration_ms))
    .filter((value): value is number => value !== null && value >= 0);
  const latencyMs = percentile(durations, 95);
  const eventsWithFailures = recentEvents.filter((event) => {
    const statusCode = asNumber(asRecord(event.payload).status_code);
    return statusCode !== null && statusCode >= 500;
  }).length;
  const capacityAlerts = alerts.filter(
    (alert) => alert.component === "capacity",
  );
  const capacityUsage = Math.max(
    0,
    ...capacityAlerts.map((alert) => Number(alert.current_value ?? 0)),
  );
  const workerRows = (workersResult.data ?? []) as Array<{
    tenant_id: string;
    device_name: string;
    status: string;
    last_seen_at: string | null;
    metadata_json: unknown;
  }>;

  const searchAlerts = alerts.filter(
    (alert) =>
      alert.component === "search" || alert.alert_key.includes("search"),
  );
  const edgeAlerts = alerts.filter(
    (alert) => alert.component === "edge_function",
  );
  const workerAlerts = alerts.filter((alert) => alert.component === "worker");
  const ingestionAlerts = alerts.filter(
    (alert) => alert.component === "ingestion",
  );
  const dataQualityAlerts = alerts.filter(
    (alert) => alert.component === "data_quality",
  );

  const services = [
    {
      name: "Edge Functions",
      status: statusForAlerts(edgeAlerts),
      latency: latencyMs ? `${latencyMs} ms p95` : "no samples",
      detail: edgeAlerts[0]?.message ??
        `${recentEvents.length} recent requests, ${eventsWithFailures} server errors.`,
    },
    {
      name: "Search",
      status: statusForAlerts(searchAlerts),
      latency: latencyMs ? `${latencyMs} ms p95` : "no samples",
      detail: searchAlerts[0]?.message ??
        "Search alerts are clear from the Supabase health snapshot.",
    },
    {
      name: "Offline worker fleet",
      status: statusForAlerts(workerAlerts),
      latency: workerRows.length ? `${workerRows.length} registered` : "idle",
      detail: workerAlerts[0]?.message ??
        (workerRows.length
          ? "Active worker devices are sending heartbeats."
          : "No worker devices registered; worker monitoring is idle."),
    },
    {
      name: "Ingestion",
      status: statusForAlerts(ingestionAlerts),
      latency: ingestionAlerts[0]?.current_value !== null &&
          ingestionAlerts[0]?.current_value !== undefined
        ? `${ingestionAlerts[0].current_value}`
        : "clear",
      detail: ingestionAlerts[0]?.message ??
        "No stuck or failing ingestion runs in the current alert window.",
    },
    {
      name: "Data quality",
      status: statusForAlerts(dataQualityAlerts),
      latency: dataQualityAlerts[0]?.current_value !== null &&
          dataQualityAlerts[0]?.current_value !== undefined
        ? `${dataQualityAlerts[0].current_value}%`
        : "clear",
      detail: dataQualityAlerts[0]?.message ??
        "Recent parsing quality is within configured thresholds.",
    },
    {
      name: "Supabase capacity",
      status: statusForAlerts(capacityAlerts),
      latency: capacityUsage
        ? `${Math.round(capacityUsage)}%`
        : "within limits",
      detail: capacityAlerts[0]?.message ??
        "Database and storage capacity alerts are clear.",
    },
  ];

  const workerFleet = workerRows.map((worker) => {
    const metadata = asRecord(worker.metadata_json);
    const metrics = asRecord(metadata.last_metrics);
    const queueDepth = asNumber(metrics.queue_depth) ??
      asNumber(metrics.pending) ??
      asNumber(metrics.failures) ??
      0;
    const throughput = asNumber(metrics.documents_per_minute) ??
      asNumber(metrics.processed_per_minute);
    return {
      name: worker.device_name,
      region: formatHeartbeatAge(worker.last_seen_at),
      queueDepth,
      throughput: throughput === null ? "heartbeat only" : `${throughput}/min`,
    };
  });

  const alertLogs = alerts.slice(0, 6).map((alert) => ({
    level: alert.severity === "P0" || alert.severity === "P1" ? "warn" : "info",
    message: alert.message,
    timestamp: new Date(alert.last_seen_at).toLocaleTimeString("en-US", {
      hour12: false,
    }),
  }));

  return {
    overallStatus: overallStatus(alerts),
    latencyMs,
    uptime: alerts.some((alert) => alert.severity === "P0")
      ? "incident"
      : "live",
    memory: Math.round(capacityUsage),
    services,
    workerFleet,
    logs: alertLogs.length ? alertLogs : [
      {
        level: "ok",
        message: "Supabase monitoring snapshot is clear.",
        timestamp: new Date().toLocaleTimeString("en-US", {
          hour12: false,
        }),
      },
    ],
  };
}

async function getOpsAlerts(
  supabase: ReturnType<typeof createAuthedClient>,
  tenantIds: string[],
) {
  const { data, error } = await supabase.rpc("ops_evaluate_alerts_v1", {
    p_tenant_ids: tenantIds.length ? tenantIds : null,
  });
  if (error) {
    throw error;
  }
  return data ?? [];
}

const INSIGHTS_JOB_FAMILY_RULES = [
  {
    label: "Full-Stack Engineering",
    roleTags: ["full-stack"],
    titleSignals: ["full stack", "full-stack"],
    skillSignals: [
      "react",
      "angular",
      "vue",
      "node.js",
      "express",
      "django",
      "laravel",
      "postgresql",
      "mongodb",
      "sql",
      "apis",
    ],
  },
  {
    label: "Backend Engineering",
    roleTags: ["backend"],
    titleSignals: ["backend", "back-end", "api", "server", "platform"],
    skillSignals: [
      "node.js",
      "nestjs",
      "express",
      "java",
      "spring",
      "python",
      "django",
      "fastapi",
      "laravel",
      "php",
      "asp.net",
      ".net",
      "postgresql",
      "mysql",
      "mongodb",
      "redis",
      "graphql",
      "rest apis",
    ],
  },
  {
    label: "Frontend Engineering",
    roleTags: ["frontend"],
    titleSignals: ["frontend", "front-end", "ui engineer", "web developer"],
    skillSignals: [
      "react",
      "next.js",
      "angular",
      "vue",
      "javascript",
      "typescript",
      "html",
      "css",
      "tailwind",
      "bootstrap",
      "redux",
    ],
  },
  {
    label: "Mobile Engineering",
    roleTags: ["mobile"],
    titleSignals: ["mobile", "android", "ios", "flutter", "react native"],
    skillSignals: [
      "flutter",
      "dart",
      "android",
      "ios",
      "swift",
      "kotlin",
      "react native",
      "firebase",
    ],
  },
  {
    label: "AI & Machine Learning",
    roleTags: ["ml"],
    titleSignals: [
      "machine learning",
      "ml engineer",
      "ai engineer",
      "data scientist",
      "llm",
    ],
    skillSignals: [
      "machine learning",
      "deep learning",
      "tensorflow",
      "pytorch",
      "scikit",
      "keras",
      "opencv",
      "nlp",
      "llm",
      "computer vision",
    ],
  },
  {
    label: "Data & Analytics",
    roleTags: ["data"],
    titleSignals: [
      "data analyst",
      "data engineer",
      "business intelligence",
      "bi developer",
      "analytics",
    ],
    skillSignals: [
      "sql",
      "power bi",
      "tableau",
      "excel",
      "pandas",
      "numpy",
      "etl",
      "data analysis",
      "data visualization",
    ],
  },
  {
    label: "Cloud, DevOps & SRE",
    roleTags: ["devops"],
    titleSignals: [
      "devops",
      "sre",
      "site reliability",
      "cloud",
      "infrastructure",
    ],
    skillSignals: [
      "docker",
      "kubernetes",
      "terraform",
      "aws",
      "azure",
      "google cloud",
      "gcp",
      "ci/cd",
      "linux",
      "jenkins",
      "ansible",
      "helm",
    ],
  },
  {
    label: "Cybersecurity",
    roleTags: ["security"],
    titleSignals: ["security", "cyber", "soc", "penetration", "threat", "siem"],
    skillSignals: [
      "cybersecurity",
      "security",
      "soc operations",
      "siem",
      "penetration testing",
      "vulnerability",
      "threat detection",
      "incident response",
    ],
  },
  {
    label: "QA & Test Automation",
    roleTags: ["qa"],
    titleSignals: ["qa", "quality assurance", "test automation", "tester"],
    skillSignals: [
      "selenium",
      "playwright",
      "cypress",
      "jest",
      "testing",
      "test automation",
      "quality assurance",
    ],
  },
  {
    label: "Product & Design",
    roleTags: ["product", "design"],
    titleSignals: [
      "product designer",
      "ui/ux",
      "ux designer",
      "product manager",
    ],
    skillSignals: [
      "figma",
      "ui/ux",
      "wireframing",
      "prototyping",
      "user research",
      "product management",
    ],
  },
  {
    label: "Software Engineering",
    roleTags: ["generalist"],
    titleSignals: ["software", "developer", "engineer", "programmer"],
    skillSignals: [
      "git",
      "github",
      "apis",
      "javascript",
      "python",
      "java",
      "sql",
      "problem solving",
    ],
  },
];

const INSIGHTS_SKILL_ALIAS_GROUPS = [
  {
    skill: "React Native",
    aliases: ["react native", "react-native", "reactnative", "rn"],
  },
  { skill: "React", aliases: ["react", "react.js", "reactjs"] },
  { skill: "Next.js", aliases: ["next.js", "nextjs", "next"] },
  { skill: "Node.js", aliases: ["node.js", "nodejs", "node js", "node"] },
  { skill: "TypeScript", aliases: ["typescript", "ts"] },
  { skill: "JavaScript", aliases: ["javascript", "js"] },
  { skill: "Kubernetes", aliases: ["kubernetes", "k8s"] },
  { skill: "Terraform", aliases: ["terraform"] },
  { skill: "Docker", aliases: ["docker"] },
  { skill: "AWS", aliases: ["aws", "amazon web services"] },
  { skill: "Azure", aliases: ["azure", "microsoft azure"] },
  {
    skill: "Google Cloud",
    aliases: ["google cloud", "gcp", "google cloud platform"],
  },
  {
    skill: "CI/CD",
    aliases: [
      "ci/cd",
      "cicd",
      "ci cd",
      "continuous integration",
      "continuous deployment",
    ],
  },
  { skill: "Python", aliases: ["python"] },
  { skill: "Java", aliases: ["java"] },
  { skill: "SQL", aliases: ["sql"] },
  { skill: "PostgreSQL", aliases: ["postgresql", "postgres", "postgre sql"] },
  { skill: "MySQL", aliases: ["mysql"] },
  { skill: "MongoDB", aliases: ["mongodb", "mongo db", "mongo"] },
  {
    skill: "REST APIs",
    aliases: ["rest api", "rest apis", "restful api", "restful apis"],
  },
  { skill: "APIs", aliases: ["api", "apis"] },
  { skill: "GraphQL", aliases: ["graphql", "graph ql"] },
  { skill: "HTML", aliases: ["html"] },
  { skill: "CSS", aliases: ["css"] },
  { skill: "Redux", aliases: ["redux", "redux toolkit"] },
  { skill: "Flutter", aliases: ["flutter"] },
  { skill: "Dart", aliases: ["dart"] },
  { skill: "Android", aliases: ["android"] },
  { skill: "iOS", aliases: ["ios", "i os"] },
  { skill: "Swift", aliases: ["swift"] },
  { skill: "Kotlin", aliases: ["kotlin"] },
  { skill: "Firebase", aliases: ["firebase"] },
  { skill: "Machine Learning", aliases: ["machine learning", "ml"] },
  { skill: "Power BI", aliases: ["power bi", "powerbi"] },
  { skill: "Tableau", aliases: ["tableau"] },
  { skill: "Excel", aliases: ["excel"] },
  { skill: "Pandas", aliases: ["pandas"] },
  { skill: "NumPy", aliases: ["numpy"] },
  { skill: "Cybersecurity", aliases: ["cybersecurity", "cyber security"] },
  { skill: "Git", aliases: ["git", "github", "git/github", "gitlab"] },
  { skill: "Problem Solving", aliases: ["problem solving", "problem-solving"] },
];

function normalizeInsightsText(value: string) {
  return value
    .toLowerCase()
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[^a-z0-9+#./]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function incrementCount(map: Map<string, number>, key: string, amount = 1) {
  map.set(key, (map.get(key) ?? 0) + amount);
}

function distributionFromCounts(
  counts: Map<string, number>,
  total: number,
  limit?: number,
): InsightsDistributionItem[] {
  return Array.from(counts.entries())
    .map(([label, value]) => ({
      label,
      value,
      percent: total ? Number(((value / total) * 100).toFixed(1)) : 0,
    }))
    .sort(
      (left, right) =>
        right.value - left.value || left.label.localeCompare(right.label),
    )
    .slice(0, limit ?? counts.size);
}

function inferInsightsJobFamily(row: InsightsCandidateSearchCacheRow) {
  const roleTags = asStringArray(row.role_tags).map((tag) => tag.toLowerCase());
  const roleText = [
    ...roleTags,
    row.primary_role ?? "",
    row.current_title ?? "",
    row.headline ?? "",
  ]
    .join(" ")
    .toLowerCase();
  const titleText = [row.current_title ?? "", row.headline ?? ""]
    .join(" ")
    .toLowerCase();
  const skillText = asStringArray(row.skills).join(" ").toLowerCase();
  let bestFamily = "Unclassified";
  let bestScore = 0;

  for (const rule of INSIGHTS_JOB_FAMILY_RULES) {
    let score = 0;
    if (
      rule.roleTags.some(
        (tag) => roleTags.includes(tag) || roleText.includes(tag),
      )
    ) {
      score += 90;
    }
    if (rule.titleSignals.some((signal) => titleText.includes(signal))) {
      score += 55;
    }
    score += Math.min(
      60,
      rule.skillSignals.filter((signal) => skillText.includes(signal)).length *
        12,
    );
    if (score > bestScore) {
      bestScore = score;
      bestFamily = rule.label;
    }
  }

  if (
    roleTags.includes("backend") &&
    roleTags.includes("frontend") &&
    bestScore < 120
  ) {
    return "Full-Stack Engineering";
  }
  return bestScore >= 40 ? bestFamily : "Unclassified";
}

function normalizeInsightsSeniority(value: string | null | undefined) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  return normalized || "unclassified";
}

function normalizePyramidSeniority(value: string | null | undefined) {
  const normalized = normalizeInsightsSeniority(value);
  if (
    normalized === "staff-plus" ||
    normalized === "principal" ||
    normalized === "manager"
  ) {
    return "lead";
  }
  if (
    normalized === "junior" ||
    normalized === "mid" ||
    normalized === "senior" ||
    normalized === "lead" ||
    normalized === "executive"
  ) {
    return normalized;
  }
  return "junior";
}

function buildInsightsSparkline(
  rows: InsightsCandidateSearchCacheRow[],
  now = new Date(),
) {
  const bucketCount = 6;
  const bucketMs = 5 * 24 * 60 * 60 * 1000;
  const startMs = now.getTime() - bucketCount * bucketMs;
  const buckets = Array.from({ length: bucketCount }, () => 0);
  for (const row of rows) {
    const createdMs = Date.parse(row.created_at ?? "");
    if (!Number.isFinite(createdMs) || createdMs < startMs) {
      continue;
    }
    const bucketIndex = Math.min(
      bucketCount - 1,
      Math.max(0, Math.floor((createdMs - startMs) / bucketMs)),
    );
    buckets[bucketIndex] += 1;
  }
  return buckets;
}

function buildSkillCatalog(rows: InsightsCandidateSearchCacheRow[]) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    for (const skill of asStringArray(row.skills)) {
      incrementCount(counts, skill.trim());
    }
  }
  return Array.from(counts.entries())
    .map(([skill, count]) => ({ skill, count }))
    .sort(
      (left, right) =>
        right.count - left.count || left.skill.localeCompare(right.skill),
    );
}

function aliasGroupForSkill(skill: string) {
  const key = normalizeInsightsText(skill);
  return INSIGHTS_SKILL_ALIAS_GROUPS.find((group) =>
    [group.skill, ...group.aliases].some(
      (alias) => normalizeInsightsText(alias) === key,
    )
  );
}

function resolveFallbackGapSkills(
  targetRole: string | null,
  explicitSkills: string[],
  skillCatalog: Array<{ skill: string; count: number }>,
) {
  const catalogByNorm = new Map(
    skillCatalog.map((item) => [normalizeInsightsText(item.skill), item.skill]),
  );
  const normalizedInput = normalizeInsightsText(targetRole ?? "");
  const segments = new Set(
    normalizedInput
      .replace(
        /\b(?:and|with|plus|including|using|requires?|need|needed|for|or)\b/g,
        ",",
      )
      .split(/[,;&|/]+/)
      .map((segment) => segment.trim())
      .filter(Boolean),
  );
  const resolved: string[] = [];
  const seen = new Set<string>();

  function addSkill(skill: string) {
    const group = aliasGroupForSkill(skill);
    const label =
      catalogByNorm.get(normalizeInsightsText(group?.skill ?? skill)) ??
        group?.skill ??
        skill.trim();
    const key = normalizeInsightsText(label);
    if (key && !seen.has(key)) {
      seen.add(key);
      resolved.push(label);
    }
  }

  const aliasCandidates = [
    ...INSIGHTS_SKILL_ALIAS_GROUPS.flatMap((group) =>
      [group.skill, ...group.aliases].map((alias) => ({
        skill: group.skill,
        alias,
      }))
    ),
    ...skillCatalog.map((item) => ({ skill: item.skill, alias: item.skill })),
  ].sort(
    (left, right) =>
      normalizeInsightsText(right.alias).length -
      normalizeInsightsText(left.alias).length,
  );

  for (const candidate of aliasCandidates) {
    const alias = normalizeInsightsText(candidate.alias);
    if (!alias) {
      continue;
    }
    const isReactInsideReactNative = alias === "react" &&
      normalizedInput.includes("react native") &&
      !segments.has("react");
    if (
      !isReactInsideReactNative &&
      normalizedInput &&
      ` ${normalizedInput} `.includes(` ${alias} `)
    ) {
      addSkill(candidate.skill);
    }
  }

  for (const skill of explicitSkills) {
    addSkill(skill);
  }

  if (!resolved.length && !targetRole && !explicitSkills.length) {
    return ["Kubernetes", "Terraform"];
  }
  return resolved.slice(0, 12);
}

function candidateHasFallbackSkill(
  candidateSkills: string[],
  targetSkill: string,
) {
  const group = aliasGroupForSkill(targetSkill);
  const aliases = group ? [group.skill, ...group.aliases] : [targetSkill];
  const candidateKeys = new Set<string>();
  for (const skill of candidateSkills) {
    const candidateGroup = aliasGroupForSkill(skill);
    for (
      const alias of candidateGroup
        ? [candidateGroup.skill, ...candidateGroup.aliases]
        : [skill]
    ) {
      candidateKeys.add(normalizeInsightsText(alias));
    }
  }
  return aliases.some((alias) =>
    candidateKeys.has(normalizeInsightsText(alias))
  );
}

function buildFallbackGapAnalysis(
  rows: InsightsCandidateSearchCacheRow[],
  targetRole: string | null,
  explicitSkills: string[],
  skillCatalog = buildSkillCatalog(rows),
): InsightsGapAnalysis {
  const targetSkills = resolveFallbackGapSkills(
    targetRole,
    explicitSkills,
    skillCatalog,
  );
  let fullyMatchingCandidates = 0;
  let partiallyMatchingCandidates = 0;
  let zeroMatchCandidates = 0;
  const missingSkills = new Map<string, number>();

  for (const row of rows) {
    const skills = asStringArray(row.skills);
    if (!targetSkills.length) {
      continue;
    }
    const matchedSkills = targetSkills.filter((skill) =>
      candidateHasFallbackSkill(skills, skill)
    );
    if (matchedSkills.length === targetSkills.length) {
      fullyMatchingCandidates += 1;
    } else if (matchedSkills.length > 0) {
      partiallyMatchingCandidates += 1;
      for (const skill of targetSkills) {
        if (!candidateHasFallbackSkill(skills, skill)) {
          incrementCount(missingSkills, skill);
        }
      }
    } else {
      zeroMatchCandidates += 1;
    }
  }

  return {
    targetRole,
    targetSkills,
    fullyMatchingCandidates,
    partiallyMatchingCandidates,
    zeroMatchCandidates,
    missingSkills: Array.from(missingSkills.entries())
      .map(([skill, missingFromPartialCandidates]) => ({
        skill,
        missingFromPartialCandidates,
      }))
      .sort(
        (left, right) =>
          right.missingFromPartialCandidates -
            left.missingFromPartialCandidates ||
          left.skill.localeCompare(right.skill),
      ),
  };
}

async function fetchInsightsFallbackRows(
  supabase: ReturnType<typeof createAuthedClient>,
  tenantIds: string[],
) {
  const rows: InsightsCandidateSearchCacheRow[] = [];
  for (
    let offset = 0;
    offset < INSIGHTS_FALLBACK_MAX_ROWS;
    offset += SEARCH_PAGE_SIZE
  ) {
    let request = supabase
      .from("candidate_search_cache")
      .select(
        "tenant_id,candidate_id,current_title,headline,location,years_experience,seniority,primary_role,role_tags,skills,created_at,updated_at",
      )
      .order("created_at", { ascending: false })
      .range(offset, offset + SEARCH_PAGE_SIZE - 1);

    if (tenantIds.length) {
      request = request.in("tenant_id", tenantIds);
    }

    const { data, error } = await request;
    if (error) {
      throw error;
    }
    const page = (data ?? []) as InsightsCandidateSearchCacheRow[];
    rows.push(...page);
    if (page.length < SEARCH_PAGE_SIZE) {
      break;
    }
  }
  return rows;
}

function buildFallbackGapUseCases(
  skillCatalog: Array<{ skill: string; count: number }>,
) {
  const catalog = skillCatalog.map((item) => item.skill);
  const findSkill = (aliases: string[]) => {
    const keys = new Set(aliases.map(normalizeInsightsText));
    return catalog.find((skill) => keys.has(normalizeInsightsText(skill)));
  };
  const templates = [
    {
      id: "employer-brief",
      title: "Employer brief",
      detail: "Check whether the pool can satisfy a live role demand.",
      groups: [["React"], ["React Native"], ["TypeScript", "JavaScript"]],
    },
    {
      id: "training-cohort",
      title: "Training cohort",
      detail:
        "Find partial candidates that could convert with focused upskilling.",
      groups: [
        ["Kubernetes"],
        ["Terraform"],
        ["Docker"],
        ["AWS", "Azure", "Google Cloud"],
      ],
    },
    {
      id: "funding-evidence",
      title: "Funding evidence",
      detail: "Quantify scarce capabilities for program and grant narratives.",
      groups: [["SQL"], ["Power BI"], ["Tableau", "Excel"], ["Python"]],
    },
    {
      id: "delivery-risk",
      title: "Delivery risk",
      detail:
        "Spot backend/API supply depth before committing to delivery targets.",
      groups: [
        ["Node.js"],
        ["REST APIs", "APIs"],
        ["PostgreSQL", "SQL"],
        ["GraphQL"],
      ],
    },
  ];
  return templates
    .map((template) => {
      const skills = template.groups
        .map(findSkill)
        .filter((skill): skill is string => Boolean(skill));
      return {
        id: template.id,
        title: template.title,
        detail: template.detail,
        skills,
        query: skills.join(" and "),
      };
    })
    .filter((item) => item.skills.length >= 2);
}

function buildFallbackInsightsDashboard(
  rows: InsightsCandidateSearchCacheRow[],
  topSkills: number,
  targetRole: string | null,
  targetSkills: string[],
) {
  const now = new Date();
  const currentWindowStart = now.getTime() - 30 * 24 * 60 * 60 * 1000;
  const previousWindowStart = now.getTime() - 60 * 24 * 60 * 60 * 1000;
  const total = rows.length;
  const added30 = rows.filter(
    (row) => Date.parse(row.created_at ?? "") >= currentWindowStart,
  ).length;
  const previousAdded30 = rows.filter((row) => {
    const createdMs = Date.parse(row.created_at ?? "");
    return createdMs >= previousWindowStart && createdMs < currentWindowStart;
  }).length;
  const seniorityCounts = new Map<string, number>();
  const locationCounts = new Map<string, number>();
  const jobFamilyCounts = new Map<string, number>();
  const pyramidCounts = new Map<
    string,
    {
      junior: number;
      mid: number;
      senior: number;
      lead: number;
      executive: number;
    }
  >();
  let classifiedCount = 0;
  let skillTotal = 0;

  for (const row of rows) {
    const skills = asStringArray(row.skills);
    const jobFamily = inferInsightsJobFamily(row);
    const seniority = normalizeInsightsSeniority(row.seniority);
    const location = String(row.location ?? "").trim() || "Unknown";
    incrementCount(seniorityCounts, seniority);
    incrementCount(locationCounts, location);
    incrementCount(jobFamilyCounts, jobFamily);
    if (jobFamily !== "Unclassified") {
      classifiedCount += 1;
    }
    skillTotal += skills.length;
    const pyramidSeniority = normalizePyramidSeniority(row.seniority);
    const pyramid = pyramidCounts.get(jobFamily) ?? {
      junior: 0,
      mid: 0,
      senior: 0,
      lead: 0,
      executive: 0,
    };
    pyramid[pyramidSeniority] += 1;
    pyramidCounts.set(jobFamily, pyramid);
  }

  const skillCatalog = buildSkillCatalog(rows);
  const deltaValue = added30 - previousAdded30;
  const trend = deltaValue > 0 ? "up" : deltaValue < 0 ? "down" : "flat";

  return {
    generatedAt: now.toISOString(),
    metrics: [
      {
        key: "total_cvs_indexed",
        label: "Total CVs Indexed",
        value: total,
        deltaValue,
        deltaPercent: previousAdded30
          ? Number(((deltaValue / previousAdded30) * 100).toFixed(1))
          : null,
        trend,
        sparkline: buildInsightsSparkline(rows, now),
      },
      {
        key: "cvs_added_30d",
        label: "CVs Added (Last 30 Days)",
        value: added30,
        deltaValue,
        deltaPercent: previousAdded30
          ? Number(((deltaValue / previousAdded30) * 100).toFixed(1))
          : null,
        trend,
        sparkline: buildInsightsSparkline(rows, now),
      },
      {
        key: "job_family_coverage",
        label: "Job Family Coverage",
        value: total ? Number(((classifiedCount / total) * 100).toFixed(1)) : 0,
        deltaValue: 0,
        deltaPercent: null,
        trend: "flat",
        sparkline: buildInsightsSparkline(rows, now),
      },
      {
        key: "avg_skills_per_profile",
        label: "Avg Skills per Profile",
        value: total ? Number((skillTotal / total).toFixed(1)) : 0,
        deltaValue: 0,
        deltaPercent: null,
        trend: "flat",
        sparkline: buildInsightsSparkline(rows, now),
      },
    ],
    profilesBySeniority: distributionFromCounts(seniorityCounts, total),
    profilesByLocation: distributionFromCounts(locationCounts, total, 12),
    jobFamilies: distributionFromCounts(jobFamilyCounts, total),
    skillsFrequency: skillCatalog.slice(0, topSkills),
    gapUseCases: buildFallbackGapUseCases(skillCatalog),
    seniorityPyramid: Array.from(pyramidCounts.entries())
      .map(([jobFamily, values]) => ({ jobFamily, ...values }))
      .sort((left, right) => {
        const leftTotal = left.junior + left.mid + left.senior + left.lead +
          left.executive;
        const rightTotal = right.junior +
          right.mid +
          right.senior +
          right.lead +
          right.executive;
        return (
          rightTotal - leftTotal ||
          left.jobFamily.localeCompare(right.jobFamily)
        );
      }),
    gapAnalysis: buildFallbackGapAnalysis(
      rows,
      targetRole,
      targetSkills,
      skillCatalog,
    ),
  };
}

async function getInsightsDashboard(
  supabase: ReturnType<typeof createAuthedClient>,
  tenantIds: string[],
  body: JsonRecord,
) {
  const startedAt = Date.now();
  const topSkills = Math.max(
    1,
    Math.min(200, Math.trunc(asNumber(body.top_skills) ?? 50)),
  );
  const targetSkills = asStringArray(body.target_skills);
  const targetRole = asString(body.target_role);
  const traceId = asString(body.trace_id);

  const { data, error } = await supabase.rpc("insights_dashboard_snapshot_v1", {
    p_tenant_ids: tenantIds.length ? tenantIds : null,
    p_top_skills: topSkills,
    p_target_skills: targetSkills.length ? targetSkills : null,
    p_target_role: targetRole,
  });
  if (error) {
    if (isMissingRpcError(error)) {
      const rows = await fetchInsightsFallbackRows(supabase, tenantIds);
      return buildFallbackInsightsDashboard(
        rows,
        topSkills,
        targetRole,
        targetSkills,
      );
    }
    throw error;
  }

  const durationMs = Date.now() - startedAt;
  const auditTenantId = tenantIds.length === 1 ? tenantIds[0] : null;
  const userId = await getCurrentUserId(supabase).catch(() => null);
  await supabase
    .from("insights_query_audit")
    .insert({
      tenant_id: auditTenantId,
      actor_user_id: userId,
      query_type: "insights_dashboard_snapshot",
      filters: {
        tenant_ids: tenantIds,
        top_skills: topSkills,
        target_skills: targetSkills,
        target_role: targetRole,
      },
      duration_ms: durationMs,
      row_count: null,
      trace_id: traceId,
    })
    .then(
      () => null,
      () => null,
    );

  return data;
}

async function getInsightsGapAnalysis(
  supabase: ReturnType<typeof createAuthedClient>,
  tenantIds: string[],
  body: JsonRecord,
) {
  const startedAt = Date.now();
  const targetSkills = asStringArray(body.target_skills);
  const targetRole = asString(body.target_role);
  const traceId = asString(body.trace_id);

  const { data, error } = await supabase.rpc("insights_gap_analysis_v1", {
    p_tenant_ids: tenantIds.length ? tenantIds : null,
    p_target_skills: targetSkills.length ? targetSkills : null,
    p_target_role: targetRole,
  });
  if (error) {
    if (isMissingRpcError(error)) {
      const rows = await fetchInsightsFallbackRows(supabase, tenantIds);
      return buildFallbackGapAnalysis(rows, targetRole, targetSkills);
    }
    throw error;
  }

  const durationMs = Date.now() - startedAt;
  const auditTenantId = tenantIds.length === 1 ? tenantIds[0] : null;
  const userId = await getCurrentUserId(supabase).catch(() => null);
  await supabase
    .from("insights_query_audit")
    .insert({
      tenant_id: auditTenantId,
      actor_user_id: userId,
      query_type: "insights_gap_analysis",
      filters: {
        tenant_ids: tenantIds,
        target_skills: targetSkills,
        target_role: targetRole,
      },
      duration_ms: durationMs,
      row_count: null,
      trace_id: traceId,
    })
    .then(
      () => null,
      () => null,
    );

  return data;
}

async function acknowledgeOpsAlert(
  supabase: ReturnType<typeof createAuthedClient>,
  dedupeKey: string,
) {
  if (!dedupeKey) {
    throw new Error("dedupe_key is required");
  }
  const { data, error } = await supabase.rpc("ops_ack_alert_v1", {
    p_dedupe_key: dedupeKey,
  });
  if (error) {
    throw error;
  }
  return data;
}

async function getAuthContext(supabase: ReturnType<typeof createAuthedClient>) {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError) {
    throw userError;
  }
  if (!user) {
    return { memberships: [], is_platform_admin: false };
  }

  const [membershipResult, platformAdminResult] = await Promise.all([
    supabase
      .from("tenant_memberships")
      .select("tenant_id, role, status")
      .eq("user_id", user.id)
      .eq("status", "active"),
    supabase
      .from("platform_admins")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  if (membershipResult.error) {
    throw membershipResult.error;
  }

  const platformAdminQueryFailed = platformAdminResult.error &&
    !/platform_admins/i.test(platformAdminResult.error.message) &&
    platformAdminResult.error.code !== "PGRST205";
  if (platformAdminQueryFailed) {
    throw platformAdminResult.error;
  }

  type MembershipRow = {
    tenant_id: string;
    role: string;
    status: string;
  };

  const membershipRows: MembershipRow[] =
    (membershipResult.data as MembershipRow[]) ?? [];

  const isPlatformAdmin = Boolean(platformAdminResult.data?.user_id);
  if (!membershipRows.length && !isPlatformAdmin) {
    return { memberships: [], is_platform_admin: false };
  }

  const tenantIds = membershipRows
    .map((membership) => membership.tenant_id)
    .filter(Boolean);
  const tenantResult = isPlatformAdmin
    ? await supabase
      .from("tenants")
      .select("id, slug, name, icon_url")
      .order("name")
    : await supabase
      .from("tenants")
      .select("id, slug, name, icon_url")
      .in("id", tenantIds);

  if (tenantResult.error) {
    throw tenantResult.error;
  }
  type TenantRow = {
    id: string;
    slug: string;
    name: string;
    icon_url: string | null;
  };
  const tenantRows: TenantRow[] = (tenantResult.data as TenantRow[]) ?? [];
  const tenantMap = new Map(tenantRows.map((tenant) => [tenant.id, tenant]));
  const memberships = membershipRows
    .map((membership) => {
      const tenant = tenantMap.get(membership.tenant_id);
      if (!tenant) {
        return null;
      }
      return {
        id: tenant.id,
        slug: tenant.slug,
        name: tenant.name,
        iconUrl: tenant.icon_url,
        role: membership.role,
        status: membership.status,
      };
    })
    .filter(Boolean);

  if (isPlatformAdmin) {
    memberships.push(
      ...tenantRows.map((tenant) => ({
        id: tenant.id,
        slug: tenant.slug,
        name: tenant.name,
        iconUrl: tenant.icon_url,
        role: "platform-admin",
        status: "active",
      })),
    );
  }

  return {
    memberships,
    is_platform_admin: isPlatformAdmin,
  };
}

async function bootstrapTenant(
  supabase: ReturnType<typeof createAuthedClient>,
  body: JsonRecord,
) {
  const name = asString(body.name);
  const slug = asString(body.slug);
  if (!name || !slug) {
    throw new Error("name and slug are required");
  }
  const { error } = await supabase.rpc("bootstrap_tenant_v1", {
    p_name: name,
    p_slug: slug,
  });
  if (error) {
    throw error;
  }
  return { ok: true };
}

async function getCandidateDetail(
  supabase: ReturnType<typeof createAuthedClient>,
  candidateId: string,
) {
  const [dossier, chunks] = await Promise.all([
    supabase
      .from("candidate_dossier_v1")
      .select(
        "candidate_id, source_document_id, tenant_id, name, headline, current_title, location, years_experience, seniority, primary_role, top_skills, email, phone, links, summary_short, short_summary, long_summary, strengths, risks, recommended_roles, timeline_json, profile_json, original_filename, mime_type, storage_path, source_uri, confidence",
      )
      .eq("candidate_id", candidateId)
      .maybeSingle(),
    supabase
      .from("candidate_chunks")
      .select("id, chunk_type, text")
      .eq("candidate_id", candidateId)
      .eq("is_active", true)
      .order("chunk_index", { ascending: true })
      .limit(6),
  ]);

  if (dossier.error) {
    throw dossier.error;
  }
  if (!dossier.data) {
    throw new Error(`Candidate ${candidateId} was not found.`);
  }
  if (chunks.error) {
    throw chunks.error;
  }

  const dossierRow = asRecord(dossier.data);
  const sourceDocumentId = asString(dossierRow.source_document_id);
  const tenantId = asString(dossierRow.tenant_id);
  let manatalCandidateId: string | null = null;
  if (sourceDocumentId) {
    let syncQuery = supabase
      .from("manatal_candidate_sync")
      .select("manatal_candidate_id")
      .eq("source_document_id", sourceDocumentId)
      .limit(1);
    if (tenantId) {
      syncQuery = syncQuery.eq("tenant_id", tenantId);
    }
    const syncResult = await syncQuery;
    if (!syncResult.error) {
      manatalCandidateId = asString(
        (syncResult.data ?? [])[0]?.manatal_candidate_id,
      );
    }
  }

  return {
    dossier: {
      ...dossier.data,
      manatal_candidate_id: manatalCandidateId,
    },
    chunks: chunks.data ?? [],
  };
}

function asInteger(value: unknown, fallback: number, min: number, max: number) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

async function getParsingOverview(
  supabase: ReturnType<typeof createAuthedClient>,
  tenantIds: string[],
  body: JsonRecord,
) {
  const limit = asInteger(body.limit, 100, 0, 500);
  const offset = asInteger(body.offset, 0, 0, 100000);
  const needsReviewOnly = body.needs_review_only === true;
  const query = asString(body.query);
  const { data, error } = await supabase.rpc("parsing_overview_page_v1", {
    p_tenant_ids: tenantIds.length ? tenantIds : null,
    p_limit: limit,
    p_offset: offset,
    p_needs_review_only: needsReviewOnly,
    p_query: query,
  });
  if (error) {
    throw error;
  }
  return data;
}

async function getCandidatesList(
  supabase: ReturnType<typeof createAuthedClient>,
  tenantIds: string[],
  body: JsonRecord,
) {
  const limit = asInteger(body.limit, 50, 1, 200);
  const offset = asInteger(body.offset, 0, 0, 100000);
  const updatedFrom = asString(body.updated_from);
  const updatedTo = asString(body.updated_to);
  const { data, error } = await supabase.rpc("candidates_list_page_v1", {
    p_tenant_ids: tenantIds.length ? tenantIds : null,
    p_limit: limit,
    p_offset: offset,
    p_query: asString(body.query),
    p_status: asString(body.status),
    p_role: asString(body.role),
    p_source: asString(body.source),
    p_location: asString(body.location),
    p_updated_from: updatedFrom || null,
    p_updated_to: updatedTo || null,
    p_group_by: asString(body.group_by),
  });
  if (error) {
    throw error;
  }
  return data;
}

async function getParsingDocument(
  supabase: ReturnType<typeof createAuthedClient>,
  documentId: string,
  tenantIds: string[],
) {
  let documentQuery = supabase
    .from("source_documents")
    .select(
      "id, tenant_id, candidate_id, source_type, original_filename, mime_type, source_uri, storage_path, created_at, updated_at",
    )
    .eq("id", documentId);

  if (tenantIds.length) {
    documentQuery = documentQuery.in("tenant_id", tenantIds);
  }

  const documentResult = await documentQuery.maybeSingle();
  if (documentResult.error) {
    throw documentResult.error;
  }
  if (!documentResult.data) {
    return { documents: [], candidates: [], profiles: [], runs: [] };
  }

  const document = documentResult.data as JsonRecord;
  const [candidateResult, profileByDocumentResult, runsResult] = await Promise
    .all([
      document.candidate_id
        ? supabase
          .from("candidates")
          .select(
            "id, tenant_id, name, headline, current_title, location, years_experience, seniority, primary_role, top_skills, email, phone, links, summary_short, status",
          )
          .eq("id", document.candidate_id)
          .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      supabase
        .from("candidate_profiles")
        .select(
          "tenant_id, candidate_id, source_document_id, profile_json, timeline_json, skill_matrix_json, raw_text, confidence, missing_fields, parse_warnings, created_at, updated_at",
        )
        .eq("source_document_id", documentId)
        .maybeSingle(),
      supabase
        .from("processing_runs")
        .select(
          "tenant_id, source_document_id, status, parser_version, model_version, prompt_version, chunk_version, embedding_version, warnings, error_code, error_message, created_at, updated_at, metadata_json",
        )
        .eq("source_document_id", documentId)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

  if (candidateResult.error) {
    throw candidateResult.error;
  }
  if (profileByDocumentResult.error) {
    throw profileByDocumentResult.error;
  }
  if (runsResult.error) {
    throw runsResult.error;
  }

  let profile = profileByDocumentResult.data;
  if (!profile && document.candidate_id) {
    const profileByCandidateResult = await supabase
      .from("candidate_profiles")
      .select(
        "tenant_id, candidate_id, source_document_id, profile_json, timeline_json, skill_matrix_json, raw_text, confidence, missing_fields, parse_warnings, created_at, updated_at",
      )
      .eq("candidate_id", document.candidate_id)
      .maybeSingle();
    if (profileByCandidateResult.error) {
      throw profileByCandidateResult.error;
    }
    profile = profileByCandidateResult.data;
  }

  return {
    documents: [document],
    candidates: candidateResult.data ? [candidateResult.data] : [],
    profiles: profile ? [profile] : [],
    runs: runsResult.data ?? [],
  };
}

async function getOriginalDocumentUrl(
  supabase: ReturnType<typeof createAuthedClient>,
  body: JsonRecord,
  tenantIds: string[],
) {
  await getCurrentUserId(supabase);

  const documentId = asString(body.document_id);
  const candidateId = asString(body.candidate_id);
  const tenantId = asString(body.tenant_id);

  if (!documentId && !candidateId) {
    throw new Error("document_id or candidate_id is required.");
  }

  let query = supabase
    .from("source_documents")
    .select(
      "id, tenant_id, candidate_id, source_uri, storage_path, original_filename",
    );

  if (documentId) {
    query = query.eq("id", documentId);
  } else if (candidateId) {
    query = query.eq("candidate_id", candidateId);
  }

  if (tenantId) {
    query = query.eq("tenant_id", tenantId);
  } else if (tenantIds.length) {
    query = query.in("tenant_id", tenantIds);
  }

  const { data, error } = await query
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }
  if (!data) {
    throw new Error(
      "Original CV was not found or is not available to this user.",
    );
  }

  const document = data as OriginalDocumentRow;
  const gcsLocation = resolveGcsLocation(document);
  if (gcsLocation) {
    try {
      const signedUrl = await createGcsSignedUrl(
        gcsLocation.bucket,
        gcsLocation.objectName,
      );
      return {
        url: signedUrl.url,
        source: "gcs_signed_url",
        expires_at: signedUrl.expiresAt,
        original_filename: document.original_filename,
      };
    } catch (signError) {
      const fallbackSourceUri = asString(document.source_uri);
      if (!isBrowserOpenableSource(fallbackSourceUri)) {
        throw signError;
      }
    }
  }

  const browserSourceUri = asString(document.source_uri);
  if (isBrowserOpenableSource(browserSourceUri)) {
    return {
      url: browserSourceUri,
      source: "source_uri",
      expires_at: null,
      original_filename: document.original_filename,
    };
  }

  throw new Error("Original CV does not have a browser-openable source yet.");
}

const parserProfileSelect = [
  "id",
  "tenant_id",
  "name",
  "slug",
  "description",
  "status",
  "extraction_provider",
  "extraction_model",
  "parser_version",
  "model_version",
  "prompt_version",
  "chunk_version",
  "embedding_provider",
  "embedding_model",
  "embedding_version",
  "chunking_profile",
  "ocr_enabled",
  "allow_heuristic_fallback",
  "prompt_template",
  "notes",
  "last_evaluated_at",
  "avg_parse_percentage",
  "avg_confidence",
  "documents_evaluated",
  "created_at",
  "updated_at",
].join(", ");

async function getParserProfiles(
  supabase: ReturnType<typeof createAuthedClient>,
  tenantIds: string[],
) {
  let query = supabase
    .from("parser_profiles")
    .select(parserProfileSelect)
    .order("status", { ascending: true })
    .order("updated_at", { ascending: false });

  if (tenantIds.length) {
    query = query.in("tenant_id", tenantIds);
  }

  const { data, error } = await query;
  if (error) {
    throw error;
  }
  return data ?? [];
}

async function saveParserProfile(
  supabase: ReturnType<typeof createAuthedClient>,
  body: JsonRecord,
) {
  const profile = (body.profile ?? {}) as JsonRecord;
  const tenantId = asString(body.tenant_id);
  if (!tenantId) {
    throw new Error("tenant_id is required");
  }

  const payload = {
    tenant_id: tenantId,
    name: asString(profile.name) ?? "Parser profile",
    slug: (asString(profile.slug) ?? "parser-profile").toLowerCase(),
    description: asString(profile.description) ?? "",
    extraction_provider: asString(profile.extractionProvider) ?? "gemini",
    extraction_model: asString(profile.extractionModel) ?? "gemini-2.5-flash",
    parser_version: asString(profile.parserVersion) ?? "pdftotext-raw-v2",
    model_version: asString(profile.modelVersion) ?? "v1",
    prompt_version: asString(profile.promptVersion) ?? "v1",
    chunk_version: asString(profile.chunkVersion) ?? "v1",
    embedding_provider: asString(profile.embeddingProvider) ?? "gemini",
    embedding_model: asString(profile.embeddingModel) ?? "gemini-embedding-001",
    embedding_version: asString(profile.embeddingVersion) ??
      "gemini-embedding-001-768-v1",
    chunking_profile: asString(profile.chunkingProfile) ?? "default",
    ocr_enabled: Boolean(profile.ocrEnabled),
    allow_heuristic_fallback: false,
    prompt_template: asString(profile.promptTemplate) ?? "",
    notes: asString(profile.notes) ?? "",
  };

  const profileId = asString(profile.id);
  const mutation = profileId
    ? supabase
      .from("parser_profiles")
      .update(payload)
      .eq("id", profileId)
      .select(parserProfileSelect)
      .single()
    : supabase
      .from("parser_profiles")
      .insert(payload)
      .select(parserProfileSelect)
      .single();

  const { data, error } = await mutation;
  if (error) {
    throw error;
  }
  return data;
}

async function publishParserProfile(
  supabase: ReturnType<typeof createAuthedClient>,
  profileId: string,
) {
  const { data, error } = await supabase.rpc("publish_parser_profile_v1", {
    p_profile_id: profileId,
  });
  if (error) {
    throw error;
  }
  return data;
}

const shortlistSelect = [
  "user_id",
  "tenant_id",
  "candidate_id",
  "candidate_name",
  "current_title",
  "location",
  "years_experience",
  "seniority",
  "primary_role",
  "top_skills",
  "match_rate",
  "cv_url",
  "original_filename",
  "source_query",
  "search_snapshot",
  "notes",
  "created_at",
  "updated_at",
].join(", ");

async function getCurrentUserId(
  supabase: ReturnType<typeof createAuthedClient>,
) {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error) {
    throw error;
  }
  if (!user) {
    throw new Error("Authentication is required.");
  }
  return user.id;
}

async function getCandidateCvSource(
  supabase: ReturnType<typeof createAuthedClient>,
  tenantId: string,
  candidateId: string,
) {
  const { data, error } = await supabase
    .from("source_documents")
    .select("source_uri, original_filename")
    .eq("tenant_id", tenantId)
    .eq("candidate_id", candidateId)
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

async function getShortlistItems(
  supabase: ReturnType<typeof createAuthedClient>,
  tenantIds: string[],
) {
  const userId = await getCurrentUserId(supabase);
  let query = supabase
    .from("candidate_shortlist_items")
    .select(shortlistSelect)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (tenantIds.length) {
    query = query.in("tenant_id", tenantIds);
  }

  const { data, error } = await query;
  if (error) {
    throw error;
  }
  return data ?? [];
}

async function saveShortlistItem(
  supabase: ReturnType<typeof createAuthedClient>,
  body: JsonRecord,
) {
  const userId = await getCurrentUserId(supabase);
  const item = asRecord(body.item);
  const tenantId = asString(item.tenant_id);
  const candidateId = asString(item.candidate_id);
  if (!tenantId || !candidateId) {
    throw new Error("tenant_id and candidate_id are required");
  }

  const matchRate = asNumber(item.match_rate);
  const yearsExperience = asNumber(item.years_experience);
  const cvSource = await getCandidateCvSource(supabase, tenantId, candidateId);
  const payload = {
    user_id: userId,
    tenant_id: tenantId,
    candidate_id: candidateId,
    candidate_name: asString(item.candidate_name) ?? "Unknown candidate",
    current_title: asString(item.current_title) ?? "Candidate",
    location: asString(item.location) ?? "Unknown",
    years_experience: yearsExperience,
    seniority: asString(item.seniority),
    primary_role: asString(item.primary_role),
    top_skills: asStringArray(item.top_skills).slice(0, 24),
    match_rate: matchRate === null
      ? null
      : Math.max(0, Math.min(100, Math.round(matchRate))),
    cv_url: asString(cvSource?.source_uri) ?? asString(item.cv_url),
    original_filename: asString(cvSource?.original_filename) ??
      asString(item.original_filename),
    source_query: asString(item.source_query) ?? "",
    search_snapshot: asRecord(item.search_snapshot),
    notes: asString(item.notes) ?? "",
  };

  const { data, error } = await supabase
    .from("candidate_shortlist_items")
    .upsert(payload, { onConflict: "user_id,tenant_id,candidate_id" })
    .select(shortlistSelect)
    .single();
  if (error) {
    throw error;
  }
  return data;
}

async function deleteShortlistItem(
  supabase: ReturnType<typeof createAuthedClient>,
  body: JsonRecord,
) {
  const userId = await getCurrentUserId(supabase);
  const candidateId = asString(body.candidate_id);
  const tenantId = asString(body.tenant_id);
  if (!candidateId) {
    throw new Error("candidate_id is required");
  }

  let query = supabase
    .from("candidate_shortlist_items")
    .delete()
    .eq("user_id", userId)
    .eq("candidate_id", candidateId);

  if (tenantId) {
    query = query.eq("tenant_id", tenantId);
  }

  const { error } = await query;
  if (error) {
    throw error;
  }
  return { ok: true };
}

async function clearShortlistItems(
  supabase: ReturnType<typeof createAuthedClient>,
  tenantIds: string[],
) {
  const userId = await getCurrentUserId(supabase);
  let query = supabase
    .from("candidate_shortlist_items")
    .delete()
    .eq("user_id", userId);

  if (tenantIds.length) {
    query = query.in("tenant_id", tenantIds);
  }

  const { error } = await query;
  if (error) {
    throw error;
  }
  return { ok: true };
}

const jobPostingSelect = [
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

const matchingRunSelect = [
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

const matchingResultSelect = [
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

const jobShortlistSelect = [
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

const jobApplicationSelect = [
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

function clampInteger(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

function normalizeStatus(value: unknown) {
  const normalized = String(value ?? "draft").trim().toLowerCase();
  return normalized === "active" || normalized === "closed"
    ? normalized
    : "draft";
}

function normalizePublicSlug(value: unknown) {
  const raw = asString(value);
  if (!raw) {
    return null;
  }
  const slug = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || null;
}

function normalizeRegion(value: unknown) {
  const normalized = String(value ?? "").trim().toUpperCase();
  return normalized === "GCC" || normalized === "EU" || normalized === "USA"
    ? normalized
    : null;
}

function normalizeEmploymentType(value: unknown) {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    return "";
  }
  const compact = normalized.toLowerCase().replace(/[_\s]+/g, "-");
  const map: Record<string, string> = {
    fulltime: "Full-time",
    "full-time": "Full-time",
    parttime: "Part-time",
    "part-time": "Part-time",
    contract: "Contract",
    temporary: "Temporary",
    internship: "Internship",
    freelance: "Freelance",
    permanent: "Full-time",
  };
  return map[compact] ?? `${normalized[0].toUpperCase()}${normalized.slice(1)}`;
}

function normalizeJobSeniority(value: unknown) {
  const raw = asString(value);
  if (!raw) {
    return "";
  }
  const normalized = normalizeSeniorityValue(raw);
  if (normalized === "staff-plus") {
    return "Lead";
  }
  if (normalized === "senior") {
    return "Senior";
  }
  if (normalized === "mid") {
    return "Mid";
  }
  if (normalized === "junior") {
    return /intern/i.test(raw) ? "Intern" : "Junior";
  }
  return raw;
}

function seniorityRank(value: unknown) {
  const normalized = normalizeJobSeniority(value).toLowerCase();
  if (normalized.includes("executive")) {
    return 7;
  }
  if (normalized.includes("principal")) {
    return 6;
  }
  if (
    normalized.includes("lead") || normalized.includes("architect") ||
    normalized.includes("staff")
  ) {
    return 5;
  }
  if (normalized.includes("senior")) {
    return 4;
  }
  if (normalized.includes("mid") || normalized.includes("intermediate")) {
    return 3;
  }
  if (normalized.includes("junior")) {
    return 2;
  }
  if (normalized.includes("intern")) {
    return 1;
  }
  return 0;
}

function seniorityAlignment(candidate: unknown, required: unknown) {
  const candidateRank = seniorityRank(candidate);
  const requiredRank = seniorityRank(required);
  if (!candidateRank || !requiredRank) {
    return "Partial Match";
  }
  if (candidateRank === requiredRank) {
    return "Exact Match";
  }
  if (
    Math.abs(candidateRank - requiredRank) === 1 || candidateRank > requiredRank
  ) {
    return "Partial Match";
  }
  return "Mismatch";
}

function normalizeSkillSet(value: unknown) {
  return normalizeSkillList(asStringArray(value)).slice(0, 40);
}

function extractSkillsFromText(text: string) {
  return normalizeSkillList(
    [
      ...text.matchAll(
        /\b(?:React|TypeScript|JavaScript|Node(?:\.js)?|Python|Java|C#|\.NET|Angular|Vue|Next(?:\.js)?|SQL|PostgreSQL|MySQL|MongoDB|AWS|Azure|Google Cloud|GCP|Docker|Kubernetes|Terraform|GraphQL|REST(?: APIs?)?|PHP|Laravel|Django|FastAPI|Flask|Flutter|React Native|Swift|Kotlin|Linux|Redis|Kafka|TensorFlow|PyTorch|Pandas|NumPy)\b/gi,
      ),
    ].map((match) => match[0]),
  );
}

function heuristicJobExtraction(
  input: {
    title: string | null;
    jobDescription: string;
    employerRegion: string | null;
  },
) {
  const text = input.jobDescription;
  const lower = text.toLowerCase();
  const allSkills = extractSkillsFromText(text);
  const preferred = allSkills.filter((skill) => {
    const index = lower.indexOf(skill.toLowerCase());
    const window = index >= 0
      ? lower.slice(Math.max(0, index - 80), index + 120)
      : "";
    return /preferred|nice to have|plus|bonus|advantage/.test(window);
  });
  const required = allSkills.filter((skill) => !preferred.includes(skill));
  const seniority = normalizeJobSeniority(input.title ?? text) ||
    (/\blead|architect|principal\b/i.test(text)
      ? "Lead"
      : /\bsenior|sr\b/i.test(text)
      ? "Senior"
      : /\bjunior|entry|graduate\b/i.test(text)
      ? "Junior"
      : "Mid");
  const employmentType = /contract|contractor/i.test(text)
    ? "Contract"
    : /part[-\s]?time/i.test(text)
    ? "Part-time"
    : /intern/i.test(text)
    ? "Internship"
    : /freelance/i.test(text)
    ? "Freelance"
    : "Full-time";
  const locationCountry =
    normalizeLocationValue(text, { allowFallback: false }) ??
      (input.employerRegion === "GCC"
        ? "United Arab Emirates"
        : input.employerRegion === "USA"
        ? "United States"
        : null);
  const remotePolicy = /remote/i.test(text)
    ? "Remote"
    : /hybrid/i.test(text)
    ? "Hybrid"
    : /onsite|on-site/i.test(text)
    ? "Onsite"
    : "Unspecified";
  const responsibilities = text
    .split(/\n|(?:^|\s)[*-]\s+/)
    .map((line) => line.trim().replace(/^[-*]\s*/, ""))
    .filter((line) =>
      line.length >= 24 &&
      /\b(?:build|develop|design|lead|manage|deliver|collaborate|implement|maintain|support|create|drive)\b/i
        .test(line)
    )
    .slice(0, 6);

  return {
    requiredSkills: required.map((name) => ({
      name,
      confidence: 0.72,
      evidence: name,
    })),
    preferredSkills: preferred.map((name) => ({
      name,
      confidence: 0.66,
      evidence: name,
    })),
    seniorityLevel: {
      value: seniority,
      confidence: 0.64,
      evidence: input.title ?? "Job description seniority signals",
    },
    employmentType: {
      value: employmentType,
      confidence: 0.7,
      evidence: "Employment type inferred from job description",
    },
    location: {
      country: locationCountry,
      city: null,
      region: input.employerRegion,
      remotePolicy,
      confidence: locationCountry ? 0.62 : 0.38,
    },
    keyResponsibilities: responsibilities,
    warnings: required.length ? [] : [{
      type: "MISSING",
      message:
        "No explicit known technical skills were detected; review required skills manually.",
    }],
  };
}

const jobExtractionSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    requiredSkills: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          confidence: { type: "number" },
          evidence: { type: "string" },
        },
        required: ["name", "confidence", "evidence"],
      },
    },
    preferredSkills: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          confidence: { type: "number" },
          evidence: { type: "string" },
        },
        required: ["name", "confidence", "evidence"],
      },
    },
    seniorityLevel: {
      type: "object",
      additionalProperties: false,
      properties: {
        value: { type: "string" },
        confidence: { type: "number" },
        evidence: { type: "string" },
      },
      required: ["value", "confidence", "evidence"],
    },
    employmentType: {
      type: "object",
      additionalProperties: false,
      properties: {
        value: { type: "string" },
        confidence: { type: "number" },
        evidence: { type: "string" },
      },
      required: ["value", "confidence", "evidence"],
    },
    location: {
      type: "object",
      additionalProperties: false,
      properties: {
        country: { type: ["string", "null"] },
        city: { type: ["string", "null"] },
        region: { type: ["string", "null"] },
        remotePolicy: { type: "string" },
        confidence: { type: "number" },
      },
      required: ["country", "city", "region", "remotePolicy", "confidence"],
    },
    keyResponsibilities: { type: "array", items: { type: "string" } },
    warnings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          type: { type: "string" },
          message: { type: "string" },
        },
        required: ["type", "message"],
      },
    },
  },
  required: [
    "requiredSkills",
    "preferredSkills",
    "seniorityLevel",
    "employmentType",
    "location",
    "keyResponsibilities",
    "warnings",
  ],
};

type JobExtractionPayload = ReturnType<typeof heuristicJobExtraction>;

async function extractJobDescription(
  input: {
    title: string | null;
    jobDescription: string;
    employerRegion: string | null;
  },
) {
  const fallback = heuristicJobExtraction(input);
  try {
    const result = await generateStructuredObject<JobExtractionPayload>({
      schemaName: "job_description_extraction",
      schema: jobExtractionSchema,
      temperature: 0,
      systemPrompt:
        "Extract recruitment job requirements from a job description. Return strict JSON only. Separate required skills from preferred skills. Do not invent skills or employer details. Flag ambiguity in warnings.",
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

function extractionToJobFields(payload: JobExtractionPayload) {
  const requiredSkills = normalizeSkillList(
    payload.requiredSkills.map((skill) => skill.name),
  ).slice(0, 32);
  const preferredSkills = normalizeSkillList(
    payload.preferredSkills.map((skill) => skill.name),
  )
    .filter((skill) => !requiredSkills.includes(skill))
    .slice(0, 32);
  return {
    requiredSkills,
    preferredSkills,
    seniorityLevel: normalizeJobSeniority(payload.seniorityLevel.value),
    employmentType: normalizeEmploymentType(payload.employmentType.value),
    locationInfo: asRecord(payload.location),
    keyResponsibilities: payload.keyResponsibilities.map((item) => item.trim())
      .filter(Boolean).slice(0, 10),
    aiConfidence: {
      requiredSkills: payload.requiredSkills.map((skill) => ({
        name: skill.name,
        confidence: skill.confidence,
      })),
      preferredSkills: payload.preferredSkills.map((skill) => ({
        name: skill.name,
        confidence: skill.confidence,
      })),
      seniorityLevel: payload.seniorityLevel.confidence,
      employmentType: payload.employmentType.confidence,
      location: payload.location.confidence,
    },
  };
}

async function writeAuditEvent(
  supabase: ReturnType<typeof createAuthedClient>,
  input: {
    tenantId: string;
    actorUserId: string;
    action: string;
    entityType: string;
    entityId: string;
    payload?: JsonRecord;
  },
) {
  await supabase.from("audit_events").insert({
    tenant_id: input.tenantId,
    actor_user_id: input.actorUserId,
    action: input.action,
    entity_type: input.entityType,
    entity_id: input.entityId,
    payload: input.payload ?? {},
  });
}

async function listJobPostings(
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

async function getJobPosting(
  supabase: ReturnType<typeof createAuthedClient>,
  jobId: string,
) {
  if (!jobId) {
    throw new Error("job_id is required");
  }
  const { data, error } = await supabase.from("job_postings").select(
    jobPostingSelect,
  ).eq("id", jobId).maybeSingle();
  if (error) {
    throw error;
  }
  if (!data) {
    throw new Error(`Job posting ${jobId} was not found.`);
  }
  return data;
}

async function saveJobPosting(
  supabase: ReturnType<typeof createAuthedClient>,
  body: JsonRecord,
) {
  const userId = await getCurrentUserId(supabase);
  const job = asRecord(body.job);
  const jobId = asString(job.id);
  const existing = jobId
    ? await getJobPosting(supabase, jobId) as unknown as JsonRecord
    : null;
  const tenantId = asString(job.tenant_id) ?? asString(job.tenantId) ??
    asString(existing?.tenant_id);
  if (!tenantId) {
    throw new Error("tenant_id is required");
  }

  const status = normalizeStatus(job.status ?? existing?.status);
  const currentStatus = normalizeStatus(existing?.status);
  const title = asString(job.title) ?? asString(existing?.title) ?? "";
  const employerName = asString(job.employer_name) ??
    asString(job.employerName) ?? asString(existing?.employer_name) ?? "";
  const employerCountry = asString(job.employer_country) ??
    asString(job.employerCountry) ?? asString(existing?.employer_country) ?? "";
  const employerRegion = normalizeRegion(
    job.employer_region ?? job.employerRegion ?? existing?.employer_region,
  );
  const jobDescription = asString(job.job_description) ??
    asString(job.jobDescription) ?? asString(existing?.job_description) ?? "";
  const requiredSkills = normalizeSkillSet(
    job.required_skills ?? job.requiredSkills ?? existing?.required_skills,
  );
  const preferredSkills = normalizeSkillSet(
    job.preferred_skills ?? job.preferredSkills ?? existing?.preferred_skills,
  )
    .filter((skill) => !requiredSkills.includes(skill));
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
  const publicTitle = asString(job.public_title) ?? asString(job.publicTitle) ??
    asString(existing?.public_title) ?? title;
  const publicSummary = asString(job.public_summary) ??
    asString(job.publicSummary) ?? asString(existing?.public_summary);
  const publicDescription = asString(job.public_description) ??
    asString(job.publicDescription) ?? asString(existing?.public_description);
  const publicLocation = asString(job.public_location) ??
    asString(job.publicLocation) ?? asString(existing?.public_location);
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
    (!title || !employerName || !employerCountry || !employerRegion ||
      !jobDescription || !requiredSkills.length || !seniorityLevel ||
      !employmentType)
  ) {
    throw new Error(
      "Publishing requires title, employer, region, description, required skills, seniority, and employment type.",
    );
  }
  if (
    isPublic && status === "active" &&
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
      job.key_responsibilities ?? job.keyResponsibilities ??
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
      ? asString(existing?.public_published_at) ?? now
      : null,
  };

  const mutation = jobId
    ? supabase.from("job_postings").update(payload).eq("id", jobId).select(
      jobPostingSelect,
    ).single()
    : supabase.from("job_postings").insert(payload).select(jobPostingSelect)
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

async function extractJobPosting(
  supabase: ReturnType<typeof createAuthedClient>,
  body: JsonRecord,
) {
  const userId = await getCurrentUserId(supabase);
  const jobId = asString(body.job_id);
  const job = jobId
    ? await getJobPosting(supabase, jobId) as unknown as JsonRecord
    : null;
  const tenantId = asString(body.tenant_id) ?? asString(job?.tenant_id);
  const title = asString(body.title) ?? asString(job?.title);
  const employerRegion = normalizeRegion(
    body.employer_region ?? job?.employer_region,
  );
  const jobDescription = asString(body.job_description) ??
    asString(body.jobDescription) ?? asString(job?.job_description);
  if (!tenantId || !jobDescription) {
    throw new Error("tenant_id and job_description are required");
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

function buildJobProfile(job: JsonRecord) {
  const location = asRecord(job.location_info);
  const lines = [
    `Title: ${asString(job.title) ?? ""}`,
    `Required Skills: ${asStringArray(job.required_skills).join(", ")}`,
    `Preferred Skills: ${asStringArray(job.preferred_skills).join(", ")}`,
    `Seniority: ${asString(job.seniority_level) ?? ""}`,
    `Employment Type: ${asString(job.employment_type) ?? ""}`,
    `Location: ${
      asString(location.country) ?? asString(job.employer_country) ?? ""
    } ${asString(location.remotePolicy) ?? ""}`,
    `Responsibilities: ${asStringArray(job.key_responsibilities).join("; ")}`,
    `Description: ${asString(job.job_description) ?? ""}`,
  ];
  return lines.filter((line) => line.replace(/^[^:]+:\s*/, "").trim()).join(
    "\n",
  );
}

function textIncludesSkill(candidateSkills: string[], requiredSkill: string) {
  const normalized = requiredSkill.toLowerCase();
  return candidateSkills.some((skill) => skill.toLowerCase() === normalized);
}

function scoreCandidateForJob(candidate: JsonRecord, job: JsonRecord) {
  const requiredSkills = asStringArray(job.required_skills);
  const preferredSkills = asStringArray(job.preferred_skills);
  const matchedFilters = asRecord(candidate.matched_filters);
  const candidateSkills = normalizeSkillList([
    ...asStringArray(matchedFilters.matched_skills),
    ...asStringArray(asRecord(candidate.candidate_snapshot).top_skills),
  ]);
  const matchedSkills = requiredSkills.filter((skill) =>
    textIncludesSkill(candidateSkills, skill)
  );
  const missingSkills = requiredSkills.filter((skill) =>
    !textIncludesSkill(candidateSkills, skill)
  );
  const preferredCoverage =
    preferredSkills.filter((skill) => textIncludesSkill(candidateSkills, skill))
      .length / Math.max(1, preferredSkills.length);
  const requiredCoverage = matchedSkills.length /
    Math.max(1, requiredSkills.length);
  const semanticScore = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        (asNumber(candidate.match_rate) ?? asNumber(candidate.score) ?? 0) *
          (asNumber(candidate.match_rate) === null ? 100 : 1),
      ),
    ),
  );
  const alignment = seniorityAlignment(
    candidate.seniority,
    job.seniority_level,
  );
  const seniorityScore = alignment === "Exact Match"
    ? 100
    : alignment === "Partial Match"
    ? 74
    : 35;
  const experienceYears = asNumber(candidate.years_experience) ?? 0;
  const requiredYears = seniorityRank(job.seniority_level) >= 4
    ? 5
    : seniorityRank(job.seniority_level) >= 3
    ? 3
    : 1;
  const experienceScore = Math.min(
    100,
    Math.round((experienceYears / Math.max(1, requiredYears)) * 100),
  );
  const aiScore = Math.round(
    (0.3 * requiredCoverage * 100) +
      (0.25 * Math.min(100, experienceScore)) +
      (0.15 * seniorityScore) +
      (0.1 * semanticScore) +
      (0.1 * preferredCoverage * 100) +
      7,
  );
  const finalScore = Math.max(
    0,
    Math.min(100, Math.round((0.2 * semanticScore) + (0.8 * aiScore))),
  );
  return {
    semanticScore,
    aiScore,
    finalScore,
    matchedSkills,
    missingSkills,
    seniorityAlignment: alignment,
    experienceSummary: `${String(candidate.name ?? "Candidate")} has ${
      experienceYears || "unspecified"
    } years of experience and is indexed as ${
      String(candidate.seniority ?? "unknown")
    } seniority.`,
    matchExplanation: matchedSkills.length
      ? `Matches ${matchedSkills.length} required skill${
        matchedSkills.length === 1 ? "" : "s"
      } for ${String(job.title ?? "this role")}; ${
        missingSkills.length
          ? `missing ${missingSkills.join(", ")}.`
          : "no required skill gaps detected."
      }`
      : `Semantic match found for ${
        String(job.title ?? "this role")
      }, but required skill coverage needs recruiter review.`,
    scoringBreakdown: {
      requiredSkillAlignment: Math.round(requiredCoverage * 30),
      relevantWorkExperience: Math.round(Math.min(25, experienceScore * 0.25)),
      seniorityFit: Math.round(seniorityScore * 0.15),
      domainRelevance: Math.round(semanticScore * 0.1),
      preferredSkillCoverage: Math.round(preferredCoverage * 10),
      employmentHistoryQuality: 7,
    },
  };
}

async function startJobMatchingRun(
  supabase: ReturnType<typeof createAuthedClient>,
  body: JsonRecord,
) {
  const userId = await getCurrentUserId(supabase);
  const jobId = asString(body.job_id);
  const job = await getJobPosting(
    supabase,
    jobId ?? "",
  ) as unknown as JsonRecord;
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
  const runInsert = await supabase.from("job_matching_runs").insert({
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
  }).select(matchingRunSelect).single();
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
      error && `${error.message}`.includes("search_candidates_with_rate_v1")
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
        return String(candidate.location ?? "").toLowerCase().includes(
          location.toLowerCase(),
        );
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
      const insertResults = await supabase.from("job_matching_results").insert(
        rows,
      );
      if (insertResults.error) {
        throw insertResults.error;
      }
    }

    const completedAt = new Date().toISOString();
    const update = await supabase.from("job_matching_runs").update({
      status: "completed",
      retrieved_count: (rawCandidates ?? []).length,
      filtered_count: Math.max(
        0,
        (rawCandidates ?? []).length - candidates.length,
      ),
      reranked_count: Math.min((rawCandidates ?? []).length, rerankPoolSize),
      completed_count: candidates.length,
      completed_at: completedAt,
    }).eq("id", insertedRunId).select(matchingRunSelect).single();
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
    await supabase.from("job_matching_runs").update({
      status: "failed",
      failure_reason: describeError(error),
      completed_at: new Date().toISOString(),
    }).eq("id", insertedRunId);
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

async function listMatchingRuns(
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

async function getMatchingRun(
  supabase: ReturnType<typeof createAuthedClient>,
  runId: string,
) {
  if (!runId) {
    throw new Error("run_id is required");
  }
  const [runResult, resultsResult] = await Promise.all([
    supabase.from("job_matching_runs").select(matchingRunSelect).eq("id", runId)
      .maybeSingle(),
    supabase.from("job_matching_results").select(matchingResultSelect).eq(
      "matching_run_id",
      runId,
    ).order("rank", { ascending: true }),
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

async function listJobApplications(
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
  const status = String(value ?? "").trim().toLowerCase();
  return ["new", "reviewing", "shortlisted", "rejected", "withdrawn"].includes(
      status,
    )
    ? status
    : null;
}

async function updateJobApplicationStatus(
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

async function listJobShortlists(
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

async function getJobShortlist(
  supabase: ReturnType<typeof createAuthedClient>,
  shortlistId: string,
) {
  if (!shortlistId) {
    throw new Error("shortlist_id is required");
  }
  const [shortlistResult, candidatesResult] = await Promise.all([
    supabase.from("job_shortlists").select(jobShortlistSelect).eq(
      "id",
      shortlistId,
    ).maybeSingle(),
    supabase.from("job_shortlist_candidates").select("*").eq(
      "shortlist_id",
      shortlistId,
    ).order("saved_rank", { ascending: true }),
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

async function saveJobShortlist(
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
  const job = await getJobPosting(supabase, jobId) as unknown as JsonRecord;
  const runDetail = runId ? await getMatchingRun(supabase, runId) : null;
  const inputCandidates = asStringArray(body.candidate_ids);
  const resultRows = (asArray(runDetail?.results) as JsonRecord[])
    .filter((result) =>
      !inputCandidates.length ||
      inputCandidates.includes(String(result.candidate_id))
    );
  const shortlistResult = await supabase.from("job_shortlists").insert({
    tenant_id: job.tenant_id,
    job_posting_id: jobId,
    matching_run_id: runId,
    name,
    description: asString(body.description) ?? "",
    owner_user_id: userId,
  }).select(jobShortlistSelect).single();
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { error: "method_not_allowed" });
  }

  try {
    const body = (await req.json()) as JsonRecord;
    const action = asString(body.action);
    const tenantIds = asStringArray(body.tenant_ids);
    const supabase = createAuthedClient(req);

    switch (action) {
      case "auth_context":
        return jsonResponse(200, await getAuthContext(supabase));
      case "bootstrap_tenant":
        return jsonResponse(200, await bootstrapTenant(supabase, body));
      case "search_filter_options":
        return jsonResponse(
          200,
          await getSearchFilterOptions(supabase, tenantIds),
        );
      case "workspace_stats":
        return jsonResponse(200, await getWorkspaceStats(supabase, tenantIds));
      case "manatal_sync_status":
        return jsonResponse(
          200,
          await getManatalSyncStatus(supabase, tenantIds),
        );
      case "system_health":
        return jsonResponse(200, await getSystemHealth(supabase, tenantIds));
      case "ops_alerts":
        return jsonResponse(200, await getOpsAlerts(supabase, tenantIds));
      case "insights_dashboard":
        return jsonResponse(
          200,
          await getInsightsDashboard(supabase, tenantIds, body),
        );
      case "insights_gap_analysis":
        return jsonResponse(
          200,
          await getInsightsGapAnalysis(supabase, tenantIds, body),
        );
      case "ops_ack_alert":
        return jsonResponse(
          200,
          await acknowledgeOpsAlert(supabase, asString(body.dedupe_key) ?? ""),
        );
      case "candidate_detail":
        return jsonResponse(
          200,
          await getCandidateDetail(supabase, asString(body.candidate_id) ?? ""),
        );
      case "parsing_overview":
        return jsonResponse(
          200,
          await getParsingOverview(supabase, tenantIds, body),
        );
      case "candidates_list":
        return jsonResponse(
          200,
          await getCandidatesList(supabase, tenantIds, body),
        );
      case "parsing_document":
        return jsonResponse(
          200,
          await getParsingDocument(
            supabase,
            asString(body.document_id) ?? "",
            tenantIds,
          ),
        );
      case "original_document_url":
        return jsonResponse(
          200,
          await getOriginalDocumentUrl(supabase, body, tenantIds),
        );
      case "parser_profiles":
        return jsonResponse(200, await getParserProfiles(supabase, tenantIds));
      case "save_parser_profile":
        return jsonResponse(200, await saveParserProfile(supabase, body));
      case "publish_parser_profile":
        return jsonResponse(
          200,
          await publishParserProfile(supabase, asString(body.profile_id) ?? ""),
        );
      case "shortlist_items":
        return jsonResponse(200, await getShortlistItems(supabase, tenantIds));
      case "save_shortlist_item":
        return jsonResponse(200, await saveShortlistItem(supabase, body));
      case "delete_shortlist_item":
        return jsonResponse(200, await deleteShortlistItem(supabase, body));
      case "clear_shortlist_items":
        return jsonResponse(
          200,
          await clearShortlistItems(supabase, tenantIds),
        );
      case "job_postings":
        return jsonResponse(
          200,
          await listJobPostings(supabase, tenantIds, body),
        );
      case "job_posting":
        return jsonResponse(
          200,
          await getJobPosting(supabase, asString(body.job_id) ?? ""),
        );
      case "save_job_posting":
        return jsonResponse(200, await saveJobPosting(supabase, body));
      case "extract_job_posting":
        return jsonResponse(200, await extractJobPosting(supabase, body));
      case "start_job_matching_run":
        return jsonResponse(200, await startJobMatchingRun(supabase, body));
      case "matching_runs":
        return jsonResponse(200, await listMatchingRuns(supabase, body));
      case "matching_run":
        return jsonResponse(
          200,
          await getMatchingRun(supabase, asString(body.run_id) ?? ""),
        );
      case "job_applications":
        return jsonResponse(200, await listJobApplications(supabase, body));
      case "update_job_application_status":
        return jsonResponse(
          200,
          await updateJobApplicationStatus(supabase, body),
        );
      case "job_shortlists":
        return jsonResponse(200, await listJobShortlists(supabase, body));
      case "job_shortlist":
        return jsonResponse(
          200,
          await getJobShortlist(supabase, asString(body.shortlist_id) ?? ""),
        );
      case "save_job_shortlist":
        return jsonResponse(200, await saveJobShortlist(supabase, body));
      case "list_admin_tenants": {
        await assertPlatformAdmin(supabase);
        const admin = createServiceClient();
        return jsonResponse(200, await listAdminTenants(admin));
      }
      case "create_tenant_account": {
        await assertPlatformAdmin(supabase);
        const admin = createServiceClient();
        return jsonResponse(200, await createTenantAccount(admin, body));
      }
      case "add_user_to_tenant": {
        await assertPlatformAdmin(supabase);
        const admin = createServiceClient();
        return jsonResponse(200, await addUserToTenant(admin, body));
      }
      case "get_platform_runtime_config": {
        await assertPlatformAdmin(supabase);
        return jsonResponse(200, await buildPlatformRuntimeConfigView());
      }
      case "save_platform_runtime_config": {
        const user = await assertPlatformAdmin(supabase);
        const settings = asRecord(body.settings) as Record<
          string,
          string | null | undefined
        >;
        try {
          return jsonResponse(
            200,
            await savePlatformRuntimeSettings(settings, user.id),
          );
        } catch (error) {
          const message = describeError(error);
          try {
            const parsed = JSON.parse(message) as {
              code?: string;
              fields?: Record<string, string>;
            };
            if (parsed.code === "validation_error") {
              return jsonResponse(400, {
                error: "validation_error",
                fields: parsed.fields ?? {},
              });
            }
          } catch {
            // fall through
          }
          throw error;
        }
      }
      default:
        return jsonResponse(400, { error: "unknown_action", details: action });
    }
  } catch (error) {
    const message = describeError(error);
    if (
      message === "Authentication is required." ||
      message === "Platform admin access is required."
    ) {
      return jsonResponse(403, { error: "forbidden", details: message });
    }
    return jsonResponse(500, { error: "unexpected_error", details: message });
  }
});
