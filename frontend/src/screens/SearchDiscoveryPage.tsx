import { useEffect, useMemo, useRef, useState } from "react";
import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { CandidatePreviewDrawer } from "@/features/search/components/CandidatePreviewDrawer";
import { CandidateResultCard } from "@/features/search/components/CandidateResultCard";
import { InfiniteSearchStatus } from "@/features/search/components/InfiniteSearchStatus";
import { SearchCommandPanel } from "@/features/search/components/SearchCommandPanel";
import { SearchPageHeader } from "@/features/search/components/SearchPageHeader";
import { SearchSummaryBar } from "@/features/search/components/SearchSummaryBar";
import { ShortlistDrawer } from "@/features/search/components/ShortlistDrawer";
import { ShortlistTray } from "@/features/search/components/ShortlistTray";
import { WorkspaceStatsStrip } from "@/features/search/components/WorkspaceStatsStrip";
import { useCandidateShortlist } from "@/features/search/hooks/useCandidateShortlist";
import { buildChatHref } from "@/lib/chatAgent";
import type { CandidateSearchResult, SearchFilters, SearchResponse } from "@/lib/contracts";
import { useAuth } from "@/lib/auth";
import { platformApi } from "@/lib/platformApi";
import { usePlatformScope } from "@/lib/platformScope";
import { deriveSearchFilters } from "@/lib/queryIntent";
import { EmptyState } from "@/components/ui";
import {
  PAGE_SIZE,
  type SearchRequest,
  type SearchSortOption,
  downloadCsv,
  readStoredSearchState,
  shortlistKey,
  writeStoredSearchState,
} from "@/features/search/searchState";
import {
  SearchProcessingState,
} from "@/screens/SearchDiscoveryPage.helpers";

