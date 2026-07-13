import type { InsightsDashboardSnapshot, InsightsDistributionItem, InsightsGapUseCase } from "@/lib/contracts";

export const SEARCH_STATE_STORAGE_KEY = "cv-intelligence.search.discovery-state";
export const AI_BRIEF_HANDOFF_STORAGE_KEY = "cv-intelligence.insights.ai-brief-handoff";
export const PAGE_SIZE = 12;
export const CHART_COLORS = ["#50c1b8", "#ffcf7a", "#73e0a8", "#8aa8ff", "#f08bb4", "#b7a8ff", "#f49f6b", "#9ad7ff"];

export type JobFamilyView = "donut" | "treemap" | "table";
export type InsightsTab = "tab1" | "tab2" | "tab3" | "tab4";

export const INSIGHTS_TABS: Array<{ id: InsightsTab; label: string; detail: string }> = [
  { id: "tab1", label: "Overview", detail: "Corpus, locations, families, seniority" },
  { id: "tab2", label: "Top Skills", detail: "Frequency and supply depth" },
  { id: "tab3", label: "Gap Engine", detail: "Role requirements and missing skills" },
  { id: "tab4", label: "AI Brief", detail: "Grounded report generation with ticket state" },
];

const GAP_USE_CASE_TEMPLATES = [
  {
    id: "employer-brief",
    title: "Employer brief",
    detail: "Check whether the pool can satisfy a live role demand.",
    skillGroups: [["React"], ["React Native"], ["TypeScript", "JavaScript"]],
  },
  {
    id: "training-cohort",
    title: "Training cohort",
    detail: "Find partial candidates that could convert with focused upskilling.",
    skillGroups: [["Kubernetes"], ["Terraform"], ["Docker"], ["AWS", "Azure", "Google Cloud"]],
  },
  {
    id: "funding-evidence",
    title: "Funding evidence",
    detail: "Quantify scarce capabilities for program and grant narratives.",
    skillGroups: [["SQL"], ["Power BI"], ["Tableau", "Excel"], ["Python"]],
  },
  {
    id: "delivery-risk",
    title: "Delivery risk",
    detail: "Spot backend/API supply depth before committing to delivery targets.",
    skillGroups: [["Node.js"], ["REST APIs", "APIs"], ["PostgreSQL", "SQL"], ["GraphQL"]],
  },
];

export function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US", { notation: value >= 1000000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(value);
}

export function formatPercent(value: number) {
  if (!Number.isFinite(value)) {
    return "0%";
  }
  return `${Math.round(value)}%`;
}

