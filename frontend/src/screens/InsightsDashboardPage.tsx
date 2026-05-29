import { useEffect, useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ArrowRight, BarChart3, Download, Grid2X2, Lightbulb, PieChart, RefreshCw, Search, Table2, Target, TrendingDown, TrendingUp } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { insightsDashboardSnapshot } from "@/data/mockData";
import type { InsightsDashboardSnapshot, InsightsDistributionItem, InsightsGapUseCase, InsightsMetric, InsightsSkillFrequency } from "@/lib/contracts";
import { useAuth } from "@/lib/auth";
import { platformApi } from "@/lib/platformApi";
import { PageIntro, Panel, Tag } from "@/components/ui";
import { cn } from "@/lib/cn";
import { extractGapSkillRequirements } from "@/lib/insightsGap";
import { hasSupabaseConfig } from "@/lib/supabaseClient";

const SEARCH_STATE_STORAGE_KEY = "cv-intelligence.search.discovery-state";
const PAGE_SIZE = 12;
const CHART_COLORS = ["#50c1b8", "#ffcf7a", "#73e0a8", "#8aa8ff", "#f08bb4", "#b7a8ff", "#f49f6b", "#9ad7ff"];

type JobFamilyView = "donut" | "treemap" | "table";
type InsightsTab = "tab1" | "tab2" | "tab3";

const INSIGHTS_TABS: Array<{ id: InsightsTab; label: string; detail: string }> = [
  { id: "tab1", label: "Overview", detail: "Corpus, locations, families, seniority" },
  { id: "tab2", label: "Top Skills", detail: "Frequency and supply depth" },
  { id: "tab3", label: "Gap Engine", detail: "Role requirements and missing skills" },
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

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US", { notation: value >= 1000000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(value);
}

function formatPercent(value: number) {
  if (!Number.isFinite(value)) {
    return "0%";
  }
  return `${Math.round(value)}%`;
}

