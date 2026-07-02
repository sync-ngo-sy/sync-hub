// frontend/src/screens/search-discovery/SearchDiscoveryPage.tsx (or its current path)

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Search as SearchIcon } from "lucide-react";
import { CandidatePreviewModal } from "@/features/search/components/CandidatePreviewModal";
import { CandidateResultCard } from "@/features/search/components/CandidateResultCard";
import { CandidateResultTable } from "@/features/search/components/CandidateResultTable";
import { InfiniteSearchStatus } from "@/features/search/components/InfiniteSearchStatus";
import { SearchCommandPanel } from "@/features/search/components/SearchCommandPanel";
import { SearchPageHeader } from "@/features/search/components/SearchPageHeader";
import { ShortlistDrawer } from "@/features/search/components/ShortlistDrawer";
import { ShortlistTray } from "@/features/search/components/ShortlistTray";
import { WorkspaceStatsStrip } from "@/features/search/components/WorkspaceStatsStrip";
import { useCandidateShortlist } from "@/features/search/hooks/useCandidateShortlist";
import { FloatingSelectionBar } from "@/features/search/components/FloatingSelectionBar";
import { SelectedCandidatesModal } from "@/features/search/components/SelectedCandidatesModal";
import { ComparePickerModal } from "@/features/search/components/ComparePickerModal";
import { buildChatHref } from "@/lib/chatAgent";
import type { CandidateSearchResult, SearchFilters, SearchResponse } from "@/lib/contracts";
import { useAuth } from "@/lib/auth";
import { platformApi } from "@/lib/platformApi";
import { usePlatformScope } from "@/lib/platformScope";
import { deriveSearchFilters } from "@/lib/queryIntent";
import removeIcon from "@/assets/remove.svg";