export function SearchDiscoveryPage() {
  const { currentTenant } = useAuth();
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
  const workspaceNameById = useMemo(
    () => new Map(workspaceOptions.map((workspace) => [workspace.id, workspace.name])),
    [workspaceOptions],
  );
  const [initialSearchState] = useState(readStoredSearchState);
  const queryInputRef = useRef<HTMLInputElement | null>(null);
  const intentAppliedKeyRef = useRef<string | null>(null);
  const [query, setQuery] = useState(initialSearchState.request?.query ?? "");
  const [seniority, setSeniority] = useState(initialSearchState.request?.filters.seniority ?? "");
  const [minYears, setMinYears] = useState(initialSearchState.request?.filters.minYearsExperience ?? 0);
  const [location, setLocation] = useState(initialSearchState.request?.filters.location ?? "");
  const [selectedSkills, setSelectedSkills] = useState<string[]>(initialSearchState.request?.filters.skills ?? []);
  const [selectedCompanies, setSelectedCompanies] = useState<string[]>(initialSearchState.request?.filters.companies ?? []);
  const [sortBy, setSortBy] = useState<SearchSortOption>(initialSearchState.sortBy);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [previewCandidate, setPreviewCandidate] = useState<CandidateSearchResult | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [request, setRequest] = useState<SearchRequest | null>(initialSearchState.request);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const scopeKey = resolvedTenantIds.join("|");
  const filterOptionsQuery = useQuery({
    queryKey: ["search-filter-options", scopeKey],
    queryFn: () => platformApi.getSearchFilterOptions(resolvedTenantIds),
    placeholderData: keepPreviousData,
    staleTime: 10 * 60 * 1000,
  });
  const workspaceStatsQuery = useQuery({
    queryKey: ["workspace-stats", scopeKey],
    queryFn: () => platformApi.getWorkspaceStats(resolvedTenantIds),
    placeholderData: keepPreviousData,
    staleTime: 5 * 60 * 1000,
  });
  const searchResultsQuery = useInfiniteQuery({
    queryKey: ["search-results", scopeKey, request?.query ?? "", request?.limit ?? PAGE_SIZE, request?.filters ?? {}],
    queryFn: ({ pageParam }) => {
      if (!request) {
        throw new Error("Search request is not ready.");
      }
      return platformApi.search(request.query, request.filters, {
        offset: Number(pageParam),
        limit: request.limit,
      }, resolvedTenantIds);
    },
    initialPageParam: 0,
    enabled: Boolean(request),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    staleTime: 10 * 60 * 1000,
    gcTime: 45 * 60 * 1000,
    refetchOnMount: false,
  });
  const response = useMemo<SearchResponse | null>(() => {
    const pages = searchResultsQuery.data?.pages ?? [];
    if (!pages.length) {
      return null;
    }

    const seenIds = new Set<string>();
    const results = pages.flatMap((page) =>
      page.results.filter((candidate) => {
        if (seenIds.has(candidate.candidateId)) {
          return false;
        }
        seenIds.add(candidate.candidateId);
        return true;
      }),
    );
    const firstPage = pages[0];
    const lastPage = pages[pages.length - 1];

    return {
      ...lastPage,
      results,
      nextCursor: lastPage.nextCursor,
      meta: {
        ...lastPage.meta,
        intent: firstPage.meta.intent ?? lastPage.meta.intent,
        intentSource: firstPage.meta.intentSource ?? lastPage.meta.intentSource,
        count: results.length,
      },
    };
  }, [searchResultsQuery.data]);
  const loadingInitial = searchResultsQuery.isLoading && !response;
  const loadingMore = searchResultsQuery.isFetchingNextPage;
  const searchError = searchResultsQuery.error ? String(searchResultsQuery.error.message || searchResultsQuery.error) : null;
  const error = formError ?? searchError;
  const filterOptions = filterOptionsQuery.data ?? null;
  const workspaceStats = workspaceStatsQuery.data ?? null;
  const loadingWorkspaceStats = workspaceStatsQuery.isLoading && !workspaceStats;
  const shortlist = useCandidateShortlist({
    currentTenant,
    currentWorkspace,
    draftQuery: query,
    requestQuery: request?.query,
    resolvedTenantIds,
    scopeKey,
  });
  const shortlistItems = shortlist.items;
  const hasExecutedSearch = request !== null;
  const sortedResults = useMemo(() => {
  const results = response?.results ?? [];

  switch (sortBy) {
    case "experience-desc":
      return [...results].sort(
        (left, right) =>
          (right.yearsExperience ?? 0) - (left.yearsExperience ?? 0) ||
          right.matchScore - left.matchScore,
      );

    case "experience-asc":
      return [...results].sort(
        (left, right) =>
          (left.yearsExperience ?? 0) - (right.yearsExperience ?? 0),
      );

    case "name-asc":
  return [...results].sort(
    (left, right) => left.name.localeCompare(right.name)
  );

    case "name-desc":
      return [...results].sort((left, right) =>
        right.name.localeCompare(left.name),
      );

    case "best-match":
    default:
      return results;
  }
}, [response?.results, sortBy]);

  useEffect(() => {
    setPreviewCandidate(null);
  }, [scopeKey]);

  useEffect(() => {
    writeStoredSearchState(request, sortBy);
  }, [request, sortBy]);

  useEffect(() => {
    const intent = searchResultsQuery.data?.pages[0]?.meta.intent;
    if (!request || !intent) {
      return;
    }

    const intentKey = `${scopeKey}:${request.query}:${JSON.stringify(request.filters)}`;
    if (intentAppliedKeyRef.current === intentKey) {
      return;
    }

    intentAppliedKeyRef.current = intentKey;
    setSeniority(intent.seniority ?? "");
    setMinYears(intent.minYearsExperience ?? 0);
    setLocation(intent.location ?? "");
    setSelectedSkills(intent.skills ?? []);
    setSelectedCompanies(intent.companies ?? []);
  }, [request, scopeKey, searchResultsQuery.dataUpdatedAt]);

  useEffect(() => {
    if (!response?.nextCursor || loadingInitial || loadingMore || error || !searchResultsQuery.hasNextPage) {
      return;
    }

    const sentinel = loadMoreRef.current;
    if (!sentinel) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting || !request || response.nextCursor === null) {
          return;
        }

        void searchResultsQuery.fetchNextPage();
      },
      {
        rootMargin: "320px 0px",
      },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [error, loadingInitial, loadingMore, request, response?.nextCursor, searchResultsQuery.fetchNextPage, searchResultsQuery.hasNextPage]);

  function handleExecute() {
    const normalizedQuery = query.trim();
    const hasStructuredInput = Boolean(seniority || minYears > 0 || location.trim() || selectedSkills.length || selectedCompanies.length);
    if (!normalizedQuery && !hasStructuredInput) {
      setFormError("Enter a title, skill, or filter to start searching.");
      return;
    }

    const explicitFilters: SearchFilters = {
      seniority: seniority as SearchFilters["seniority"],
      minYearsExperience: minYears,
      location,
      skills: selectedSkills,
      companies: selectedCompanies,
    };
    const normalizedFilters = deriveSearchFilters(normalizedQuery, explicitFilters);

    setSeniority(normalizedFilters.seniority ?? "");
    setMinYears(normalizedFilters.minYearsExperience ?? 0);
    setLocation(normalizedFilters.location ?? "");
    setSelectedSkills(normalizedFilters.skills ?? []);
    setSelectedCompanies(normalizedFilters.companies ?? []);

    setFormError(null);
    setRequest({
      query: normalizedQuery,
      filters: normalizedFilters,
      offset: 0,
      limit: PAGE_SIZE,
    });
  }

  const activeFilterCount =
    (seniority ? 1 : 0) +
    (minYears > 0 ? 1 : 0) +
    (location.trim() ? 1 : 0) +
    selectedSkills.length +
    selectedCompanies.length;

  function handleClearFilters() {
    setSeniority("");
    setMinYears(0);
    setLocation("");
    setSelectedSkills([]);
    setSelectedCompanies([]);
  }

  function handleExportShortlist() {
    if (!shortlistItems.length) {
      return;
    }

    const rows = [
      ["Name", "Title", "Location", "Years Experience", "Seniority", "Primary Role", "Match Rate", "Top Skills", "CV URL", "Source Query", "Dossier URL"],
      ...shortlistItems.map((item) => [
        item.candidateName,
        item.currentTitle,
        item.location,
        item.yearsExperience ?? "",
        item.seniority ?? "",
        item.primaryRole ?? "",
        item.matchRate === null ? "" : `${item.matchRate}%`,
        item.topSkills,
        item.cvUrl ?? "",
        item.sourceQuery,
        `${window.location.origin}/dossier/${item.candidateId}`,
      ]),
    ];

    downloadCsv(`candidate-shortlist-${new Date().toISOString().slice(0, 10)}.csv`, rows);
  }

  const topCompareHref =
    response && sortedResults.length >= 2
      ? `/compare?ids=${sortedResults
          .slice(0, 2)
          .map((candidate) => candidate.candidateId)
          .join(",")}`
      : null;
  const topChatHref =
    response && sortedResults.length
      ? buildChatHref(
          sortedResults.slice(0, Math.min(3, sortedResults.length)).map((candidate) => candidate.candidateId),
          "Which candidate is the strongest overall fit and why?",
        )
      : null;
  const shortlistCandidateIds = shortlistItems.map((item) => item.candidateId);
  const shortlistCompareHref =
    shortlistCandidateIds.length >= 2
      ? `/compare?ids=${shortlistCandidateIds.slice(0, 8).join(",")}`
      : null;
  const shortlistChatHref =
    shortlistCandidateIds.length
      ? buildChatHref(shortlistCandidateIds.slice(0, 8), "Which candidate in my shortlist is the strongest fit and why?")
      : null;
  const previewTenantId = previewCandidate ? shortlist.resolveCandidateTenantId(previewCandidate) : null;
  const previewShortlistKey = previewCandidate && previewTenantId ? shortlistKey(previewTenantId, previewCandidate.candidateId) : "";
  const previewIsShortlisted = previewShortlistKey ? shortlist.keys.has(previewShortlistKey) : false;
  const previewShortlistPending = previewShortlistKey ? shortlist.pendingKeys.has(previewShortlistKey) : false;
  const previewPartnerId = previewCandidate
    ? sortedResults.find((candidate) => candidate.candidateId !== previewCandidate.candidateId)?.candidateId
    : null;
  return (
    <div className="page-stack search-page">
      <SearchPageHeader
        currentWorkspace={currentWorkspace}
        isPlatformAdmin={isPlatformAdmin}
        scopeMode={scopeMode}
        shortlistCount={shortlistItems.length}
        workspaceOptions={workspaceOptions}
        onChangeScopeMode={setScopeMode}
        onChangeWorkspace={setWorkspaceId}
        onOpenShortlist={() => shortlist.setDrawerOpen(true)}
      />

      <WorkspaceStatsStrip
        currentTenant={currentTenant}
        currentWorkspace={currentWorkspace}
        isAllScope={isAllScope}
        loading={loadingWorkspaceStats}
        stats={workspaceStats}
        workspaceCount={workspaceOptions.length}
      />

      <SearchCommandPanel
        activeFilterCount={activeFilterCount}
        companies={selectedCompanies}
        filterOptions={filterOptions}
        filtersOpen={filtersOpen}
        loading={loadingInitial || loadingMore}
        location={location}
        minYears={minYears}
        query={query}
        queryInputRef={queryInputRef}
        seniority={seniority}
        skills={selectedSkills}
        onClearFilters={handleClearFilters}
        onExecute={handleExecute}
        onSetCompanies={setSelectedCompanies}
        onSetFiltersOpen={setFiltersOpen}
        onSetLocation={setLocation}
        onSetMinYears={setMinYears}
        onSetQuery={setQuery}
        onSetSeniority={setSeniority}
        onSetSkills={setSelectedSkills}
      />

      <ShortlistTray
        clearing={shortlist.clearing}
        count={shortlistItems.length}
        error={shortlist.error}
        onClear={shortlist.clear}
        onExport={handleExportShortlist}
        onOpen={() => shortlist.setDrawerOpen(true)}
      />

      {shortlist.drawerOpen ? (
        <ShortlistDrawer
          chatHref={shortlistChatHref}
          clearing={shortlist.clearing}
          compareHref={shortlistCompareHref}
          error={shortlist.error}
          items={shortlistItems}
          loading={shortlist.loading}
          pendingKeys={shortlist.pendingKeys}
          onClear={shortlist.clear}
          onClose={() => shortlist.setDrawerOpen(false)}
          onExport={handleExportShortlist}
          onOpenCv={(item) => void shortlist.openCv(item)}
          onRemove={(item) => void shortlist.removeItem(item)}
        />
      ) : null}

      {previewCandidate ? (
        <CandidatePreviewDrawer
          candidate={previewCandidate}
          isShortlisted={previewIsShortlisted}
          partnerId={previewPartnerId}
          searchQuery={request?.query ?? query}
          shortlistPending={previewShortlistPending}
          tenantId={previewTenantId}
          onClose={() => setPreviewCandidate(null)}
          onToggleShortlist={(candidate) => void shortlist.toggleCandidate(candidate)}
        />
      ) : null}

      {!hasExecutedSearch ? null : loadingInitial && request ? (
        <SearchProcessingState request={request} />
      ) : error && !response?.results.length ? (
        <EmptyState title="Search failed" detail={error} />
      ) : !response?.results.length ? (
        <EmptyState
          title="No candidates found"
          detail="The search ran successfully, but there are no indexed candidates matching the current query and filters yet."
        />
      ) : (
        <>
          <SearchSummaryBar
            compareHref={topCompareHref}
            count={response.results.length}
            sortBy={sortBy}
            topChatHref={topChatHref}
            onSortChange={setSortBy}
          />

          <div className="candidate-results">
            {sortedResults.map((candidate) => {
              const partnerId = sortedResults.find((item) => item.candidateId !== candidate.candidateId)?.candidateId;
              const candidateTenantId = shortlist.resolveCandidateTenantId(candidate);
              const candidateShortlistKey = candidateTenantId ? shortlistKey(candidateTenantId, candidate.candidateId) : "";
              const isShortlisted = candidateShortlistKey ? shortlist.keys.has(candidateShortlistKey) : false;
              const shortlistPending = candidateShortlistKey ? shortlist.pendingKeys.has(candidateShortlistKey) : false;

              return (
                <CandidateResultCard
                  key={candidate.candidateId}
                  candidate={candidate}
                  candidateTenantId={candidateTenantId}
                  isShortlisted={isShortlisted}
                  partnerId={partnerId}
                  searchQuery={request?.query ?? query}
                  shortlistPending={shortlistPending}
                  workspaceLabel={isAllScope && candidate.tenantId ? workspaceNameById.get(candidate.tenantId) ?? "Workspace" : null}
                  onPreview={setPreviewCandidate}
                  onToggleShortlist={(nextCandidate) => void shortlist.toggleCandidate(nextCandidate)}
                />
              );
            })}
          </div>

          <div ref={loadMoreRef} className="infinite-scroll-sentinel">
            <InfiniteSearchStatus
              error={error}
              loadingMore={loadingMore}
              nextCursor={response.nextCursor}
              queryInputRef={queryInputRef}
              request={request}
              resultCount={response.results.length}
              onRetry={() => void searchResultsQuery.fetchNextPage()}
            />
          </div>
        </>
      )}
    </div>
  );
}
