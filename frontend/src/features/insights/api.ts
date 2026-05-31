import type { InsightsDashboardOptions, InsightsDashboardSnapshot, InsightsGapAnalysis } from "@/lib/contracts";
import { asArray, asRecord, toNumber, toStringArray, type JsonRecord } from "@/lib/api/json";
import { candidateHasGapSkill, resolveGapRequirements } from "@/lib/insightsGap";
import { supabase } from "@/lib/supabaseClient";

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
    targetRole: typeof payload.targetRole === "string" ? payload.targetRole : null,
    targetSkills: toStringArray(payload.targetSkills),
    fullyMatchingCandidates: toNumber(payload.fullyMatchingCandidates),
    partiallyMatchingCandidates: toNumber(payload.partiallyMatchingCandidates),
    zeroMatchCandidates: toNumber(payload.zeroMatchCandidates),
    missingSkills: asArray(payload.missingSkills).map((item) => {
      const missing = asRecord(item);
      return {
        skill: String(missing.skill ?? ""),
        missingFromPartialCandidates: toNumber(missing.missingFromPartialCandidates),
      };
    }),
  };
}

type InsightsCandidateSearchCacheRow = {
  tenant_id: string;
  candidate_id: string;
  current_title: string | null;
  headline: string | null;
  location: string | null;
  seniority: string | null;
  primary_role: string | null;
  role_tags: string[] | null;
  skills: string[] | null;
  created_at: string | null;
  updated_at: string | null;
};

type InsightsJobFamilyRule = {
  label: string;
  roleTags: string[];
  titleSignals: string[];
  skillSignals: string[];
};

const INSIGHTS_FALLBACK_PAGE_SIZE = 1000;
const INSIGHTS_FALLBACK_MAX_ROWS = 20000;
const INSIGHTS_JOB_FAMILY_RULES: InsightsJobFamilyRule[] = [
  {
    label: "Full-Stack Engineering",
    roleTags: ["full-stack"],
    titleSignals: ["full stack", "full-stack"],
    skillSignals: ["react", "angular", "vue", "node.js", "express", "django", "laravel", "postgresql", "mongodb", "sql", "apis"],
  },
  {
    label: "Backend Engineering",
    roleTags: ["backend"],
    titleSignals: ["backend", "back-end", "api", "server", "platform"],
    skillSignals: ["node.js", "nestjs", "express", "java", "spring", "python", "django", "fastapi", "laravel", "php", "asp.net", ".net", "postgresql", "mysql", "mongodb", "redis", "graphql", "rest apis"],
  },
  {
    label: "Frontend Engineering",
    roleTags: ["frontend"],
    titleSignals: ["frontend", "front-end", "ui engineer", "web developer"],
    skillSignals: ["react", "next.js", "angular", "vue", "javascript", "typescript", "html", "css", "tailwind", "bootstrap", "redux"],
  },
  {
    label: "Mobile Engineering",
    roleTags: ["mobile"],
    titleSignals: ["mobile", "android", "ios", "flutter", "react native"],
    skillSignals: ["flutter", "dart", "android", "ios", "swift", "kotlin", "react native", "firebase"],
  },
  {
    label: "AI & Machine Learning",
    roleTags: ["ml"],
    titleSignals: ["machine learning", "ml engineer", "ai engineer", "data scientist", "llm"],
    skillSignals: ["machine learning", "deep learning", "tensorflow", "pytorch", "scikit", "keras", "opencv", "nlp", "llm", "computer vision"],
  },
  {
    label: "Data & Analytics",
    roleTags: ["data"],
    titleSignals: ["data analyst", "data engineer", "business intelligence", "bi developer", "analytics"],
    skillSignals: ["sql", "power bi", "tableau", "excel", "pandas", "numpy", "etl", "data analysis", "data visualization"],
  },
  {
    label: "Cloud, DevOps & SRE",
    roleTags: ["devops"],
    titleSignals: ["devops", "sre", "site reliability", "cloud", "infrastructure"],
    skillSignals: ["docker", "kubernetes", "terraform", "aws", "azure", "google cloud", "gcp", "ci/cd", "linux", "jenkins", "ansible", "helm"],
  },
  {
    label: "Cybersecurity",
    roleTags: ["security"],
    titleSignals: ["security", "cyber", "soc", "penetration", "threat", "siem"],
    skillSignals: ["cybersecurity", "security", "soc operations", "siem", "penetration testing", "vulnerability", "threat detection", "incident response"],
  },
  {
    label: "QA & Test Automation",
    roleTags: ["qa"],
    titleSignals: ["qa", "quality assurance", "test automation", "tester"],
    skillSignals: ["selenium", "playwright", "cypress", "jest", "testing", "test automation", "quality assurance"],
  },
  {
    label: "Product & Design",
    roleTags: ["product", "design"],
    titleSignals: ["product designer", "ui/ux", "ux designer", "product manager"],
    skillSignals: ["figma", "ui/ux", "wireframing", "prototyping", "user research", "product management"],
  },
  {
    label: "Software Engineering",
    roleTags: ["generalist"],
    titleSignals: ["software", "developer", "engineer", "programmer"],
    skillSignals: ["git", "github", "apis", "javascript", "python", "java", "sql", "problem solving"],
  },
];