function normalizeCatalogSkill(value: string) {
  return value
    .toLowerCase()
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[^a-z0-9+#./]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findCatalogSkill(catalog: string[], aliases: string[]) {
  const normalizedAliases = new Set(aliases.map(normalizeCatalogSkill));
  return catalog.find((skill) => normalizedAliases.has(normalizeCatalogSkill(skill)));
}

function buildGapUseCases(catalog: string[]): InsightsGapUseCase[] {
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

function getGapVerdict(analysis: InsightsDashboardSnapshot["gapAnalysis"]) {
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

function normalizeInsightsTab(hash: string): InsightsTab {
  const normalized = hash.replace(/^#/, "");
  return normalized === "tab2" || normalized === "tab3" ? normalized : "tab1";
}

function clampTopSkills(value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 50;
  }
  return Math.max(10, Math.min(200, Math.trunc(parsed)));
}

function exportJobFamilies(items: InsightsDistributionItem[]) {
  const rows = [["Job Family", "Profiles", "Percent"], ...items.map((item) => [item.label, String(item.value), String(item.percent ?? "")])];
  const csv = rows.map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `job-family-distribution-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function MetricCard({ metric }: { metric: InsightsMetric }) {
  const max = Math.max(...metric.sparkline, 1);
  const points = metric.sparkline
    .map((value, index) => {
      const x = metric.sparkline.length <= 1 ? 0 : (index / (metric.sparkline.length - 1)) * 100;
      const y = 36 - (value / max) * 32;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <Panel className="insight-stat">
      <div className="insight-stat__top">
        <span>{metric.label}</span>
        {metric.trend === "down" ? <TrendingDown size={16} /> : <TrendingUp size={16} />}
      </div>
      <strong>{formatNumber(metric.value)}</strong>
      <span className={cn("insight-stat__delta", metric.trend === "down" && "insight-stat__delta--down")}>
        {metric.deltaValue >= 0 ? "+" : ""}
        {formatNumber(metric.deltaValue)} vs previous 30 days
      </span>
      <svg className="sparkline" viewBox="0 0 100 40" role="img" aria-label={`${metric.label} trend`}>
        <polyline points={points} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </Panel>
  );
}

function DistributionBars({ items }: { items: InsightsDistributionItem[] }) {
  const max = Math.max(...items.map((item) => item.value), 1);
  return (
    <div className="insight-bars">
      {items.map((item) => (
        <div className="insight-bars__row" key={item.label}>
          <div className="signal-row">
            <strong>{item.label}</strong>
            <span>{formatNumber(item.value)}</span>
          </div>
          <div className="progress-bar">
            <span className="progress-bar__value progress-bar__value--primary" style={{ width: `${(item.value / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function JobFamilyDonut({ items, onDrilldown }: { items: InsightsDistributionItem[]; onDrilldown: (family: string) => void }) {
  const total = items.reduce((sum, item) => sum + item.value, 0) || 1;
  let cursor = 0;
  const stops = items
    .map((item, index) => {
      const start = cursor;
      const end = cursor + (item.value / total) * 100;
      cursor = end;
      return `${CHART_COLORS[index % CHART_COLORS.length]} ${start}% ${end}%`;
    })
    .join(", ");

  return (
    <div className="job-family-donut">
      <button
        className="job-family-donut__chart"
        style={{ background: `conic-gradient(${stops})` }}
        type="button"
        aria-label="Job family distribution donut"
        onClick={() => onDrilldown(items[0]?.label ?? "")}
      />
      <div className="job-family-legend">
        {items.map((item, index) => (
          <button key={item.label} className="job-family-legend__item" type="button" onClick={() => onDrilldown(item.label)}>
            <span style={{ background: CHART_COLORS[index % CHART_COLORS.length] }} />
            <strong>{item.label}</strong>
            <em>{item.percent ?? Math.round((item.value / total) * 100)}%</em>
          </button>
        ))}
      </div>
    </div>
  );
}

function JobFamilyTreemap({ items, onDrilldown }: { items: InsightsDistributionItem[]; onDrilldown: (family: string) => void }) {
  const total = items.reduce((sum, item) => sum + item.value, 0) || 1;
  return (
    <div className="job-family-treemap">
      {items.map((item, index) => (
        <button
          key={item.label}
          className="job-family-tile"
          style={{ flexGrow: Math.max(1, item.value / total * 100), background: CHART_COLORS[index % CHART_COLORS.length] }}
          type="button"
          onClick={() => onDrilldown(item.label)}
        >
          <strong>{item.label}</strong>
          <span>{formatNumber(item.value)}</span>
        </button>
      ))}
    </div>
  );
}

function SkillsBars({ items }: { items: InsightsSkillFrequency[] }) {
  const visible = items.slice(0, 15);
  const max = Math.max(...visible.map((item) => item.count), 1);
  return (
    <div className="ranked-bars">
      {visible.map((item, index) => (
        <div className="ranked-bars__row" key={item.skill}>
          <span>{index + 1}</span>
          <strong>{item.skill}</strong>
          <div className="progress-bar">
            <span className="progress-bar__value progress-bar__value--secondary" style={{ width: `${(item.count / max) * 100}%` }} />
          </div>
          <em>{formatNumber(item.count)}</em>
        </div>
      ))}
    </div>
  );
}

export function InsightsDashboardPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentTenant } = useAuth();
  const tenantIds = useMemo(() => (currentTenant?.id ? [currentTenant.id] : []), [currentTenant?.id]);
  const activeTab = normalizeInsightsTab(location.hash);
  const [appliedTopSkills, setAppliedTopSkills] = useState(50);
  const [topSkillsDraft, setTopSkillsDraft] = useState("50");
  const [gapDraft, setGapDraft] = useState("Cloud Engineer with Kubernetes and Terraform");
  const [appliedGapInput, setAppliedGapInput] = useState("Cloud Engineer with Kubernetes and Terraform");
  const [jobFamilyView, setJobFamilyView] = useState<JobFamilyView>("donut");

  useEffect(() => {
    if (!location.hash) {
      navigate({ pathname: "/insights", hash: "#tab1" }, { replace: true });
    }
  }, [location.hash, navigate]);

  const insightsQuery = useQuery({
    queryKey: ["insights-dashboard", tenantIds.join("|"), "base"],
    queryFn: () => platformApi.getInsightsDashboard({ topSkills: 200 }, tenantIds),
    placeholderData: hasSupabaseConfig ? undefined : insightsDashboardSnapshot,
  });
  const snapshot = insightsQuery.data ?? (!hasSupabaseConfig ? insightsDashboardSnapshot : undefined);
  const corpusSkillCatalog = useMemo(() => snapshot?.skillsFrequency.map((item) => item.skill) ?? [], [snapshot?.skillsFrequency]);
  const gapUseCases = useMemo(() => {
    if (snapshot?.gapUseCases.length) {
      return snapshot.gapUseCases;
    }
    return buildGapUseCases(corpusSkillCatalog);
  }, [corpusSkillCatalog, snapshot?.gapUseCases]);
  const draftTargetSkills = useMemo(() => extractGapSkillRequirements(gapDraft, corpusSkillCatalog), [corpusSkillCatalog, gapDraft]);
  const appliedTargetSkills = useMemo(() => extractGapSkillRequirements(appliedGapInput, corpusSkillCatalog), [appliedGapInput, corpusSkillCatalog]);

  const gapAnalysisQuery = useQuery({
    queryKey: ["insights-gap-analysis", tenantIds.join("|"), appliedGapInput],
    queryFn: () => platformApi.getInsightsGapAnalysis({ targetRole: appliedGapInput }, tenantIds),
    enabled: activeTab === "tab3" && Boolean(snapshot),
    placeholderData: keepPreviousData,
  });
  const visibleSkills = useMemo(() => snapshot?.skillsFrequency.slice(0, appliedTopSkills) ?? [], [appliedTopSkills, snapshot?.skillsFrequency]);

  function selectTab(tab: InsightsTab) {
    navigate({ pathname: "/insights", hash: `#${tab}` });
  }

  function applyTopSkills() {
    const nextTopSkills = clampTopSkills(topSkillsDraft);
    setAppliedTopSkills(nextTopSkills);
    setTopSkillsDraft(String(nextTopSkills));
  }

  function applyGapAnalysis() {
    const nextGapInput = gapDraft.trim() || "Cloud Engineer with Kubernetes and Terraform";
    if (nextGapInput === appliedGapInput) {
      void gapAnalysisQuery.refetch();
      return;
    }
    setAppliedGapInput(nextGapInput);
  }

  function runGapUseCase(query: string) {
    setGapDraft(query);
    if (query === appliedGapInput) {
      void gapAnalysisQuery.refetch();
      return;
    }
    setAppliedGapInput(query);
  }

  function refreshInsights() {
    void insightsQuery.refetch();
    if (activeTab === "tab3") {
      void gapAnalysisQuery.refetch();
    }
  }

  function drillIntoJobFamily(jobFamily: string) {
    if (!jobFamily) {
      return;
    }
    window.sessionStorage.setItem(
      SEARCH_STATE_STORAGE_KEY,
      JSON.stringify({
        request: {
          query: jobFamily,
          filters: { role: jobFamily, skills: [], companies: [] },
          offset: 0,
          limit: PAGE_SIZE,
        },
        sortBy: "best-match",
      }),
    );
    navigate("/search");
  }

  if (!snapshot) {
    return (
      <div className="page-stack insights-page">
        <PageIntro
          eyebrow="Insights"
          title="Insights & Intelligence Dashboard"
          description="Read-only corpus intelligence for executive visibility, workforce planning, and talent supply decisions."
          actions={
            <button className="button button--secondary" type="button" onClick={refreshInsights}>
              <RefreshCw size={16} />
              Refresh
            </button>
          }
        />
        <Panel className="table-card">
          <h3>{insightsQuery.isError ? "Production insights unavailable" : "Loading production insights"}</h3>
          <p className="muted">
            {insightsQuery.isError
              ? "The dashboard could not read the production insights source for the selected workspace."
              : "Reading the tenant-scoped production corpus."}
          </p>
        </Panel>
      </div>
    );
  }

  const activeGapAnalysis = gapAnalysisQuery.data ?? snapshot.gapAnalysis;
  const trimmedGapDraft = gapDraft.trim();
  const isEditingGapInput = Boolean(trimmedGapDraft && trimmedGapDraft !== appliedGapInput);
  const displayedGapSkills = draftTargetSkills.length ? draftTargetSkills : isEditingGapInput ? [] : activeGapAnalysis.targetSkills;
  const hasUnresolvedDraftSkills = Boolean(trimmedGapDraft && !draftTargetSkills.length);
  const totalGapCandidates =
    activeGapAnalysis.fullyMatchingCandidates + activeGapAnalysis.partiallyMatchingCandidates + activeGapAnalysis.zeroMatchCandidates;
  const fullCoveragePercent = totalGapCandidates ? (activeGapAnalysis.fullyMatchingCandidates / totalGapCandidates) * 100 : 0;
  const partialCoveragePercent = totalGapCandidates ? (activeGapAnalysis.partiallyMatchingCandidates / totalGapCandidates) * 100 : 0;
  const zeroCoveragePercent = Math.max(0, 100 - fullCoveragePercent - partialCoveragePercent);
  const reachableCoveragePercent = fullCoveragePercent + partialCoveragePercent;
  const gapVerdict = getGapVerdict(activeGapAnalysis);

  function exploreGapMatches() {
    const skills = activeGapAnalysis.targetSkills.length ? activeGapAnalysis.targetSkills : appliedTargetSkills;
    if (!skills.length) {
      return;
    }
    window.sessionStorage.setItem(
      SEARCH_STATE_STORAGE_KEY,
      JSON.stringify({
        request: {
          query: skills.join(" "),
          filters: { role: "", skills, companies: [] },
          offset: 0,
          limit: PAGE_SIZE,
        },
        sortBy: "best-match",
      }),
    );
    navigate("/search");
  }

  return (
    <div className="page-stack insights-page">
      <PageIntro
        eyebrow="Insights"
        title="Insights & Intelligence Dashboard"
        description="Read-only corpus intelligence for executive visibility, workforce planning, and talent supply decisions."
        actions={
          <button className="button button--secondary" type="button" onClick={refreshInsights}>
            <RefreshCw size={16} />
            Refresh
          </button>
        }
      />

      <div className="insights-tabs" role="tablist" aria-label="Insights dashboard tabs">
        {INSIGHTS_TABS.map((tab) => (
          <button
            key={tab.id}
            id={`insights-${tab.id}`}
            className={cn("insights-tab", activeTab === tab.id && "insights-tab--active")}
            type="button"
            role="tab"
            aria-controls={`insights-panel-${tab.id}`}
            aria-selected={activeTab === tab.id}
            onClick={() => selectTab(tab.id)}
          >
            <strong>{tab.label}</strong>
            <span>{tab.detail}</span>
          </button>
        ))}
      </div>

      {activeTab === "tab1" ? (
        <div id="insights-panel-tab1" className="insights-tab-panel" role="tabpanel" aria-labelledby="insights-tab1">
          <div className="stats-grid">
            {snapshot.metrics.map((metric) => (
              <MetricCard key={metric.key} metric={metric} />
            ))}
          </div>

          <div className="two-column-grid">
            <Panel className="table-card">
              <div className="panel-heading-row">
                <div>
                  <Tag tone="primary">Corpus mix</Tag>
                  <h3>Profiles by seniority</h3>
                </div>
                <BarChart3 size={18} />
              </div>
              <DistributionBars items={snapshot.profilesBySeniority} />
            </Panel>

            <Panel className="table-card">
              <div className="panel-heading-row">
                <div>
                  <Tag tone="primary">Geo coverage</Tag>
                  <h3>Profiles by location</h3>
                </div>
                <Search size={18} />
              </div>
              <DistributionBars items={snapshot.profilesByLocation} />
            </Panel>
          </div>

          <Panel className="table-card">
            <div className="panel-heading-row">
              <div>
                <Tag tone="success">Production taxonomy</Tag>
                <h3>Job family distribution</h3>
              </div>
              <div className="segmented-control" role="tablist" aria-label="Job family visualization">
                {[
                  ["donut", PieChart],
                  ["treemap", Grid2X2],
                  ["table", Table2],
                ].map(([view, Icon]) => (
                  <button
                    key={String(view)}
                    className={cn(jobFamilyView === view && "segmented-control__item--active")}
                    type="button"
                    onClick={() => setJobFamilyView(view as JobFamilyView)}
                    aria-label={`${view} view`}
                  >
                    <Icon size={16} />
                  </button>
                ))}
              </div>
            </div>

            {jobFamilyView === "donut" ? <JobFamilyDonut items={snapshot.jobFamilies} onDrilldown={drillIntoJobFamily} /> : null}
            {jobFamilyView === "treemap" ? <JobFamilyTreemap items={snapshot.jobFamilies} onDrilldown={drillIntoJobFamily} /> : null}
            {jobFamilyView === "table" ? (
              <div className="responsive-table">
                <button className="button button--secondary table-export" type="button" onClick={() => exportJobFamilies(snapshot.jobFamilies)}>
                  <Download size={16} />
                  CSV
                </button>
                <table>
                  <thead>
                    <tr>
                      <th>Job family</th>
                      <th>Profiles</th>
                      <th>Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshot.jobFamilies.map((item) => (
                      <tr key={item.label} onClick={() => drillIntoJobFamily(item.label)}>
                        <td>{item.label}</td>
                        <td>{formatNumber(item.value)}</td>
                        <td>{item.percent ?? 0}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </Panel>

          <Panel className="table-card">
            <div className="panel-heading-row">
              <div>
                <Tag tone="primary">Seniority pyramid</Tag>
                <h3>Job family by seniority</h3>
              </div>
            </div>
            <div className="pyramid-table">
              {snapshot.seniorityPyramid.map((row) => {
                const total = Math.max(1, row.junior + row.mid + row.senior + row.lead + row.executive);
                return (
                  <div className="pyramid-row" key={row.jobFamily}>
                    <strong>{row.jobFamily}</strong>
                    <div className="pyramid-stack" aria-label={`${row.jobFamily} seniority split`}>
                      <span style={{ width: `${(row.junior / total) * 100}%` }}>Junior</span>
                      <span style={{ width: `${(row.mid / total) * 100}%` }}>Mid</span>
                      <span style={{ width: `${(row.senior / total) * 100}%` }}>Senior</span>
                      <span style={{ width: `${(row.lead / total) * 100}%` }}>Lead</span>
                      <span style={{ width: `${(row.executive / total) * 100}%` }}>Exec</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </Panel>
        </div>
      ) : null}

      {activeTab === "tab2" ? (
        <div id="insights-panel-tab2" className="insights-tab-panel" role="tabpanel" aria-labelledby="insights-tab2">
          <Panel className="table-card">
            <div className="panel-heading-row">
              <div>
                <Tag tone="warning">Skills</Tag>
                <h3>Top skills frequency</h3>
              </div>
              <div className="insights-control-row">
                <label className="compact-field">
                  Top N
                  <input
                    min={10}
                    max={200}
                    type="number"
                    value={topSkillsDraft}
                    onChange={(event) => setTopSkillsDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        applyTopSkills();
                      }
                    }}
                  />
                </label>
                <button className="button button--secondary button--compact" type="button" onClick={applyTopSkills}>
                  Apply
                </button>
              </div>
            </div>
            <SkillsBars items={visibleSkills} />
          </Panel>
        </div>
      ) : null}

      {activeTab === "tab3" ? (
        <div id="insights-panel-tab3" className="insights-tab-panel" role="tabpanel" aria-labelledby="insights-tab3">
          <Panel className="table-card">
            <div className="panel-heading-row">
              <div>
                <Tag tone="warning">Gap engine</Tag>
                <h3>Skills gap analysis</h3>
              </div>
              {gapAnalysisQuery.isFetching ? <Tag tone="primary">Analyzing</Tag> : null}
            </div>
            {gapUseCases.length ? (
              <div className="gap-use-cases" aria-label="Gap analysis use cases">
                {gapUseCases.map((useCase) => (
                  <button key={useCase.id} className="gap-use-case" type="button" onClick={() => runGapUseCase(useCase.query)}>
                    <span className="gap-use-case__icon">
                      {useCase.id === "training-cohort" || useCase.id === "funding-evidence" ? <Lightbulb size={17} /> : <Target size={17} />}
                    </span>
                    <strong>{useCase.title}</strong>
                    <span>{useCase.detail}</span>
                    <em>{useCase.skills.slice(0, 3).join(" + ")}</em>
                  </button>
                ))}
              </div>
            ) : null}
            <form
              className="gap-form"
              onSubmit={(event) => {
                event.preventDefault();
                applyGapAnalysis();
              }}
            >
              <div className="gap-form__controls">
                <input
                  value={gapDraft}
                  onChange={(event) => setGapDraft(event.target.value)}
                  aria-label="Target role or skill requirement"
                  placeholder="e.g. React and React Native"
                />
                <button className="button button--secondary" type="submit" disabled={gapAnalysisQuery.isFetching}>
                  Analyze
                </button>
              </div>
              <div className="gap-requirements">
                <span>Detected requirements</span>
                {displayedGapSkills.length ? (
                  <div className="skill-list">
                    {displayedGapSkills.map((skill) => (
                      <Tag key={skill}>{skill}</Tag>
                    ))}
                  </div>
                ) : (
                  <p className="gap-requirements__empty">
                    {hasUnresolvedDraftSkills ? "Will resolve against the full Supabase skill catalog on analyze." : "No skills detected yet."}
                  </p>
                )}
              </div>
            </form>
            <div className="gap-verdict">
              <div>
                <Tag tone={gapVerdict.tone}>Decision signal</Tag>
                <h4>{gapVerdict.title}</h4>
                <p>{gapVerdict.detail}</p>
              </div>
              <button className="button button--secondary" type="button" onClick={exploreGapMatches} disabled={!activeGapAnalysis.targetSkills.length}>
                <Search size={16} />
                Explore matches
                <ArrowRight size={15} />
              </button>
            </div>
            <div className="gap-coverage" aria-label="Candidate requirement coverage">
              <div className="gap-coverage__header">
                <span>Reachable supply</span>
                <strong>{formatPercent(reachableCoveragePercent)}</strong>
              </div>
              <div className="gap-coverage__bar">
                <span className="gap-coverage__full" style={{ width: `${fullCoveragePercent}%` }} />
                <span className="gap-coverage__partial" style={{ width: `${partialCoveragePercent}%` }} />
                <span className="gap-coverage__zero" style={{ width: `${zeroCoveragePercent}%` }} />
              </div>
              <div className="gap-coverage__legend">
                <span><i className="gap-coverage__dot gap-coverage__dot--full" /> Full</span>
                <span><i className="gap-coverage__dot gap-coverage__dot--partial" /> Partial</span>
                <span><i className="gap-coverage__dot gap-coverage__dot--zero" /> Zero</span>
              </div>
            </div>
            <div className="gap-grid">
              <div><strong>{formatNumber(activeGapAnalysis.fullyMatchingCandidates)}</strong><span>Full matches</span></div>
              <div><strong>{formatNumber(activeGapAnalysis.partiallyMatchingCandidates)}</strong><span>Partial matches</span></div>
              <div><strong>{formatNumber(activeGapAnalysis.zeroMatchCandidates)}</strong><span>Zero matches</span></div>
            </div>
            <div className="missing-skills">
              <div className="gap-section-heading">
                <strong>Upskilling opportunities</strong>
                <span>Most absent skills among partial profiles</span>
              </div>
              {activeGapAnalysis.missingSkills.length ? (
                activeGapAnalysis.missingSkills.map((item) => (
                  <div key={item.skill} className="signal-row missing-skill-row">
                    <strong>{item.skill}</strong>
                    <span>{formatNumber(item.missingFromPartialCandidates)} missing</span>
                  </div>
                ))
              ) : (
                <p className="gap-requirements__empty">No missing-skill pattern yet.</p>
              )}
            </div>
          </Panel>
        </div>
      ) : null}
    </div>
  );
}
