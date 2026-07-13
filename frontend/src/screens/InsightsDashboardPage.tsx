// frontend/src/screens/InsightsDashboardPage.tsx
import { useEffect, useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import { Panel } from "@/components/ui";
import { InsightsAiBriefTab } from "@/features/insights/components/InsightsAiBriefTab";
import { InsightsGapTab } from "@/features/insights/components/InsightsGapTab";
import { InsightsOverviewTab } from "@/features/insights/components/InsightsOverviewTab";
import { InsightsSkillsTab } from "@/features/insights/components/InsightsSkillsTab";
import { InsightsTabs } from "@/features/insights/components/InsightsTabs";
import {
  PAGE_SIZE,
  SEARCH_STATE_STORAGE_KEY,
  buildGapUseCases,
  clampTopSkills,
  normalizeInsightsTab,
  openInsightsSearchWithSkills,
  writeInsightsAiBriefHandoff,
  type InsightsTab,
  type JobFamilyView,
} from "@/features/insights/insightsDashboard.helpers";
import { useAuth } from "@/lib/auth";
import { extractGapSkillRequirements } from "@/lib/insightsGap";
import { platformApi } from "@/lib/platformApi";

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
    queryKey: ["insights-dashboard", tenantIds.join("|"), appliedTopSkills],
    queryFn: () => platformApi.getInsightsDashboard({ topSkills: appliedTopSkills }, tenantIds),
  });
  const snapshot = insightsQuery.data;
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
    queryKey: ["insights-gap-analysis", tenantIds.join("|"), appliedGapInput, appliedTargetSkills.join("|")],
    queryFn: () =>
      platformApi.getInsightsGapAnalysis(
        {
          targetRole: appliedGapInput,
          targetSkills: appliedTargetSkills,
        },
        tenantIds,
      ),
    enabled: activeTab === "tab3" && Boolean(snapshot),
    placeholderData: keepPreviousData,
  });
  const visibleSkills = useMemo(() => snapshot?.skillsFrequency ?? [], [snapshot?.skillsFrequency]);

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

  function openGapAiBrief() {
    writeInsightsAiBriefHandoff({
      reportType: "gap_brief",
      focus: appliedGapInput,
      targetSkills: activeGapAnalysis.targetSkills.length ? activeGapAnalysis.targetSkills : appliedTargetSkills,
    });
    selectTab("tab4");
  }

  return (
    <div className="page-stack insights-page">

      <InsightsTabs activeTab={activeTab} onSelectTab={selectTab} />

      {activeTab === "tab1" ? (
        <InsightsOverviewTab
          snapshot={snapshot}
          jobFamilyView={jobFamilyView}
          onChangeJobFamilyView={setJobFamilyView}
          onDrilldownJobFamily={drillIntoJobFamily}
        />
      ) : null}

      {activeTab === "tab2" ? (
        <InsightsSkillsTab
          topSkillsDraft={topSkillsDraft}
          visibleSkills={visibleSkills}
          onApplyTopSkills={applyTopSkills}
          onTopSkillsDraftChange={setTopSkillsDraft}
        />
      ) : null}

      {activeTab === "tab3" ? (
        <InsightsGapTab
          canExploreMatches={Boolean(activeGapAnalysis.targetSkills.length)}
          displayedGapSkills={displayedGapSkills}
          gapAnalysis={activeGapAnalysis}
          gapDraft={gapDraft}
          gapUseCases={gapUseCases}
          hasUnresolvedDraftSkills={hasUnresolvedDraftSkills}
          isFetching={gapAnalysisQuery.isFetching}
          onApplyGapAnalysis={applyGapAnalysis}
          onExploreMatches={exploreGapMatches}
          onGapDraftChange={setGapDraft}
          onGenerateAiBrief={openGapAiBrief}
          onRunGapUseCase={runGapUseCase}
        />
      ) : null}

      {activeTab === "tab4" ? (
        <InsightsAiBriefTab
          gapAnalysis={activeGapAnalysis}
          onOpenSearch={(skills, query) => {
            openInsightsSearchWithSkills(skills, query);
            navigate("/search");
          }}
          snapshot={snapshot}
          tenantIds={tenantIds}
        />
      ) : null}
    </div>
  );
}
