import { RefreshCw } from "lucide-react";
import { EmptyState, Panel } from "@/components/ui";
import { CandidateListFiltersPanel } from "@/features/candidates/components/CandidateListFiltersPanel";
import { CandidateListPageHeader } from "@/features/candidates/components/CandidateListPageHeader";
import { CandidateListResultsPanel } from "@/features/candidates/components/CandidateListResultsPanel";
import { CandidateListSkeleton } from "@/features/candidates/components/CandidateListSkeleton";
import { useCandidateListData } from "@/features/candidates/hooks/useCandidateListData";
import { useCandidateListUrlState } from "@/features/candidates/hooks/useCandidateListUrlState";
import { usePlatformScope } from "@/lib/platformScope";

export function CandidateListingPage() {
  const {
    currentWorkspace,
    isAllScope,
    isPlatformAdmin,
    resolvedTenantIds,
    scopeMode,
    setScopeMode,
    setWorkspaceId,
    workspaceOptions,
  } = usePlatformScope();

  const {
    filters,
    pageSize,
    pageIndex,
    queryInput,
    setQueryInput,
    updateParams,
    clearFilters,
  } = useCandidateListUrlState();

  const {
    listQuery,
    response,
    items,
    totalItems,
    totalPages,
    safePageIndex,
    pageStart,
    pageEnd,
    activeFilters,
    groupedSections,
  } = useCandidateListData({
    resolvedTenantIds,
    filters,
    pageSize,
    pageIndex,
  });

  const showWorkspaceColumn = isPlatformAdmin && isAllScope;

  return (
    <div className="page-stack candidate-list-page">
      <CandidateListPageHeader
        isPlatformAdmin={isPlatformAdmin}
        scopeMode={scopeMode}
        currentWorkspace={currentWorkspace}
        workspaceOptions={workspaceOptions}
        onChangeScopeMode={setScopeMode}
        onChangeWorkspace={setWorkspaceId}
      />

      <CandidateListFiltersPanel
        filters={filters}
        queryInput={queryInput}
        filterOptions={response?.filterOptions}
        activeFilters={activeFilters}
        onQueryInputChange={setQueryInput}
        onUpdateParams={updateParams}
        onClearFilters={clearFilters}
      />

      {listQuery.isError ? (
        <Panel className="table-card">
          <EmptyState
            title="Unable to load candidates"
            detail={listQuery.error instanceof Error ? listQuery.error.message : "The candidate list request failed."}
            action={
              <button className="button button--secondary" type="button" onClick={() => listQuery.refetch()}>
                <RefreshCw size={14} />
                Retry
              </button>
            }
          />
        </Panel>
      ) : listQuery.isLoading && !response ? (
        <CandidateListSkeleton />
      ) : (
        <CandidateListResultsPanel
          filters={filters}
          items={items}
          groupedSections={groupedSections}
          groups={response?.groups}
          totalItems={totalItems}
          totalPages={totalPages}
          safePageIndex={safePageIndex}
          pageStart={pageStart}
          pageEnd={pageEnd}
          pageSize={pageSize}
          activeFilters={activeFilters}
          isFetching={listQuery.isFetching}
          showWorkspaceColumn={showWorkspaceColumn}
          onUpdateParams={updateParams}
          onClearFilters={clearFilters}
        />
      )}
    </div>
  );
}
