import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { createAuthedClient } from "../_shared/client.ts";
import { normalizeLocationValue, normalizeSkillList } from "../_shared/searchTaxonomy.ts";

const SEARCH_PAGE_SIZE = 1000;
const DEFAULT_GCS_SIGNED_URL_SECONDS = 10 * 60;

type JsonRecord = Record<string, unknown>;
type GcsServiceAccountCredentials = {
  client_email?: string;
  private_key?: string;
};

type OriginalDocumentRow = {
  id: string;
  tenant_id: string;
  candidate_id: string | null;
  source_uri: string | null;
  storage_path: string | null;
  original_filename: string | null;
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
    ? Array.from(new Set(value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean)))
    : [];
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function asNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isBrowserOpenableSource(sourceUri: string | null) {
  return Boolean(sourceUri && /^(https?:)?\/\//i.test(sourceUri));
}

function parseIntegerEnv(name: string, fallback: number, min: number, max: number) {
  const parsed = Number(Deno.env.get(name));
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

function rfc3986Encode(value: string) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function encodePath(value: string) {
  return value.split("/").map(rfc3986Encode).join("/");
}

function bytesToHex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(value: string) {
  return bytesToHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
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
  return bytesToHex(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(value)));
}

function getGcsBucketName() {
  return asString(Deno.env.get("GCS_ORIGINALS_BUCKET")) ?? asString(Deno.env.get("CV_GCS_BUCKET")) ?? asString(Deno.env.get("CV_BUCKET_NAME"));
}

function getGcsCredentials() {
  const raw = asString(Deno.env.get("GCS_SIGNED_URL_SERVICE_ACCOUNT_JSON"));
  if (!raw) {
    return null;
  }
  const parsed = JSON.parse(raw) as GcsServiceAccountCredentials;
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error("GCS_SIGNED_URL_SERVICE_ACCOUNT_JSON must include client_email and private_key.");
  }
  return parsed;
}

function parseGcsUri(value: string) {
  if (!value.startsWith("gs://")) {
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

  const objectName = storagePath.startsWith(`${configuredBucket}/`) ? storagePath.slice(configuredBucket.length + 1) : storagePath;
  return { bucket: configuredBucket, objectName };
}

async function createGcsSignedUrl(bucket: string, objectName: string) {
  const credentials = getGcsCredentials();
  if (!credentials) {
    throw new Error("GCS signed URL credentials are not configured.");
  }

  const expiresSeconds = parseIntegerEnv("GCS_SIGNED_URL_EXPIRES_SECONDS", DEFAULT_GCS_SIGNED_URL_SECONDS, 60, 3600);
  const now = new Date();
  const timestamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
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
    url: `https://${host}${canonicalUri}?${canonicalQueryString}&X-Goog-Signature=${signature}`,
    expiresAt: new Date(now.getTime() + expiresSeconds * 1000).toISOString(),
  };
}

function dedupeSorted(values: string[]) {
  return Array.from(new Set(values.filter(Boolean))).sort((left, right) => left.localeCompare(right));
}