export function normalizeCatalogSkill(value: string) {
  return value
    .toLowerCase()
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[^a-z0-9+#./]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function findCatalogSkill(catalog: readonly string[], aliases: readonly string[]) {
  const normalizedAliases = new Set(aliases.map(normalizeCatalogSkill));
  return catalog.find((skill) => normalizedAliases.has(normalizeCatalogSkill(skill)));
}

export function buildGapUseCases(catalog: readonly string[]): InsightsGapUseCase[] {
  const useCases: InsightsGapUseCase[] = [];
  const seenQueries = new Set<string>();

  for (const template of GAP_USE_CASE_TEMPLATES) {
    const skills = template.skillGroups.map((aliases) => findCatalogSkill(catalog, aliases)).filter((skill): skill is string => Boolean(skill));
    if (skills.length < 2) {
      continue;
    }
    const query = skills.join(" and ");
    const queryKey = normalizeCatalogSkill(query);
    if (seenQueries.has(queryKey)) {
      continue;
    }
    seenQueries.add(queryKey);
    useCases.push({ ...template, skills, query });
  }

  for (let index = 0; useCases.length < 4 && index < catalog.length; index += 3) {
    const skills = catalog.slice(index, index + 3).filter(Boolean);
    if (skills.length < 2) {
      continue;
    }
    const query = skills.join(" and ");
    const queryKey = normalizeCatalogSkill(query);
    if (seenQueries.has(queryKey)) {
      continue;
    }
    seenQueries.add(queryKey);
    useCases.push({
      id: `corpus-cluster-${index}`,
      title: `Corpus cluster ${Math.floor(index / 3) + 1}`,
      detail: "Scan a high-frequency skill cluster from this tenant's Supabase corpus.",
      skills,
      query,
    });
  }

  return useCases;
}

export function getGapVerdict(analysis: InsightsDashboardSnapshot["gapAnalysis"]) {
  const total = analysis.fullyMatchingCandidates + analysis.partiallyMatchingCandidates + analysis.zeroMatchCandidates;
  const fullRate = total ? (analysis.fullyMatchingCandidates / total) * 100 : 0;
  const reachableRate = total ? ((analysis.fullyMatchingCandidates + analysis.partiallyMatchingCandidates) / total) * 100 : 0;
  const topMissing = analysis.missingSkills[0]?.skill;

  if (!analysis.targetSkills.length) {
    return {
      tone: "warning" as const,
      title: "Requirement not resolved",
      detail: "The role text did not map to a known skill in the tenant skill catalog.",
    };
  }
  if (fullRate >= 15) {
    return {
      tone: "success" as const,
      title: "Strong exact-match supply",
      detail: `${formatPercent(fullRate)} of indexed profiles already match every requirement.`,
    };
  }
  if (reachableRate >= 35 && analysis.partiallyMatchingCandidates > analysis.fullyMatchingCandidates) {
    return {
      tone: "primary" as const,
      title: "Upskilling opportunity",
      detail: topMissing
        ? `${formatNumber(analysis.partiallyMatchingCandidates)} partial profiles could improve fastest by closing ${topMissing}.`
        : `${formatNumber(analysis.partiallyMatchingCandidates)} partial profiles are close to the requirement.`,
    };
  }
  return {
    tone: "warning" as const,
    title: "Scarce capability",
    detail: topMissing
      ? `${topMissing} is the most visible blocker among partial profiles.`
      : "Very few profiles show overlap with the selected requirement.",
  };
}

export function normalizeInsightsTab(hash: string): InsightsTab {
  const normalized = hash.replace(/^#/, "");
  if (normalized === "tab2" || normalized === "tab3" || normalized === "tab4") {
    return normalized;
  }
  return "tab1";
}

export function clampTopSkills(value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 50;
  }
  return Math.max(10, Math.min(200, Math.trunc(parsed)));
}

export function buildJobFamiliesCsv(items: InsightsDistributionItem[]) {
  const rows = [["Job Family", "Profiles", "Percent"], ...items.map((item) => [item.label, String(item.value), String(item.percent ?? "")])];
  return rows.map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(",")).join("\n");
}

export function exportJobFamilies(items: InsightsDistributionItem[]) {
  const csv = buildJobFamiliesCsv(items);
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `job-family-distribution-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export type InsightsAiBriefHandoff = {
  reportType: "corpus_overview" | "gap_brief" | "job_family_analysis";
  focus?: string;
  targetSkills?: string[];
};

export function writeInsightsAiBriefHandoff(handoff: InsightsAiBriefHandoff) {
  window.sessionStorage.setItem(AI_BRIEF_HANDOFF_STORAGE_KEY, JSON.stringify(handoff));
}

export function readInsightsAiBriefHandoff(): InsightsAiBriefHandoff | null {
  const raw = window.sessionStorage.getItem(AI_BRIEF_HANDOFF_STORAGE_KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as InsightsAiBriefHandoff;
    window.sessionStorage.removeItem(AI_BRIEF_HANDOFF_STORAGE_KEY);
    return parsed?.reportType ? parsed : null;
  } catch {
    window.sessionStorage.removeItem(AI_BRIEF_HANDOFF_STORAGE_KEY);
    return null;
  }
}

export function openInsightsSearchWithSkills(skills: string[], query?: string) {
  if (!skills.length) {
    return;
  }
  window.sessionStorage.setItem(
    SEARCH_STATE_STORAGE_KEY,
    JSON.stringify({
      request: {
        query: query ?? skills.join(" "),
        filters: { role: "", skills, companies: [] },
        offset: 0,
        limit: PAGE_SIZE,
      },
      sortBy: "best-match",
    }),
  );
}