function includesAny(haystack: string, needles: string[]) {
  return needles.some((needle) => haystack.includes(needle));
}

function inferInsightsJobFamily(row: InsightsCandidateSearchCacheRow) {
  const roleTags = toStringArray(row.role_tags).map((tag) => tag.toLowerCase());
  const roleText = [...roleTags, row.primary_role ?? "", row.current_title ?? "", row.headline ?? ""].join(" ").toLowerCase();
  const titleText = [row.current_title ?? "", row.headline ?? ""].join(" ").toLowerCase();
  const skillText = toStringArray(row.skills).join(" ").toLowerCase();
  let bestFamily = "Unclassified";
  let bestScore = 0;

  for (const rule of INSIGHTS_JOB_FAMILY_RULES) {
    let score = 0;
    if (rule.roleTags.some((tag) => roleTags.includes(tag)) || includesAny(roleText, rule.roleTags)) {
      score += 90;
    }
    if (includesAny(titleText, rule.titleSignals)) {
      score += 55;
    }
    score += Math.min(60, rule.skillSignals.filter((signal) => skillText.includes(signal)).length * 12);
    if (score > bestScore) {
      bestScore = score;
      bestFamily = rule.label;
    }
  }

  if (roleTags.includes("backend") && roleTags.includes("frontend") && bestScore < 120) {
    return "Full-Stack Engineering";
  }
  return bestScore >= 40 ? bestFamily : "Unclassified";
}

function normalizeInsightsSeniority(value: string | null | undefined) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized || "unclassified";
}

function normalizePyramidSeniority(value: string | null | undefined) {
  const normalized = normalizeInsightsSeniority(value);
  if (normalized === "staff-plus" || normalized === "principal" || normalized === "manager") {
    return "lead";
  }
  if (normalized === "junior" || normalized === "mid" || normalized === "senior" || normalized === "lead" || normalized === "executive") {
    return normalized;
  }
  return "junior";
}

function incrementCount(map: Map<string, number>, key: string, amount = 1) {
  map.set(key, (map.get(key) ?? 0) + amount);
}

function distributionFromCounts(counts: Map<string, number>, total: number, limit?: number): InsightsDashboardSnapshot["jobFamilies"] {
  return Array.from(counts.entries())
    .map(([label, value]) => ({
      label,
      value,
      percent: total ? Number(((value / total) * 100).toFixed(1)) : 0,
    }))
    .sort((left, right) => right.value - left.value || left.label.localeCompare(right.label))
    .slice(0, limit ?? counts.size);
}