import {
  PAGE_SIZE,
  type SearchRequest,
  type SearchSortOption,
  downloadCsv,
  readStoredSearchState,
  shortlistKey,
  writeStoredSearchState,
} from "@/features/search/searchState";
import { SearchProcessingState } from "@/screens/search-discovery/SearchDiscoveryPage.helpers";

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
  const [previewCandidate, setPreviewCandidate] = useState<CandidateSearchResult | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [request, setRequest] = useState<SearchRequest | null>(initialSearchState.request);

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isViewSelectedOpen, setIsViewSelectedOpen] = useState(false);

  // Compare picker state
  const [compareSourceCandidate, setCompareSourceCandidate] = useState<CandidateSearchResult | null>(null);

  const [viewMode, setViewMode] = useState<"card" | "list">(
    () => (localStorage.getItem("search-view-mode") as "card" | "list") || "card",
  );

  // Dual view slider
  const slideRef = useRef<HTMLDivElement>(null);
  const animTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const el = slideRef.current;
    if (!el) return;

    if (animTimerRef.current) clearTimeout(animTimerRef.current);

    const targetX = viewMode === "list" ? -50 : 0;

    el.style.transition = "transform 220ms cubic-bezier(0.4, 0, 0.2, 1)";
    el.style.transform = `translateX(${targetX}%)`;

    return () => {
      if (animTimerRef.current) clearTimeout(animTimerRef.current);
    };
  }, [viewMode]);

  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const scopeKey = useMemo(() => resolvedTenantIds.join("|"), [resolvedTenantIds]);

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

  const requestFiltersKey = useMemo(
    () => JSON.stringify(request?.filters ?? {}),
    [request?.filters],
  );

  const searchResultsQuery = useInfiniteQuery({
    queryKey: ["search-results", scopeKey, request?.query ?? "", request?.limit ?? PAGE_SIZE, requestFiltersKey],
    queryFn: ({ pageParam }) => {
      if (!request) throw new Error("Search request is not ready.");
      return platformApi.search(
        request.query,
        request.filters,
        { offset: Number(pageParam), limit: request.limit },
        resolvedTenantIds,
      );
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
    if (!pages.length) return null;

    const seenIds = new Set<string>();
    const results = pages.flatMap((page) =>
      page.results.filter((candidate) => {
        if (seenIds.has(candidate.candidateId)) return false;
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
  const searchError = searchResultsQuery.error
    ? String(searchResultsQuery.error.message || searchResultsQuery.error)
    : null;
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
          (l, r) => (r.yearsExperience ?? 0) - (l.yearsExperience ?? 0) || r.matchScore - l.matchScore,
        );
      case "experience-asc":
        return [...results].sort(
          (l, r) => (l.yearsExperience ?? 0) - (r.yearsExperience ?? 0),
        );
      case "name-asc":
        return [...results].sort((l, r) => l.name.localeCompare(r.name));
      case "name-desc":
        return [...results].sort((l, r) => r.name.localeCompare(l.name));
      case "best-match":
      default:
        return results;
    }
  }, [response?.results, sortBy]);

  useEffect(() => {
    setPreviewCandidate(null);
    setCompareSourceCandidate(null);
  }, [scopeKey]);

  useEffect(() => {
    writeStoredSearchState(request, sortBy);
  }, [request, sortBy]);

  const requestKey = useMemo(
    () => (request ? `${request.query}::${JSON.stringify(request.filters)}` : null),
    [request],
  );

  const dataUpdatedAt = searchResultsQuery.dataUpdatedAt;
  useEffect(() => {
    const intent = searchResultsQuery.data?.pages[0]?.meta.intent;
    if (!requestKey || !intent) return;

    const intentKey = `${scopeKey}:${requestKey}`;
    if (intentAppliedKeyRef.current === intentKey) return;

    intentAppliedKeyRef.current = intentKey;
    setSeniority(intent.seniority ?? "");
    setMinYears(intent.minYearsExperience ?? 0);
    setLocation(intent.location ?? "");
    setSelectedSkills(intent.skills ?? []);
    setSelectedCompanies(intent.companies ?? []);
  }, [
    requestKey,
    scopeKey,
    dataUpdatedAt,
    searchResultsQuery.data,
    setSeniority,
    setMinYears,
    setLocation,
    setSelectedSkills,
    setSelectedCompanies,
  ]);

  const fetchNextPage = searchResultsQuery.fetchNextPage;
  const hasNextPage = searchResultsQuery.hasNextPage;
  const nextCursor = response?.nextCursor;

  useEffect(() => {
    if (!nextCursor || loadingInitial || loadingMore || error || !hasNextPage) return;

    const sentinel = loadMoreRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting || !request || nextCursor === null) return;
        void fetchNextPage();
      },
      { rootMargin: "320px 0px" },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [error, loadingInitial, loadingMore, request, nextCursor, fetchNextPage, hasNextPage]);

  const handleExecute = useCallback(() => {
    const normalizedQuery = query.trim();
    const hasStructuredInput = Boolean(
      seniority || minYears > 0 || location.trim() || selectedSkills.length || selectedCompanies.length,
    );

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
    setSelectedIds(new Set());
    setCompareSourceCandidate(null);
    setRequest({
      query: normalizedQuery,
      filters: normalizedFilters,
      offset: 0,
      limit: PAGE_SIZE,
    });
  }, [
    query,
    seniority,
    minYears,
    location,
    selectedSkills,
    selectedCompanies,
  ]);

  const handleExportShortlist = useCallback(() => {
    if (!shortlistItems.length) return;
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
  }, [shortlistItems]);

  const topCompareHref = useMemo(() =>
      response && sortedResults.length >= 2
        ? `/compare?ids=${sortedResults.slice(0, 2).map((c) => c.candidateId).join(",")}`
        : null,
    [response, sortedResults],
  );

  const topChatHref = useMemo(() =>
      response && sortedResults.length
        ? buildChatHref(
          sortedResults.slice(0, Math.min(3, sortedResults.length)).map((c) => c.candidateId),
          "Which candidate is the strongest overall fit and why?",
        )
        : null,
    [response, sortedResults],
  );

  const shortlistCandidateIds = useMemo(() =>
      shortlistItems.map((item) => item.candidateId),
    [shortlistItems],
  );

  const shortlistCompareHref = useMemo(() =>
      shortlistCandidateIds.length >= 2
        ? `/compare?ids=${shortlistCandidateIds.slice(0, 8).join(",")}`
        : null,
    [shortlistCandidateIds],
  );

  const shortlistChatHref = useMemo(() =>
      shortlistCandidateIds.length
        ? buildChatHref(
          shortlistCandidateIds.slice(0, 8),
          "Which candidate in my shortlist is the strongest fit and why?",
        )
        : null,
    [shortlistCandidateIds],
  );

  const previewTenantId = useMemo(() =>
      previewCandidate ? shortlist.resolveCandidateTenantId(previewCandidate) : null,
    [previewCandidate, shortlist],
  );

  const previewShortlistKey = useMemo(() =>
      previewCandidate && previewTenantId
        ? shortlistKey(previewTenantId, previewCandidate.candidateId)
        : "",
    [previewCandidate, previewTenantId],
  );

  const previewIsShortlisted = useMemo(() =>
      previewShortlistKey ? shortlist.keys.has(previewShortlistKey) : false,
    [previewShortlistKey, shortlist.keys],
  );

  const previewShortlistPending = useMemo(() =>
      previewShortlistKey ? shortlist.pendingKeys.has(previewShortlistKey) : false,
    [previewShortlistKey, shortlist.pendingKeys],
  );

  const handleToggleCardSelect = useCallback((candidate: CandidateSearchResult) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(candidate.candidateId)) {
        next.delete(candidate.candidateId);
      } else {
        if (next.size >= 3) return prev;
        next.add(candidate.candidateId);
      }
      return next;
    });
  }, []);

  const selectedCandidateObjects = useMemo(() => {
    const results = response?.results ?? [];
    return results.filter((candidate) => selectedIds.has(candidate.candidateId));
  }, [response?.results, selectedIds]);

  const hasResults = useMemo(
    () => Boolean(response && response.results.length > 0),
    [response],
  );

  const handleFocusSearchInput = useCallback(() => {
    queryInputRef.current?.focus();
    queryInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  return (
    <div className="page-stack mt-[-30px]">
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
        companies={selectedCompanies}
        filterOptions={filterOptions}
        loading={loadingInitial || loadingMore}
        location={location}
        minYears={minYears}
        query={query}
        queryInputRef={queryInputRef}
        seniority={seniority}
        skills={selectedSkills}
        onExecute={handleExecute}
        onSetCompanies={setSelectedCompanies}
        onSetLocation={setLocation}
        onSetMinYears={setMinYears}
        onSetQuery={setQuery}
        onSetSeniority={setSeniority}
        onSetSkills={setSelectedSkills}
        compareHref={topCompareHref}
        count={response?.results.length ?? 0}
        sortBy={sortBy}
        topChatHref={topChatHref}
        hasResults={hasResults}
        onSortChange={setSortBy}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
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
        <CandidatePreviewModal
          candidate={previewCandidate}
          isShortlisted={previewIsShortlisted}
          searchQuery={request?.query ?? query}
          shortlistPending={previewShortlistPending}
          tenantId={previewTenantId}
          onClose={() => setPreviewCandidate(null)}
          onToggleShortlist={(candidate) => void shortlist.toggleCandidate(candidate)}
          onCompare={sortedResults.length > 1 ? () => setCompareSourceCandidate(previewCandidate) : undefined}
        />
      ) : null}

      {isViewSelectedOpen && selectedCandidateObjects.length > 0 ? (
        <SelectedCandidatesModal
          selectedCandidates={selectedCandidateObjects}
          shortlistKeys={shortlist.keys}
          shortlistPendingIds={shortlist.pendingKeys}
          resolveCandidateTenantId={shortlist.resolveCandidateTenantId}
          searchQuery={request?.query ?? query}
          onClose={() => setIsViewSelectedOpen(false)}
          onToggleSelect={(candidate) => handleToggleCardSelect(candidate)}
          onToggleShortlist={(candidate) => void shortlist.toggleCandidate(candidate)}
        />
      ) : null}

      {compareSourceCandidate ? (
        <ComparePickerModal
          sourceCandidate={compareSourceCandidate}
          otherCandidates={sortedResults.filter(
            (c) => c.candidateId !== compareSourceCandidate.candidateId,
          )}
          onClose={() => setCompareSourceCandidate(null)}
        />
      ) : null}

      {!hasExecutedSearch ? (
        // ── INITIAL EMPTY STATE ──────────────────────────────────────
        <div className="flex items-center justify-center min-h-[60vh] p-4">
          <div className="bg-[#39393a] border border-[var(--border)] rounded-[var(--radius,22px)] p-12 max-w-2xl w-full text-center flex flex-col items-center gap-6 shadow-[var(--shadow)]">
            <div className="w-16 h-16 rounded-full bg-[var(--border)] flex items-center justify-center">
              <SearchIcon size={24} className="text-[var(--text-muted)]" />
            </div>
            <h2 className="text-2xl font-bold text-[var(--text)] m-0">What Talent Are We In Need Today?</h2>
            <p className="text-[15px] text-[var(--text-muted)] m-0">
              Start by typing a job title, skill, or describe the role you're looking to fill. Our AI will surface the most relevant candidates from your workspace.
            </p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleFocusSearchInput}
                className="group px-6 h-11 rounded-full text-sm font-semibold tracking-wide outline-none border-0 bg-[var(--primary)] text-[#39393a] hover:bg-[var(--primary-strong)] hover:text-[var(--text)] cursor-pointer transition-colors duration-200 flex items-center gap-2 select-none"
              >
                <SearchIcon size={16} className="shrink-0" />
                Start Searching
              </button>
            </div>
          </div>
        </div>
      ) : loadingInitial && request ? (
        <div className="flex-1 flex items-center justify-center py-12">
          <SearchProcessingState request={request} />
        </div>
      ) : error && !response?.results.length ? (
        <div className="flex-1 flex items-center justify-center py-12">
          <div
            className="flex flex-col items-center justify-center text-center p-12 max-w-xl border border-[var(--border)]"
            style={{
              borderRadius: "var(--radius, 22px)",
              backgroundColor: "var(--bg, #39393a)",
              fontFamily: "var(--font-sans, 'Alexandria', sans-serif)",
              boxShadow: "none",
            }}
          >
            <img src={removeIcon} alt="Error icon" className="mb-4 w-12 h-12 select-none" />
            <h3 className="text-lg font-semibold mb-2 text-[var(--text)]">Search failed</h3>
            <p className="text-sm text-[var(--text-muted)] max-w-md">{error}</p>
          </div>
        </div>
      ) : !response?.results.length ? (
        <div className="flex-1 flex items-center justify-center py-12">
          <div
            className="flex flex-col items-center justify-center text-center p-12 max-w-xl border border-[var(--border)]"
            style={{
              borderRadius: "var(--radius, 22px)",
              backgroundColor: "var(--bg, #39393a)",
              fontFamily: "var(--font-sans, 'Alexandria', sans-serif)",
              boxShadow: "none",
            }}
          >
            <img
              src={removeIcon}
              alt="Empty search results icon"
              className="mb-4 w-12 h-12 select-none"
            />
            <h3 className="text-lg font-semibold mb-2 text-[var(--text)]">No candidates found</h3>
            <p className="text-sm text-[var(--text-muted)] max-w-md">
              We couldn't find candidates matching your criteria, try updating the search & filters.
            </p>
          </div>
        </div>
      ) : (
        <>
          <div style={{ overflow: "hidden", position: "relative" }}>
            {/* CARD VIEW */}
            <div
              style={{
                position: viewMode === "card" ? "relative" : "absolute",
                top: 0,
                left: 0,
                width: "100%",
                opacity: viewMode === "card" ? 1 : 0,
                pointerEvents: viewMode === "card" ? "auto" : "none",
                transition: "opacity 220ms cubic-bezier(0.4, 0, 0.2, 1)",
              }}
            >
              <div className="candidate-results">
                {sortedResults.map((candidate) => {
                  const candidateTenantId = shortlist.resolveCandidateTenantId(candidate);
                  const candidateShortlistKey = candidateTenantId
                    ? shortlistKey(candidateTenantId, candidate.candidateId)
                    : "";
                  const isShortlisted = candidateShortlistKey
                    ? shortlist.keys.has(candidateShortlistKey)
                    : false;
                  const shortlistPending = candidateShortlistKey
                    ? shortlist.pendingKeys.has(candidateShortlistKey)
                    : false;

                  const isCandidateSelected = selectedIds.has(candidate.candidateId);
                  const isLimitReached = selectedIds.size >= 3;
                  const canSelect = isCandidateSelected || !isLimitReached;

                  return (
                    <CandidateResultCard
                      key={candidate.candidateId}
                      candidate={candidate}
                      candidateTenantId={candidateTenantId}
                      isShortlisted={isShortlisted}
                      searchQuery={request?.query ?? query}
                      shortlistPending={shortlistPending}
                      workspaceLabel={
                        isAllScope && candidate.tenantId
                          ? workspaceNameById.get(candidate.tenantId) ?? "Workspace"
                          : null
                      }
                      onPreview={setPreviewCandidate}
                      onToggleShortlist={(nextCandidate) =>
                        void shortlist.toggleCandidate(nextCandidate)
                      }
                      isSelected={isCandidateSelected}
                      canSelect={canSelect}
                      onToggleSelect={handleToggleCardSelect}
                      onCompare={
                        sortedResults.length > 1
                          ? () => setCompareSourceCandidate(candidate)
                          : undefined
                      }
                    />
                  );
                })}
              </div>
            </div>

            {/* TABLE VIEW */}
            <div
              style={{
                position: viewMode === "list" ? "relative" : "absolute",
                top: 0,
                left: 0,
                width: "100%",
                opacity: viewMode === "list" ? 1 : 0,
                pointerEvents: viewMode === "list" ? "auto" : "none",
                transition: "opacity 220ms cubic-bezier(0.4, 0, 0.2, 1)",
              }}
            >
              <CandidateResultTable
                candidates={sortedResults}
                shortlistKeys={shortlist.keys}
                shortlistPendingIds={shortlist.pendingKeys}
                resolveCandidateTenantId={shortlist.resolveCandidateTenantId}
                partnerId={sortedResults[1]?.candidateId ?? null}
                searchQuery={request?.query ?? query}
                workspaceLabel={isAllScope ? "All Workspaces" : null}
                onPreview={setPreviewCandidate}
                onToggleShortlist={(candidate) => void shortlist.toggleCandidate(candidate)}
                selectedIds={selectedIds}
                onSelectionChange={setSelectedIds}
              />
            </div>
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

      {/* Floating Selection Bar */}
      <FloatingSelectionBar
        selectedIds={selectedIds}
        onClear={() => setSelectedIds(new Set())}
        onViewSelected={() => setIsViewSelectedOpen(true)}
        onCompare={() => {
          const source = selectedCandidateObjects[0];
          if (source) setCompareSourceCandidate(source);
        }}
      />
    </div>
  );
}
