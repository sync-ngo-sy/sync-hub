import type { SupabaseClient } from "@supabase/supabase-js";
import {
  asArray,
  asNumber,
  asRecord,
  asString,
  asStringArray,
  clampInteger,
  isMissingRpcError,
  type JsonRecord,
} from "./utils.ts";
import {
  buildFallbackGapAnalysis,
  buildFallbackInsightsDashboard,
  type InsightsCandidateSearchCacheRow,
} from "./insights.ts";
import { getCurrentUserId } from "./auth.ts";
import { generateStructuredObject } from "./llm.ts";
import {
  buildCompanyExclusionTerms,
  excludeCompanyMatches,
} from "./searchIntent.ts";
import {
  normalizeLocationValue,
  normalizeSkillList,
} from "./searchTaxonomy.ts";

const SEARCH_PAGE_SIZE = 1000;
const INSIGHTS_FALLBACK_MAX_ROWS = 20000;

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

function withTenantFilter<T>(
  query: T,
  tenantIds: string[],
  column = "tenant_id",
) {
  return tenantIds.length
    ? (query as TenantFilterableQuery<T>).in(column, tenantIds)
    : query;
}

export async function writeAuditEvent(
  supabase: SupabaseClient,
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

async function fetchAllSearchCacheRows(supabase: SupabaseClient) {
  const rows: Array<{
    seniority: string | null;
    skills: string[] | null;
    companies: string[] | null;
    location: string | null;
  }> = [];

  for (let offset = 0;; offset += SEARCH_PAGE_SIZE) {
    const request = supabase
      .from("candidate_search_cache")
      .select("seniority, skills, companies, location")
      .range(offset, offset + SEARCH_PAGE_SIZE - 1);

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

export async function getSearchFilterOptions(
  supabase: SupabaseClient,
  tenantIds: string[],
) {
  const [rows, tenantResult] = await Promise.all([
    fetchAllSearchCacheRows(supabase),
    tenantIds.length
      ? supabase.from("tenants").select("slug, name").in("id", tenantIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (tenantResult.error) {
    throw tenantResult.error;
  }
  const excludedCompanyTerms = buildCompanyExclusionTerms(
    (tenantResult.data ?? []).flatMap((tenant) => [
      String(tenant.slug ?? ""),
      String(tenant.name ?? ""),
    ]),
  );

  const dedupeSorted = (values: string[]) =>
    Array.from(new Set(values.filter(Boolean))).sort((a, b) =>
      a.localeCompare(b)
    );

  return {
    seniority: dedupeSorted(
      rows
        .map((row) => row.seniority ?? "")
        .filter((value) => value && value !== "unclassified"),
    ),
    skills: dedupeSorted(
      normalizeSkillList(rows.flatMap((row) => row.skills ?? [])),
    ),
    companies: dedupeSorted(
      excludeCompanyMatches(
        rows.flatMap((row) => row.companies ?? []),
        excludedCompanyTerms,
      ),
    ),
    locations: dedupeSorted(
      rows
        .map((row) => normalizeLocationValue(row.location))
        .filter((value): value is string => Boolean(value)),
    ),
  };
}

export async function getWorkspaceStats(
  supabase: SupabaseClient,
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

async function countRows(
  supabase: SupabaseClient,
  table: string,
  tenantIds: string[],
  apply?: (query: SupabaseQueryLike) => SupabaseQueryLike,
) {
  let query = supabase.from(table).select("*", {
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

export async function getManatalSyncStatus(
  supabase: SupabaseClient,
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

  if (recentResult.error) throw recentResult.error;
  if (lastSyncedResult.error) throw lastSyncedResult.error;
  if (lastFailureResult.error) throw lastFailureResult.error;

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
  ) return "degraded";
  if (alerts.some((alert) => alert.severity === "P2")) return "warning";
  return "healthy";
}

function overallStatus(alerts: OpsHealthRow[]) {
  if (alerts.some((alert) => alert.severity === "P0")) return "Critical";
  if (alerts.some((alert) => alert.severity === "P1")) return "Degraded";
  if (alerts.some((alert) => alert.severity === "P2")) return "Warning";
  return "Healthy";
}

function percentile(values: number[], percentileValue: number) {
  if (!values.length) return 0;
  const sorted = values.slice().sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((percentileValue / 100) * sorted.length) - 1),
  );
  return Math.round(sorted[index]);
}

function formatHeartbeatAge(value: unknown) {
  const timestamp = asString(value);
  if (!timestamp) return "no heartbeat";
  const ageSeconds = Math.max(
    0,
    Math.round((Date.now() - new Date(timestamp).getTime()) / 1000),
  );
  if (ageSeconds < 60) return `${ageSeconds}s ago`;
  const ageMinutes = Math.round(ageSeconds / 60);
  return `${ageMinutes}m ago`;
}

export async function getSystemHealth(
  supabase: SupabaseClient,
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
      if (tenantIds.length) query = query.in("tenant_id", tenantIds);
      return query.order("created_at", { ascending: false }).limit(100);
    })(),
    (() => {
      let query = supabase
        .from("worker_devices")
        .select("tenant_id, device_name, status, last_seen_at, metadata_json")
        .eq("status", "active");
      if (tenantIds.length) query = query.in("tenant_id", tenantIds);
      return query.order("last_seen_at", { ascending: false }).limit(12);
    })(),
  ]);

  if (snapshotResult.error) throw snapshotResult.error;
  if (eventsResult.error) throw eventsResult.error;
  if (workersResult.error) throw workersResult.error;

  const alerts = ((snapshotResult.data ?? []) as OpsHealthRow[]).sort(
    (left, right) => severityRank(left.severity) - severityRank(right.severity),
  );
  const recentEvents = (eventsResult.data ?? []) as Array<
    { event_name: string; payload: unknown; created_at: string }
  >;
  const durations = recentEvents
    .map((event) => asNumber(asRecord(event.payload).duration_ms))
    .filter((value): value is number => value !== null && value >= 0);
  const latencyMs = percentile(durations, 95);
  const eventsWithFailures = recentEvents.filter((event) => {
    const statusCode = asNumber(asRecord(event.payload).status_code);
    return statusCode !== null && statusCode >= 500;
  }).length;
  const capacityAlerts = alerts.filter((alert) =>
    alert.component === "capacity"
  );
  const capacityUsage = Math.max(
    0,
    ...capacityAlerts.map((alert) => Number(alert.current_value ?? 0)),
  );
  const workerRows = (workersResult.data ?? []) as Array<
    {
      tenant_id: string;
      device_name: string;
      status: string;
      last_seen_at: string | null;
      metadata_json: unknown;
    }
  >;

  const searchAlerts = alerts.filter((alert) =>
    alert.component === "search" || alert.alert_key.includes("search")
  );
  const edgeAlerts = alerts.filter((alert) =>
    alert.component === "edge_function"
  );
  const workerAlerts = alerts.filter((alert) => alert.component === "worker");
  const ingestionAlerts = alerts.filter((alert) =>
    alert.component === "ingestion"
  );
  const dataQualityAlerts = alerts.filter((alert) =>
    alert.component === "data_quality"
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
      asNumber(metrics.pending) ?? asNumber(metrics.failures) ?? 0;
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
    logs: alertLogs.length ? alertLogs : [{
      level: "ok",
      message: "Supabase monitoring snapshot is clear.",
      timestamp: new Date().toLocaleTimeString("en-US", { hour12: false }),
    }],
  };
}

export async function getOpsAlerts(
  supabase: SupabaseClient,
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

async function fetchInsightsFallbackRows(
  supabase: SupabaseClient,
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

export async function getInsightsDashboard(
  supabase: SupabaseClient,
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
    .then(() => null, () => null);

  return data;
}

export async function getInsightsGapAnalysis(
  supabase: SupabaseClient,
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
    .then(() => null, () => null);

  return data;
}

const insightReportRunSelect = [
  "id",
  "tenant_id",
  "initiated_by_user_id",
  "status",
  "report_type",
  "input_config",
  "report_payload",
  "failure_reason",
  "llm_provider",
  "llm_model",
  "started_at",
  "completed_at",
  "created_at",
].join(", ");

export type InsightReportType =
  | "corpus_overview"
  | "gap_brief"
  | "job_family_analysis";

export type InsightReportPayload = {
  title: string;
  executiveSummary: string;
  sections: Array<{
    title: string;
    body: string;
    citations: Array<{ metricKey: string; label: string; value: string }>;
  }>;
  recommendations: string[];
  risks: string[];
  assistantPrompts: string[];
};

export const insightReportSchema = {
  type: "object",
  properties: {
    title: { type: "string" },
    executiveSummary: {
      type: "string",
      description:
        "Two to four sentence executive summary grounded in provided metrics.",
    },
    sections: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          body: { type: "string" },
          citations: {
            type: "array",
            items: {
              type: "object",
              properties: {
                metricKey: { type: "string" },
                label: { type: "string" },
                value: { type: "string" },
              },
              required: ["metricKey", "label", "value"],
            },
          },
        },
        required: ["title", "body", "citations"],
      },
    },
    recommendations: { type: "array", items: { type: "string" } },
    risks: { type: "array", items: { type: "string" } },
    assistantPrompts: {
      type: "array",
      description:
        "Suggested follow-up questions or actions for the recruiter.",
      items: { type: "string" },
    },
  },
  required: [
    "title",
    "executiveSummary",
    "sections",
    "recommendations",
    "risks",
    "assistantPrompts",
  ],
};

function normalizeInsightReportType(value: unknown): InsightReportType | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "corpus_overview" || normalized === "gap_brief" ||
      normalized === "job_family_analysis"
    ? normalized
    : null;
}

function metricValue(metrics: JsonRecord[], key: string, fallback = "0") {
  const metric = metrics.find((item) => asString(item.key) === key);
  if (!metric) return fallback;
  const value = asNumber(metric.value);
  return Number.isFinite(value) ? String(Math.round(value)) : fallback;
}

function distributionTop(items: JsonRecord[], limit = 3) {
  return items
    .slice(0, limit)
    .map((item) => {
      const label = asString(item.label) ?? "Unknown";
      const value = asNumber(item.value) ?? 0;
      const percent = asNumber(item.percent);
      return percent != null
        ? `${label} (${Math.round(value)} / ${Math.round(percent)}%)`
        : `${label} (${Math.round(value)})`;
    })
    .join(", ");
}

export function buildHeuristicInsightReport(
  snapshot: JsonRecord,
  reportType: InsightReportType,
  focus: string | null,
): InsightReportPayload {
  const metrics = asArray(snapshot.metrics).map((item) => asRecord(item));
  const totalCvs = metricValue(metrics, "total_cvs_indexed", "0");
  const avgSkills = metricValue(metrics, "avg_skills_per_profile", "0");
  const jobFamilies = asArray(snapshot.job_families ?? snapshot.jobFamilies)
    .map((item) => asRecord(item));
  const seniority = asArray(
    snapshot.profiles_by_seniority ?? snapshot.profilesBySeniority,
  ).map((item) => asRecord(item));
  const locations = asArray(
    snapshot.profiles_by_location ?? snapshot.profilesByLocation,
  ).map((item) => asRecord(item));
  const gapAnalysis = asRecord(snapshot.gap_analysis ?? snapshot.gapAnalysis);
  const topFamilies = distributionTop(jobFamilies, 4);
  const topLocations = distributionTop(locations, 3);
  const topSeniority = distributionTop(seniority, 4);
  const targetRole = asString(
    gapAnalysis.target_role ?? gapAnalysis.targetRole,
  );
  const targetSkills = asStringArray(
    gapAnalysis.target_skills ?? gapAnalysis.targetSkills,
  );
  const fullyMatching = asNumber(
    gapAnalysis.fully_matching_candidates ??
      gapAnalysis.fullyMatchingCandidates,
  ) ?? 0;
  const partiallyMatching = asNumber(
    gapAnalysis.partially_matching_candidates ??
      gapAnalysis.partiallyMatchingCandidates,
  ) ?? 0;
  const missingSkills = asArray(
    gapAnalysis.missing_skills ?? gapAnalysis.missingSkills,
  ).map((item) => asRecord(item)).slice(0, 3).map((item) =>
    asString(item.skill)
  ).filter(Boolean);

  const focusLabel = focus?.trim() || targetRole || "the indexed corpus";
  const title = reportType === "gap_brief"
    ? `Gap brief: ${focusLabel}`
    : reportType === "job_family_analysis"
    ? `Job family analysis: ${focusLabel}`
    : "Corpus intelligence brief";

  const executiveSummary = reportType === "gap_brief"
    ? `The tenant corpus indexes ${totalCvs} profiles with an average of ${avgSkills} skills each. For ${focusLabel}, ${fullyMatching} profiles fully match and ${partiallyMatching} are partial matches, indicating ${
      partiallyMatching > fullyMatching
        ? "an upskilling opportunity"
        : "moderate exact-match depth"
    }.`
    : reportType === "job_family_analysis"
    ? `${focusLabel} sits within a corpus of ${totalCvs} indexed profiles. Leading families are ${
      topFamilies || "not yet classified"
    }, with seniority mix led by ${topSeniority || "unknown bands"}.`
    : `This workspace indexes ${totalCvs} CVs with ${avgSkills} average skills per profile. Job-family coverage is led by ${
      topFamilies || "unclassified roles"
    }, while geo concentration is strongest in ${
      topLocations || "unknown locations"
    }.`;

  const sections: InsightReportPayload["sections"] = [
    {
      title: "Corpus snapshot",
      body:
        `Total indexed profiles: ${totalCvs}. Average skills per profile: ${avgSkills}. Top locations: ${
          topLocations || "n/a"
        }.`,
      citations: [
        {
          metricKey: "total_cvs_indexed",
          label: "Total CVs indexed",
          value: totalCvs,
        },
        {
          metricKey: "avg_skills_per_profile",
          label: "Average skills per profile",
          value: avgSkills,
        },
      ],
    },
    {
      title: "Seniority and family mix",
      body: `Seniority distribution is led by ${
        topSeniority || "unknown bands"
      }. Production taxonomy is concentrated in ${
        topFamilies || "unclassified families"
      }.`,
      citations: jobFamilies.slice(0, 2).map((item, index) => ({
        metricKey: `job_family_${index + 1}`,
        label: asString(item.label) ?? "Job family",
        value: String(asNumber(item.value) ?? 0),
      })),
    },
  ];

  if (reportType !== "corpus_overview") {
    sections.push({
      title: "Requirement coverage",
      body: targetSkills.length
        ? `Resolved requirements: ${
          targetSkills.join(", ")
        }. Fully matching profiles: ${fullyMatching}. Partial matches: ${partiallyMatching}. Top missing skills among partial profiles: ${
          missingSkills.join(", ") || "none surfaced"
        }.`
        : `No resolved skill requirements were available for ${focusLabel}. Review the Gap Engine tab to map role text to catalog skills.`,
      citations: [
        {
          metricKey: "fully_matching_candidates",
          label: "Fully matching candidates",
          value: String(fullyMatching),
        },
        {
          metricKey: "partially_matching_candidates",
          label: "Partially matching candidates",
          value: String(partiallyMatching),
        },
      ],
    });
  }

  const recommendations = reportType === "gap_brief"
    ? [
      partiallyMatching > fullyMatching && missingSkills[0]
        ? `Prioritize upskilling around ${
          missingSkills[0]
        } before expanding search criteria.`
        : "Run a targeted search for fully matching profiles before widening requirements.",
      "Export the gap verdict and share it with hiring stakeholders.",
      "Re-run this brief after the next ingestion batch to track supply movement.",
    ]
    : reportType === "job_family_analysis"
    ? [
      `Drill into ${focusLabel} from Overview to inspect seniority depth.`,
      "Compare top two families if delivery planning spans multiple stacks.",
      "Queue a gap brief if a live role depends on this family.",
    ]
    : [
      "Review unclassified seniority bands if workforce planning needs tighter segmentation.",
      "Use Top Skills to validate program narratives against real corpus frequency.",
      "Generate a gap brief when a live hiring requirement needs supply evidence.",
    ];

  const risks = [
    Number(totalCvs) <= 0
      ? "Corpus volume is too low for reliable supply conclusions."
      : null,
    missingSkills.length && reportType === "gap_brief"
      ? `${
        missingSkills[0]
      } appears as a recurring blocker in partial profiles.`
      : null,
    "Insights remain read-only; validate critical hiring decisions with dossier review.",
  ].filter((item): item is string => Boolean(item));

  const assistantPrompts = reportType === "gap_brief"
    ? [
      `Which partial profiles are closest to ${focusLabel}?`,
      `What training cohort could close ${
        missingSkills[0] ?? "the top skill gap"
      } fastest?`,
      "Show me fully matching candidates in Search.",
    ]
    : reportType === "job_family_analysis"
    ? [
      `How deep is ${focusLabel} supply at senior level?`,
      `Which locations dominate ${focusLabel} profiles?`,
      `Generate a gap brief for a role in ${focusLabel}.`,
    ]
    : [
      "Which job families show the thinnest senior bench?",
      "Where is geo coverage weakest outside Damascus?",
      "What skills should we prioritize for the next training cohort?",
    ];

  return {
    title,
    executiveSummary,
    sections,
    recommendations,
    risks,
    assistantPrompts,
  };
}

async function generateInsightReportPayload(
  snapshot: JsonRecord,
  reportType: InsightReportType,
  focus: string | null,
) {
  const fallback = buildHeuristicInsightReport(snapshot, reportType, focus);
  try {
    const result = await generateStructuredObject<InsightReportPayload>({
      schemaName: "insight_report",
      schema: insightReportSchema,
      temperature: 0.2,
      systemPrompt:
        "You are a recruitment intelligence analyst. Write grounded corpus insight reports using only the supplied metrics. Do not invent counts, locations, or skills. Every section must cite provided metric keys. Keep language concise and actionable for recruiters and program operators.",
      userPrompt: JSON.stringify({ reportType, focus, snapshot }),
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

export async function startInsightReportRun(
  supabase: SupabaseClient,
  tenantIds: string[],
  body: JsonRecord,
) {
  if (tenantIds.length !== 1) {
    throw new Error(
      "Exactly one tenant_id is required for insight report generation.",
    );
  }
  const tenantId = tenantIds[0];
  const userId = await getCurrentUserId(supabase);
  const reportType = normalizeInsightReportType(
    body.report_type ?? body.reportType,
  );
  if (!reportType) {
    throw new Error(
      "report_type must be corpus_overview, gap_brief, or job_family_analysis.",
    );
  }
  const focus = asString(body.focus ?? body.target_role ?? body.targetRole);
  const targetSkills = asStringArray(body.target_skills ?? body.targetSkills);
  const inputConfig = {
    reportType,
    focus,
    targetRole: focus,
    targetSkills,
    topSkills: Math.max(
      1,
      Math.min(
        200,
        Math.trunc(asNumber(body.top_skills ?? body.topSkills) ?? 50),
      ),
    ),
  };

  const runInsert = await supabase
    .from("insight_report_runs")
    .insert({
      tenant_id: tenantId,
      initiated_by_user_id: userId,
      status: "running",
      report_type: reportType,
      input_config: inputConfig,
      started_at: new Date().toISOString(),
    })
    .select(insightReportRunSelect)
    .single();
  if (runInsert.error) {
    throw runInsert.error;
  }
  const insertedRun = asRecord(runInsert.data);
  const runId = asString(insertedRun.id) ?? "";

  await writeAuditEvent(supabase, {
    tenantId,
    actorUserId: userId,
    action: "INSIGHT_REPORT_STARTED",
    entityType: "insight_report_run",
    entityId: runId,
    payload: inputConfig,
  });

  try {
    const snapshot = asRecord(
      await getInsightsDashboard(supabase, tenantIds, {
        top_skills: inputConfig.topSkills,
        target_role: reportType === "gap_brief" ? focus : null,
        target_skills: reportType === "gap_brief" ? targetSkills : [],
        trace_id: `insight-report-${runId}`,
      }),
    );
    if (reportType === "job_family_analysis" && focus) {
      snapshot.focus_job_family = focus;
    }
    const generation = await generateInsightReportPayload(
      snapshot,
      reportType,
      focus,
    );
    const completedAt = new Date().toISOString();
    const updateResult = await supabase
      .from("insight_report_runs")
      .update({
        status: "completed",
        report_payload: generation.payload,
        llm_provider: generation.provider,
        llm_model: generation.model,
        completed_at: completedAt,
      })
      .eq("id", runId)
      .select(insightReportRunSelect)
      .single();
    if (updateResult.error) {
      throw updateResult.error;
    }

    await writeAuditEvent(supabase, {
      tenantId,
      actorUserId: userId,
      action: "INSIGHT_REPORT_COMPLETED",
      entityType: "insight_report_run",
      entityId: runId,
      payload: {
        reportType,
        provider: generation.provider,
        model: generation.model,
      },
    });

    return { run: updateResult.data, report: generation.payload };
  } catch (error) {
    const failureReason = error instanceof Error
      ? error.message
      : String(error);
    await supabase
      .from("insight_report_runs")
      .update({
        status: "failed",
        failure_reason: failureReason,
        completed_at: new Date().toISOString(),
      })
      .eq("id", runId)
      .then(() => null, () => null);
    await writeAuditEvent(supabase, {
      tenantId,
      actorUserId: userId,
      action: "INSIGHT_REPORT_FAILED",
      entityType: "insight_report_run",
      entityId: runId,
      payload: { failureReason },
    }).then(() => null, () => null);
    throw error;
  }
}

export async function getInsightReportRun(
  supabase: SupabaseClient,
  runId: string,
) {
  if (!runId) {
    throw new Error("run_id is required");
  }
  const runResult = await supabase
    .from("insight_report_runs")
    .select(insightReportRunSelect)
    .eq("id", runId)
    .maybeSingle();
  if (runResult.error) {
    throw runResult.error;
  }
  if (!runResult.data) {
    throw new Error(`Insight report run ${runId} was not found.`);
  }
  const run = asRecord(runResult.data);
  return {
    run: runResult.data,
    report: run.report_payload ?? run.reportPayload ?? null,
  };
}

export async function listInsightReportRuns(
  supabase: SupabaseClient,
  tenantIds: string[],
  body: JsonRecord,
) {
  if (!tenantIds.length) {
    throw new Error("tenant_ids is required");
  }
  let query = supabase
    .from("insight_report_runs")
    .select(insightReportRunSelect)
    .order("created_at", { ascending: false })
    .limit(clampInteger(body.limit, 20, 1, 100));
  if (tenantIds.length === 1) {
    query = query.eq("tenant_id", tenantIds[0]);
  } else {
    query = query.in("tenant_id", tenantIds);
  }
  const { data, error } = await query;
  if (error) {
    throw error;
  }
  return data ?? [];
}

export async function acknowledgeOpsAlert(
  supabase: SupabaseClient,
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

export async function bootstrapTenant(
  supabase: SupabaseClient,
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