function buildInsightsSparkline(rows: InsightsCandidateSearchCacheRow[], now = new Date()) {
  const bucketCount = 6;
  const bucketMs = 5 * 24 * 60 * 60 * 1000;
  const startMs = now.getTime() - bucketCount * bucketMs;
  const buckets = Array.from({ length: bucketCount }, () => 0);
  for (const row of rows) {
    const createdMs = Date.parse(row.created_at ?? "");
    if (!Number.isFinite(createdMs) || createdMs < startMs) {
      continue;
    }
    const bucketIndex = Math.min(bucketCount - 1, Math.max(0, Math.floor((createdMs - startMs) / bucketMs)));
    buckets[bucketIndex] += 1;
  }
  return buckets;
}

async function fetchInsightsSearchCacheRows(tenantIds: string[]): Promise<InsightsCandidateSearchCacheRow[]> {
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const rows: InsightsCandidateSearchCacheRow[] = [];
  for (let offset = 0; offset < INSIGHTS_FALLBACK_MAX_ROWS; offset += INSIGHTS_FALLBACK_PAGE_SIZE) {
    let query = supabase
      .from("candidate_search_cache")
      .select("tenant_id,candidate_id,current_title,headline,location,seniority,primary_role,role_tags,skills,created_at,updated_at")
      .order("created_at", { ascending: false })
      .range(offset, offset + INSIGHTS_FALLBACK_PAGE_SIZE - 1);

    if (tenantIds.length) {
      query = query.in("tenant_id", tenantIds);
    }

    const { data, error } = await query;
    if (error) {
      throw error;
    }
    rows.push(...((data ?? []) as InsightsCandidateSearchCacheRow[]));
    if (!data || data.length < INSIGHTS_FALLBACK_PAGE_SIZE) {
      break;
    }
  }
  return rows;
}

