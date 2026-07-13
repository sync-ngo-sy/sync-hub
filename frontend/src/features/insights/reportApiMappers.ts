import type {
  InsightReportResult,
  InsightReportRun,
  InsightReportRunDetail,
  InsightReportRunStatus,
  InsightReportType,
} from "@/lib/contracts";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function nullableString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizeReportType(value: unknown): InsightReportType {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "gap_brief" || normalized === "job_family_analysis") {
    return normalized;
  }
  return "corpus_overview";
}

function normalizeRunStatus(value: unknown): InsightReportRunStatus {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "queued" || normalized === "running" || normalized === "completed") {
    return normalized;
  }
  return "failed";
}

function mapRemoteInsightReportCitation(row: unknown) {
  const record = asRecord(row);
  return {
    metricKey: String(record.metricKey ?? record.metric_key ?? ""),
    label: String(record.label ?? ""),
    value: String(record.value ?? ""),
  };
}

export function mapRemoteInsightReportResult(payload: unknown): InsightReportResult | null {
  if (!payload) {
    return null;
  }
  const record = asRecord(payload);
  return {
    title: String(record.title ?? "Insight report"),
    executiveSummary: String(record.executiveSummary ?? record.executive_summary ?? ""),
    sections: asArray(record.sections).map((section) => {
      const sectionRecord = asRecord(section);
      return {
        title: String(sectionRecord.title ?? ""),
        body: String(sectionRecord.body ?? ""),
        citations: asArray(sectionRecord.citations).map(mapRemoteInsightReportCitation),
      };
    }),
    recommendations: asArray(record.recommendations).map((item) => String(item)),
    risks: asArray(record.risks).map((item) => String(item)),
    assistantPrompts: asArray(record.assistantPrompts ?? record.assistant_prompts).map((item) => String(item)),
  };
}

export function mapRemoteInsightReportRun(row: unknown): InsightReportRun {
  const record = asRecord(row);
  return {
    id: String(record.id ?? ""),
    tenantId: String(record.tenant_id ?? record.tenantId ?? ""),
    initiatedByUserId: nullableString(record.initiated_by_user_id ?? record.initiatedByUserId),
    status: normalizeRunStatus(record.status),
    reportType: normalizeReportType(record.report_type ?? record.reportType),
    inputConfig: asRecord(record.input_config ?? record.inputConfig),
    failureReason: nullableString(record.failure_reason ?? record.failureReason),
    llmProvider: nullableString(record.llm_provider ?? record.llmProvider),
    llmModel: nullableString(record.llm_model ?? record.llmModel),
    startedAt: nullableString(record.started_at ?? record.startedAt),
    completedAt: nullableString(record.completed_at ?? record.completedAt),
    createdAt: String(record.created_at ?? record.createdAt ?? ""),
  };
}

export function mapRemoteInsightReportRunDetail(payload: unknown): InsightReportRunDetail {
  const record = asRecord(payload);
  return {
    run: mapRemoteInsightReportRun(record.run),
    report: mapRemoteInsightReportResult(record.report ?? record.report_payload ?? record.reportPayload),
  };
}