async function fetchAllSearchCacheRows(supabase: ReturnType<typeof createAuthedClient>, tenantIds: string[]) {
  const rows: Array<{
    seniority: string | null;
    skills: string[] | null;
    companies: string[] | null;
    location: string | null;
  }> = [];

  for (let offset = 0; ; offset += SEARCH_PAGE_SIZE) {
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

async function getSearchFilterOptions(supabase: ReturnType<typeof createAuthedClient>, tenantIds: string[]) {
  const rows = await fetchAllSearchCacheRows(supabase, tenantIds);
  return {
    seniority: dedupeSorted(rows.map((row) => row.seniority ?? "").filter((value) => value && value !== "unclassified")),
    skills: dedupeSorted(normalizeSkillList(rows.flatMap((row) => row.skills ?? []))),
    companies: dedupeSorted(rows.flatMap((row) => row.companies ?? [])),
    locations: dedupeSorted(rows.map((row) => normalizeLocationValue(row.location)).filter((value): value is string => Boolean(value))),
  };
}

async function getWorkspaceStats(supabase: ReturnType<typeof createAuthedClient>, tenantIds: string[]) {
  const { data, error } = await supabase.rpc("workspace_stats_v1", {
    p_tenant_ids: tenantIds.length ? tenantIds : null,
  });
  if (error) {
    throw error;
  }
  return Array.isArray(data) ? data[0] ?? { document_count: 0, candidate_count: 0, company_count: 0 } : data;
}

function withTenantFilter(query: any, tenantIds: string[], column = "tenant_id") {
  return tenantIds.length ? query.in(column, tenantIds) : query;
}

async function countRows(
  supabase: ReturnType<typeof createAuthedClient>,
  table: string,
  tenantIds: string[],
  apply?: (query: any) => any,
) {
  let query: any = supabase.from(table).select("*", { count: "exact", head: true });
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

function mapManatalStatusRow(row: any) {
  return {
    manatalCandidateId: String(row.manatal_candidate_id ?? ""),
    candidateName: String(row.manatal_full_name ?? "Unknown candidate"),
    email: asString(row.manatal_email),
    syncStatus: String(row.sync_status ?? "unknown"),
    lastSyncedAt: asString(row.last_synced_at),
    updatedAt: asString(row.updated_at),
    sourceDocumentId: asString(row.source_document_id),
    errorMessage: asString(row.error_message),
  };
}

async function getManatalSyncStatus(supabase: ReturnType<typeof createAuthedClient>, tenantIds: string[]) {
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
    countRows(supabase, "source_documents", tenantIds, (query) => query.like("source_uri", "gs://%")),
    countRows(supabase, "source_documents", tenantIds, (query) => query.ilike("source_uri", "%drive.google.com%")),
    countRows(supabase, "manatal_candidate_sync", tenantIds),
    countRows(supabase, "manatal_candidate_sync", tenantIds, (query) => query.not("source_document_id", "is", null)),
    countRows(supabase, "manatal_candidate_sync", tenantIds, (query) => query.eq("sync_status", "synced")),
    countRows(supabase, "manatal_candidate_sync", tenantIds, (query) => query.eq("sync_status", "pending")),
    countRows(supabase, "manatal_candidate_sync", tenantIds, (query) => query.eq("sync_status", "failed")),
    countRows(supabase, "manatal_candidate_sync", tenantIds, (query) => query.eq("sync_status", "skipped")),
    (() => {
      let query: any = supabase
        .from("manatal_candidate_sync")
        .select("manatal_candidate_id, manatal_full_name, manatal_email, sync_status, last_synced_at, updated_at, source_document_id, error_message")
        .order("updated_at", { ascending: false })
        .limit(12);
      query = withTenantFilter(query, tenantIds);
      return query;
    })(),
    (() => {
      let query: any = supabase
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
      let query: any = supabase
        .from("manatal_candidate_sync")
        .select("manatal_candidate_id, manatal_full_name, error_message, updated_at")
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
          candidateName: String(lastFailureRow.manatal_full_name ?? "Unknown candidate"),
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
  if (alerts.some((alert) => alert.severity === "P0" || alert.severity === "P1")) {
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
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((percentileValue / 100) * sorted.length) - 1));
  return Math.round(sorted[index]);
}

function formatHeartbeatAge(value: unknown) {
  const timestamp = asString(value);
  if (!timestamp) {
    return "no heartbeat";
  }
  const ageSeconds = Math.max(0, Math.round((Date.now() - new Date(timestamp).getTime()) / 1000));
  if (ageSeconds < 60) {
    return `${ageSeconds}s ago`;
  }
  const ageMinutes = Math.round(ageSeconds / 60);
  return `${ageMinutes}m ago`;
}

async function getSystemHealth(supabase: ReturnType<typeof createAuthedClient>, tenantIds: string[]) {
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

  const alerts = ((snapshotResult.data ?? []) as OpsHealthRow[]).sort((left, right) => severityRank(left.severity) - severityRank(right.severity));
  const recentEvents = (eventsResult.data ?? []) as Array<{ event_name: string; payload: unknown; created_at: string }>;
  const durations = recentEvents
    .map((event) => asNumber(asRecord(event.payload).duration_ms))
    .filter((value): value is number => value !== null && value >= 0);
  const latencyMs = percentile(durations, 95);
  const eventsWithFailures = recentEvents.filter((event) => {
    const statusCode = asNumber(asRecord(event.payload).status_code);
    return statusCode !== null && statusCode >= 500;
  }).length;
  const capacityAlerts = alerts.filter((alert) => alert.component === "capacity");
  const capacityUsage = Math.max(0, ...capacityAlerts.map((alert) => Number(alert.current_value ?? 0)));
  const workerRows = (workersResult.data ?? []) as Array<{
    tenant_id: string;
    device_name: string;
    status: string;
    last_seen_at: string | null;
    metadata_json: unknown;
  }>;

  const searchAlerts = alerts.filter((alert) => alert.component === "search" || alert.alert_key.includes("search"));
  const edgeAlerts = alerts.filter((alert) => alert.component === "edge_function");
  const workerAlerts = alerts.filter((alert) => alert.component === "worker");
  const ingestionAlerts = alerts.filter((alert) => alert.component === "ingestion");
  const dataQualityAlerts = alerts.filter((alert) => alert.component === "data_quality");

  const services = [
    {
      name: "Edge Functions",
      status: statusForAlerts(edgeAlerts),
      latency: latencyMs ? `${latencyMs} ms p95` : "no samples",
      detail: edgeAlerts[0]?.message ?? `${recentEvents.length} recent requests, ${eventsWithFailures} server errors.`,
    },
    {
      name: "Search",
      status: statusForAlerts(searchAlerts),
      latency: latencyMs ? `${latencyMs} ms p95` : "no samples",
      detail: searchAlerts[0]?.message ?? "Search alerts are clear from the Supabase health snapshot.",
    },
    {
      name: "Offline worker fleet",
      status: statusForAlerts(workerAlerts),
      latency: workerRows.length ? `${workerRows.length} registered` : "idle",
      detail: workerAlerts[0]?.message ?? (workerRows.length ? "Active worker devices are sending heartbeats." : "No worker devices registered; worker monitoring is idle."),
    },
    {
      name: "Ingestion",
      status: statusForAlerts(ingestionAlerts),
      latency: ingestionAlerts[0]?.current_value !== null && ingestionAlerts[0]?.current_value !== undefined ? `${ingestionAlerts[0].current_value}` : "clear",
      detail: ingestionAlerts[0]?.message ?? "No stuck or failing ingestion runs in the current alert window.",
    },
    {
      name: "Data quality",
      status: statusForAlerts(dataQualityAlerts),
      latency: dataQualityAlerts[0]?.current_value !== null && dataQualityAlerts[0]?.current_value !== undefined ? `${dataQualityAlerts[0].current_value}%` : "clear",
      detail: dataQualityAlerts[0]?.message ?? "Recent parsing quality is within configured thresholds.",
    },
    {
      name: "Supabase capacity",
      status: statusForAlerts(capacityAlerts),
      latency: capacityUsage ? `${Math.round(capacityUsage)}%` : "within limits",
      detail: capacityAlerts[0]?.message ?? "Database and storage capacity alerts are clear.",
    },
  ];

  const workerFleet = workerRows.map((worker) => {
    const metadata = asRecord(worker.metadata_json);
    const metrics = asRecord(metadata.last_metrics);
    const queueDepth = asNumber(metrics.queue_depth) ?? asNumber(metrics.pending) ?? asNumber(metrics.failures) ?? 0;
    const throughput = asNumber(metrics.documents_per_minute) ?? asNumber(metrics.processed_per_minute);
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
    timestamp: new Date(alert.last_seen_at).toLocaleTimeString("en-US", { hour12: false }),
  }));

  return {
    overallStatus: overallStatus(alerts),
    latencyMs,
    uptime: alerts.some((alert) => alert.severity === "P0") ? "incident" : "live",
    memory: Math.round(capacityUsage),
    services,
    workerFleet,
    logs: alertLogs.length
      ? alertLogs
      : [
          {
            level: "ok",
            message: "Supabase monitoring snapshot is clear.",
            timestamp: new Date().toLocaleTimeString("en-US", { hour12: false }),
          },
        ],
  };
}

async function getOpsAlerts(supabase: ReturnType<typeof createAuthedClient>, tenantIds: string[]) {
  const { data, error } = await supabase.rpc("ops_evaluate_alerts_v1", {
    p_tenant_ids: tenantIds.length ? tenantIds : null,
  });
  if (error) {
    throw error;
  }
  return data ?? [];
}

async function acknowledgeOpsAlert(supabase: ReturnType<typeof createAuthedClient>, dedupeKey: string) {
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

  const platformAdminQueryFailed =
    platformAdminResult.error &&
    !/platform_admins/i.test(platformAdminResult.error.message) &&
    platformAdminResult.error.code !== "PGRST205";
  if (platformAdminQueryFailed) {
    throw platformAdminResult.error;
  }

  const membershipRows = membershipResult.data ?? [];
  const isPlatformAdmin = Boolean(platformAdminResult.data?.user_id);
  if (!membershipRows.length && !isPlatformAdmin) {
    return { memberships: [], is_platform_admin: false };
  }

  const tenantIds = membershipRows.map((membership) => membership.tenant_id).filter(Boolean);
  const tenantResult = isPlatformAdmin
    ? await supabase.from("tenants").select("id, slug, name, icon_url").order("name")
    : await supabase.from("tenants").select("id, slug, name, icon_url").in("id", tenantIds);

  if (tenantResult.error) {
    throw tenantResult.error;
  }

  const tenantRows = tenantResult.data ?? [];
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

async function bootstrapTenant(supabase: ReturnType<typeof createAuthedClient>, body: JsonRecord) {
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

async function getCandidateDetail(supabase: ReturnType<typeof createAuthedClient>, candidateId: string) {
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
      manatalCandidateId = asString((syncResult.data ?? [])[0]?.manatal_candidate_id);
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

async function getParsingOverview(supabase: ReturnType<typeof createAuthedClient>, tenantIds: string[], body: JsonRecord) {
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

async function getParsingDocument(supabase: ReturnType<typeof createAuthedClient>, documentId: string, tenantIds: string[]) {
  let documentQuery = supabase
    .from("source_documents")
    .select("id, tenant_id, candidate_id, source_type, original_filename, mime_type, source_uri, storage_path, created_at, updated_at")
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
  const [candidateResult, profileByDocumentResult, runsResult] = await Promise.all([
    document.candidate_id
      ? supabase
          .from("candidates")
          .select("id, tenant_id, name, headline, current_title, location, years_experience, seniority, primary_role, top_skills, email, phone, links, summary_short, status")
          .eq("id", document.candidate_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from("candidate_profiles")
      .select("tenant_id, candidate_id, source_document_id, profile_json, timeline_json, skill_matrix_json, raw_text, confidence, missing_fields, parse_warnings, created_at, updated_at")
      .eq("source_document_id", documentId)
      .maybeSingle(),
    supabase
      .from("processing_runs")
      .select("tenant_id, source_document_id, status, parser_version, model_version, prompt_version, chunk_version, embedding_version, warnings, error_code, error_message, created_at, updated_at, metadata_json")
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
      .select("tenant_id, candidate_id, source_document_id, profile_json, timeline_json, skill_matrix_json, raw_text, confidence, missing_fields, parse_warnings, created_at, updated_at")
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

async function getOriginalDocumentUrl(supabase: ReturnType<typeof createAuthedClient>, body: JsonRecord, tenantIds: string[]) {
  await getCurrentUserId(supabase);

  const documentId = asString(body.document_id);
  const candidateId = asString(body.candidate_id);
  const tenantId = asString(body.tenant_id);

  if (!documentId && !candidateId) {
    throw new Error("document_id or candidate_id is required.");
  }

  let query = supabase
    .from("source_documents")
    .select("id, tenant_id, candidate_id, source_uri, storage_path, original_filename");

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
    throw new Error("Original CV was not found or is not available to this user.");
  }

  const document = data as OriginalDocumentRow;
  const gcsLocation = resolveGcsLocation(document);
  if (gcsLocation) {
    try {
      const signedUrl = await createGcsSignedUrl(gcsLocation.bucket, gcsLocation.objectName);
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

async function getParserProfiles(supabase: ReturnType<typeof createAuthedClient>, tenantIds: string[]) {
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

async function saveParserProfile(supabase: ReturnType<typeof createAuthedClient>, body: JsonRecord) {
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
    embedding_version: asString(profile.embeddingVersion) ?? "gemini-embedding-001-768-v1",
    chunking_profile: asString(profile.chunkingProfile) ?? "default",
    ocr_enabled: Boolean(profile.ocrEnabled),
    allow_heuristic_fallback: false,
    prompt_template: asString(profile.promptTemplate) ?? "",
    notes: asString(profile.notes) ?? "",
  };

  const profileId = asString(profile.id);
  const mutation = profileId
    ? supabase.from("parser_profiles").update(payload).eq("id", profileId).select(parserProfileSelect).single()
    : supabase.from("parser_profiles").insert(payload).select(parserProfileSelect).single();

  const { data, error } = await mutation;
  if (error) {
    throw error;
  }
  return data;
}

async function publishParserProfile(supabase: ReturnType<typeof createAuthedClient>, profileId: string) {
  const { data, error } = await supabase.rpc("publish_parser_profile_v1", { p_profile_id: profileId });
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

async function getCurrentUserId(supabase: ReturnType<typeof createAuthedClient>) {
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

async function getCandidateCvSource(supabase: ReturnType<typeof createAuthedClient>, tenantId: string, candidateId: string) {
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

async function getShortlistItems(supabase: ReturnType<typeof createAuthedClient>, tenantIds: string[]) {
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

async function saveShortlistItem(supabase: ReturnType<typeof createAuthedClient>, body: JsonRecord) {
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
    match_rate: matchRate === null ? null : Math.max(0, Math.min(100, Math.round(matchRate))),
    cv_url: asString(cvSource?.source_uri) ?? asString(item.cv_url),
    original_filename: asString(cvSource?.original_filename) ?? asString(item.original_filename),
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

async function deleteShortlistItem(supabase: ReturnType<typeof createAuthedClient>, body: JsonRecord) {
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

async function clearShortlistItems(supabase: ReturnType<typeof createAuthedClient>, tenantIds: string[]) {
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
    const tenantIds = asStringArray(body.tenant_ids);
    const supabase = createAuthedClient(req);

    switch (action) {
      case "auth_context":
        return jsonResponse(200, await getAuthContext(supabase));
      case "bootstrap_tenant":
        return jsonResponse(200, await bootstrapTenant(supabase, body));
      case "search_filter_options":
        return jsonResponse(200, await getSearchFilterOptions(supabase, tenantIds));
      case "workspace_stats":
        return jsonResponse(200, await getWorkspaceStats(supabase, tenantIds));
      case "manatal_sync_status":
        return jsonResponse(200, await getManatalSyncStatus(supabase, tenantIds));
      case "system_health":
        return jsonResponse(200, await getSystemHealth(supabase, tenantIds));
      case "ops_alerts":
        return jsonResponse(200, await getOpsAlerts(supabase, tenantIds));
      case "ops_ack_alert":
        return jsonResponse(200, await acknowledgeOpsAlert(supabase, asString(body.dedupe_key) ?? ""));
      case "candidate_detail":
        return jsonResponse(200, await getCandidateDetail(supabase, asString(body.candidate_id) ?? ""));
      case "parsing_overview":
        return jsonResponse(200, await getParsingOverview(supabase, tenantIds, body));
      case "parsing_document":
        return jsonResponse(200, await getParsingDocument(supabase, asString(body.document_id) ?? "", tenantIds));
      case "original_document_url":
        return jsonResponse(200, await getOriginalDocumentUrl(supabase, body, tenantIds));
      case "parser_profiles":
        return jsonResponse(200, await getParserProfiles(supabase, tenantIds));
      case "save_parser_profile":
        return jsonResponse(200, await saveParserProfile(supabase, body));
      case "publish_parser_profile":
        return jsonResponse(200, await publishParserProfile(supabase, asString(body.profile_id) ?? ""));
      case "shortlist_items":
        return jsonResponse(200, await getShortlistItems(supabase, tenantIds));
      case "save_shortlist_item":
        return jsonResponse(200, await saveShortlistItem(supabase, body));
      case "delete_shortlist_item":
        return jsonResponse(200, await deleteShortlistItem(supabase, body));
      case "clear_shortlist_items":
        return jsonResponse(200, await clearShortlistItems(supabase, tenantIds));
      default:
        return jsonResponse(400, { error: "unknown_action", details: action });
    }
  } catch (error) {
    return jsonResponse(500, { error: "unexpected_error", details: describeError(error) });
  }
});