export async function fetchInsightsDashboardFromSearchCache(options: InsightsDashboardOptions = {}, tenantIds: string[] = []): Promise<InsightsDashboardSnapshot> {
  const rows = await fetchInsightsSearchCacheRows(tenantIds);
  const now = new Date();
  const currentWindowStart = now.getTime() - 30 * 24 * 60 * 60 * 1000;
  const previousWindowStart = now.getTime() - 60 * 24 * 60 * 60 * 1000;
  const topSkills = Math.max(1, Math.min(200, options.topSkills ?? 50));
  const corpusSkills = Array.from(new Set(rows.flatMap((row) => toStringArray(row.skills))));
  const targetSkills = resolveGapRequirements({ targetRole: options.targetRole, targetSkills: options.targetSkills }, corpusSkills);
  const total = rows.length;
  const added30 = rows.filter((row) => Date.parse(row.created_at ?? "") >= currentWindowStart).length;
  const previousAdded30 = rows.filter((row) => {
    const createdMs = Date.parse(row.created_at ?? "");
    return createdMs >= previousWindowStart && createdMs < currentWindowStart;
  }).length;
  const sparkline = buildInsightsSparkline(rows, now);
  const seniorityCounts = new Map<string, number>();
  const locationCounts = new Map<string, number>();
  const jobFamilyCounts = new Map<string, number>();
  const skillCounts = new Map<string, number>();
  const pyramidCounts = new Map<string, { junior: number; mid: number; senior: number; lead: number; executive: number }>();
  let classifiedCount = 0;
  let skillTotal = 0;
  let fullyMatchingCandidates = 0;
  let partiallyMatchingCandidates = 0;
  let zeroMatchCandidates = 0;
  const missingSkills = new Map<string, number>();

  for (const row of rows) {
    const skills = toStringArray(row.skills);
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
    for (const skill of skills) {
      incrementCount(skillCounts, skill);
    }

    const pyramidSeniority = normalizePyramidSeniority(row.seniority);
    const pyramid = pyramidCounts.get(jobFamily) ?? { junior: 0, mid: 0, senior: 0, lead: 0, executive: 0 };
    pyramid[pyramidSeniority] += 1;
    pyramidCounts.set(jobFamily, pyramid);

    if (targetSkills.length) {
      const matchedSkills = targetSkills.filter((skill) => candidateHasGapSkill(skills, skill));
      if (matchedSkills.length === targetSkills.length) {
        fullyMatchingCandidates += 1;
      } else if (matchedSkills.length > 0) {
        partiallyMatchingCandidates += 1;
        for (const skill of targetSkills) {
          if (!candidateHasGapSkill(skills, skill)) {
            incrementCount(missingSkills, skill);
          }
        }
      } else {
        zeroMatchCandidates += 1;
      }
    }
  }

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
        deltaPercent: previousAdded30 ? Number(((deltaValue / previousAdded30) * 100).toFixed(1)) : null,
        trend,
        sparkline,
      },
      {
        key: "cvs_added_30d",
        label: "CVs Added (Last 30 Days)",
        value: added30,
        deltaValue,
        deltaPercent: previousAdded30 ? Number(((deltaValue / previousAdded30) * 100).toFixed(1)) : null,
        trend,
        sparkline,
      },
      {
        key: "job_family_coverage",
        label: "Job Family Coverage",
        value: total ? Number(((classifiedCount / total) * 100).toFixed(1)) : 0,
        deltaValue: 0,
        deltaPercent: null,
        trend: "flat",
        sparkline,
      },
      {
        key: "avg_skills_per_profile",
        label: "Avg Skills per Profile",
        value: total ? Number((skillTotal / total).toFixed(1)) : 0,
        deltaValue: 0,
        deltaPercent: null,
        trend: "flat",
        sparkline,
      },
    ],
    profilesBySeniority: distributionFromCounts(seniorityCounts, total),
    profilesByLocation: distributionFromCounts(locationCounts, total, 12),
    jobFamilies: distributionFromCounts(jobFamilyCounts, total),
    skillsFrequency: Array.from(skillCounts.entries())
      .map(([skill, count]) => ({ skill, count }))
      .sort((left, right) => right.count - left.count || left.skill.localeCompare(right.skill))
      .slice(0, topSkills),
    gapUseCases: [],
    seniorityPyramid: Array.from(pyramidCounts.entries())
      .map(([jobFamily, values]) => ({ jobFamily, ...values }))
      .sort((left, right) => {
        const leftTotal = left.junior + left.mid + left.senior + left.lead + left.executive;
        const rightTotal = right.junior + right.mid + right.senior + right.lead + right.executive;
        return rightTotal - leftTotal || left.jobFamily.localeCompare(right.jobFamily);
      }),
    gapAnalysis: {
      targetRole: options.targetRole ?? null,
      targetSkills,
      fullyMatchingCandidates,
      partiallyMatchingCandidates,
      zeroMatchCandidates,
      missingSkills: Array.from(missingSkills.entries())
        .map(([skill, missingFromPartialCandidates]) => ({ skill, missingFromPartialCandidates }))
        .sort((left, right) => right.missingFromPartialCandidates - left.missingFromPartialCandidates || left.skill.localeCompare(right.skill)),
    },
  };
}

export async function fetchInsightsDashboardFromRpc(options: InsightsDashboardOptions = {}, tenantIds: string[] = []): Promise<InsightsDashboardSnapshot> {
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const { data, error } = await supabase.rpc("insights_dashboard_snapshot_v1", {
    p_tenant_ids: tenantIds.length ? tenantIds : null,
    p_top_skills: options.topSkills ?? 50,
    p_target_skills: options.targetSkills?.length ? options.targetSkills : null,
    p_target_role: options.targetRole ?? null,
  });
  if (error) {
    throw error;
  }
  return mapRemoteInsightsDashboard(asRecord(data));
}

export async function fetchInsightsGapAnalysisFromRpc(options: InsightsDashboardOptions = {}, tenantIds: string[] = []): Promise<InsightsGapAnalysis> {
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const { data, error } = await supabase.rpc("insights_gap_analysis_v1", {
    p_tenant_ids: tenantIds.length ? tenantIds : null,
    p_target_skills: options.targetSkills?.length ? options.targetSkills : null,
    p_target_role: options.targetRole ?? null,
  });
  if (error) {
    throw error;
  }
  return mapRemoteInsightsGapAnalysis(asRecord(data));
}
