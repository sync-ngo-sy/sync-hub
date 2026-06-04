import { useMemo } from "react";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { PlatformScopeControl } from "@/components/PlatformScopeControl";
import { EmptyState, PageIntro } from "@/components/ui";
import { SearchSimulatorControls } from "@/features/search-configuration/components/SearchSimulatorControls";
import { SearchSimulatorResponseViews } from "@/features/search-configuration/components/SearchSimulatorResponseViews";
import { SearchSimulatorTimeline } from "@/features/search-configuration/components/SearchSimulatorTimeline";
import { useSearchSimulator } from "@/features/search-configuration/hooks/useSearchSimulator";
import { useAuth } from "@/lib/auth";
import { usePlatformScope } from "@/lib/platformScope";

export function SearchConfigurationPage() {
  const { isAdmin } = useAuth();
  const {
    currentWorkspace,
    isPlatformAdmin,
    resolvedTenantIds,
    scopeMode,
    setScopeMode,
    setWorkspaceId,
    workspaceOptions,
  } = usePlatformScope();
  const workspaceNameById = useMemo(
    () => new Map(workspaceOptions.map((workspace) => [workspace.id, workspace.name])),
    [workspaceOptions],
  );
  const simulator = useSearchSimulator({ resolvedTenantIds });

  if (!isAdmin) {
    return (
      <div className="page-stack">
        <EmptyState title="Admin only" detail="Search simulation is restricted to platform admins because it exposes raw ranking diagnostics and request internals." />
      </div>
    );
  }

  return (
    <div className="page-stack">
      <PageIntro
        eyebrow="Operator diagnostics"
        title="Search Simulator"
        description="Run the live search stack with exact request internals, resolved intent, embedding diagnostics, and raw ranked items. This page is for debugging retrieval quality, not recruiter-facing search."
        actions={
          <Link className="button button--secondary" to="/search">
            Launch Search
            <ArrowRight size={14} />
          </Link>
        }
      />

      <PlatformScopeControl
        isPlatformAdmin={isPlatformAdmin}
        scopeMode={scopeMode}
        onChangeScopeMode={setScopeMode}
        currentWorkspace={currentWorkspace}
        workspaceOptions={workspaceOptions}
        onChangeWorkspace={setWorkspaceId}
      />

      <div className="simulator-layout">
        <SearchSimulatorControls
          error={simulator.error}
          filterOptions={simulator.filterOptions}
          loading={simulator.loading}
          location={simulator.location}
          minYears={simulator.minYears}
          query={simulator.query}
          selectedCompanies={simulator.selectedCompanies}
          selectedSkills={simulator.selectedSkills}
          seniority={simulator.seniority}
          onChangeLocation={simulator.setLocation}
          onChangeMinYears={simulator.setMinYears}
          onChangeQuery={simulator.setQuery}
          onChangeSelectedCompanies={simulator.setSelectedCompanies}
          onChangeSelectedSkills={simulator.setSelectedSkills}
          onChangeSeniority={simulator.setSeniority}
          onReset={simulator.resetSimulation}
          onRun={simulator.runSimulation}
        />

        <SearchSimulatorTimeline
          activeStage={simulator.activeStage}
          completedCount={simulator.completedCount}
          loading={simulator.loading}
          stageNarrative={simulator.stageNarrative}
        />
      </div>

      {!simulator.response && !simulator.loading ? (
        <EmptyState
          title="No simulation run yet"
          detail="Run a search to inspect the exact request payload, resolved intent, embedding metadata, and raw ranked results."
        />
      ) : null}

      {simulator.response ? (
        <SearchSimulatorResponseViews
          activeView={simulator.activeView}
          response={simulator.response}
          workspaceNameById={workspaceNameById}
          onChangeView={simulator.setActiveView}
        />
      ) : null}
    </div>
  );
}
