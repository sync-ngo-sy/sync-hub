import type { InsightsDashboardSnapshot, InsightsGapAnalysis } from "@/lib/contracts";
import { asArray, asRecord, toNumber, toStringArray, type JsonRecord } from "@/lib/api/json";

function normalizeTrend(value: unknown): InsightsDashboardSnapshot["metrics"][number]["trend"] {
  return value === "up" || value === "down" || value === "flat" ? value : "flat";
}

export function mapRemoteInsightsDashboard(payload: JsonRecord): InsightsDashboardSnapshot {
  return {
    generatedAt: String(payload.generatedAt ?? payload.generated_at ?? new Date().toISOString()),
    metrics: asArray(payload.metrics).map((item) => {
      const record = asRecord(item);
      return {
        key: String(record.key ?? ""),
        label: String(record.label ?? ""),
        value: toNumber(record.value),
        deltaValue: toNumber(record.deltaValue ?? record.delta_value),
        deltaPercent: record.deltaPercent === null || record.deltaPercent === undefined ? null : toNumber(record.deltaPercent ?? record.delta_percent),
        trend: normalizeTrend(record.trend),
        sparkline: asArray(record.sparkline).map((value) => toNumber(value)),
      };
    }),
    profilesBySeniority: asArray(payload.profilesBySeniority).map((item) => {
      const record = asRecord(item);
      return { label: String(record.label ?? ""), value: toNumber(record.value), percent: record.percent === undefined ? null : toNumber(record.percent) };
    }),
    profilesByLocation: asArray(payload.profilesByLocation).map((item) => {
      const record = asRecord(item);
      return { label: String(record.label ?? ""), value: toNumber(record.value), percent: record.percent === undefined ? null : toNumber(record.percent) };
    }),
    jobFamilies: asArray(payload.jobFamilies).map((item) => {
      const record = asRecord(item);
      return { label: String(record.label ?? ""), value: toNumber(record.value), percent: record.percent === undefined ? null : toNumber(record.percent) };
    }),
    skillsFrequency: asArray(payload.skillsFrequency).map((item) => {
      const record = asRecord(item);
      return { skill: String(record.skill ?? ""), count: toNumber(record.count) };
    }),
    gapUseCases: asArray(payload.gapUseCases).map((item) => {
      const record = asRecord(item);
      return {
        id: String(record.id ?? ""),
        title: String(record.title ?? ""),
        detail: String(record.detail ?? ""),
        skills: toStringArray(record.skills),
        query: String(record.query ?? ""),
      };
    }),
    seniorityPyramid: asArray(payload.seniorityPyramid).map((item) => {
      const record = asRecord(item);
      return {
        jobFamily: String(record.jobFamily ?? record.job_family ?? ""),
        junior: toNumber(record.junior),
        mid: toNumber(record.mid),
        senior: toNumber(record.senior),
        lead: toNumber(record.lead),
        executive: toNumber(record.executive),
      };
    }),
    gapAnalysis: mapRemoteInsightsGapAnalysis(asRecord(payload.gapAnalysis)),
  };
}

export function mapRemoteInsightsGapAnalysis(payload: JsonRecord): InsightsGapAnalysis {
  return {
    targetRole: typeof payload.targetRole === "string"
      ? payload.targetRole
      : typeof payload.target_role === "string"
      ? payload.target_role
      : null,
    targetSkills: toStringArray(payload.targetSkills ?? payload.target_skills),
    fullyMatchingCandidates: toNumber(payload.fullyMatchingCandidates ?? payload.fully_matching_candidates),
    partiallyMatchingCandidates: toNumber(payload.partiallyMatchingCandidates ?? payload.partially_matching_candidates),
    zeroMatchCandidates: toNumber(payload.zeroMatchCandidates ?? payload.zero_match_candidates),
    missingSkills: asArray(payload.missingSkills ?? payload.missing_skills).map((item) => {
      const missing = asRecord(item);
      return {
        skill: String(missing.skill ?? ""),
        missingFromPartialCandidates: toNumber(
          missing.missingFromPartialCandidates ?? missing.missing_from_partial_candidates,
        ),
      };
    }),
  };
}
