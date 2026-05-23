import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, ArrowUp, BookmarkCheck, BookmarkPlus, BriefcaseBusiness, Building2, CheckCircle2, Download, Eye, FileText, MapPin, MessageSquareText, Search, ShieldCheck, SlidersHorizontal, Sparkles, Trash2, Users, X } from "lucide-react";
import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { PlatformScopeControl } from "@/components/PlatformScopeControl";
import { FilterMultiSelect } from "@/components/FilterMultiSelect";
import { PickerDropdown } from "@/components/PickerDropdown";
import { defaultSearchQuery } from "@/data/mockData";
import { buildChatHref } from "@/lib/chatAgent";
import type { CandidateSearchResult, CandidateShortlistInput, CandidateShortlistItem, SearchFilterOptions, SearchFilters, SearchResponse, WorkspaceStats } from "@/lib/contracts";
import { useAuth } from "@/lib/auth";
import { formatYearsExperience } from "@/lib/experience";
import { platformApi } from "@/lib/platformApi";
import { usePlatformScope } from "@/lib/platformScope";
import { deriveSearchFilters, parseSkillText } from "@/lib/queryIntent";
import { Avatar, EmptyState, Panel, ScorePill, Tag } from "@/components/ui";

type SearchRequest = {
  query: string;
  filters: SearchFilters;
  offset: number;
  limit: number;
};

type SearchSortOption =
  | "best-match"
  | "experience-desc"
  | "experience-asc"
  | "name-asc"
  | "name-desc";

const PAGE_SIZE = 8;
const SEARCH_STATE_STORAGE_KEY = "cv-intelligence.search.discovery-state";

const SEARCH_SORT_OPTIONS = new Set<SearchSortOption>([
  "best-match",
  "experience-desc",
  "experience-asc",
  "name-asc",
  "name-desc",
]);

type StoredSearchState = {
  request: SearchRequest | null;
  sortBy: SearchSortOption;
};

function readOptionalString(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

function readStringArray(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return Array.isArray(value)
    ? value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean)
    : undefined;
}

function readStoredSearchState(): StoredSearchState {
  const fallback: StoredSearchState = {
    request: null,
    sortBy: "best-match",
  };

  if (typeof window === "undefined") {
    return fallback;
  }

  try {
    const raw = window.sessionStorage.getItem(SEARCH_STATE_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) as Record<string, unknown> : null;
    if (!parsed || typeof parsed !== "object") {
      return fallback;
    }

    const requestRecord = parsed.request && typeof parsed.request === "object" && !Array.isArray(parsed.request)
      ? parsed.request as Record<string, unknown>
      : null;
    const filterRecord = requestRecord?.filters && typeof requestRecord.filters === "object" && !Array.isArray(requestRecord.filters)
      ? requestRecord.filters as Record<string, unknown>
      : {};
    const query = requestRecord?.query;

    const request = typeof query === "string"
      ? {
          query,
          filters: {
            role: readOptionalString(filterRecord, "role"),
            seniority: readOptionalString(filterRecord, "seniority"),
            minYearsExperience: typeof filterRecord.minYearsExperience === "number" ? filterRecord.minYearsExperience : undefined,
            location: readOptionalString(filterRecord, "location"),
            skills: readStringArray(filterRecord, "skills") ?? [],
            companies: readStringArray(filterRecord, "companies") ?? [],
          },
          offset: 0,
          limit: PAGE_SIZE,
        }
      : null;
    const sortBy = typeof parsed.sortBy === "string" && SEARCH_SORT_OPTIONS.has(parsed.sortBy as SearchSortOption)
      ? parsed.sortBy as SearchSortOption
      : fallback.sortBy;

    return { request, sortBy };
  } catch {
    return fallback;
  }
}

function writeStoredSearchState(request: SearchRequest | null, sortBy: SearchSortOption) {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(SEARCH_STATE_STORAGE_KEY, JSON.stringify({ request, sortBy }));
}

type SearchLoadingStep = {
  label: string;
  phrase: string;
  detail: string;
};

const ROLE_LABELS: Record<string, string> = {
  backend: "backend",
  frontend: "frontend",
  "full-stack": "full-stack",
  mobile: "mobile",
  devops: "DevOps",
  data: "data",
  ml: "ML",
  qa: "QA",
  security: "security",
  generalist: "generalist",
};

function formatSearchList(values: string[], maxItems = 2) {
  const visible = values.slice(0, maxItems);
  const suffix = values.length > maxItems ? ` +${values.length - maxItems}` : "";
  return `${visible.join(", ")}${suffix}`;
}

function compactSearchQuery(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 54 ? `${trimmed.slice(0, 51)}...` : trimmed;
}

function shortlistKey(tenantId: string, candidateId: string) {
  return `${tenantId}:${candidateId}`;
}

function csvCell(value: unknown) {
  const normalized = Array.isArray(value) ? value.join("; ") : String(value ?? "");
  return `"${normalized.replace(/"/g, '""')}"`;
}

function downloadCsv(filename: string, rows: unknown[][]) {
  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function buildSearchLoadingSteps(request: SearchRequest): SearchLoadingStep[] {
  const inferredFilters = deriveSearchFilters(request.query, request.filters);
  const queryLabel = compactSearchQuery(request.query);
  const roleLabel = inferredFilters.role ? ROLE_LABELS[inferredFilters.role] ?? inferredFilters.role : null;
  const seniorityLabel = inferredFilters.seniority ? `${inferredFilters.seniority} ` : "";
  const rolePhrase = roleLabel ? `${seniorityLabel}${roleLabel}`.trim() : "matching";
  const skills = inferredFilters.skills ?? [];
  const companies = inferredFilters.companies ?? [];
  const minYears = inferredFilters.minYearsExperience ?? 0;
  const location = inferredFilters.location?.trim();
  const constraintParts = [
    minYears > 0 ? `${Math.round(minYears)}+ years` : null,
    location || null,
    skills.length ? formatSearchList(skills) : null,
    companies.length ? formatSearchList(companies) : null,
  ].filter((part): part is string => Boolean(part));

  const steps: SearchLoadingStep[] = [
    {
      label: "Read request",
      phrase: queryLabel ? `Asking the intent model to read "${queryLabel}"` : "Reading selected filters",
      detail: roleLabel
        ? `Treating ${roleLabel} as the target role and keeping location separate.`
        : "Separating role, skills, seniority, years, companies, and location with the LLM.",
    },
    {
      label: "Shape filters",
      phrase: constraintParts.length ? `Applying ${formatSearchList(constraintParts, 3)}` : `Looking for ${rolePhrase} candidates`,
      detail: constraintParts.length
        ? "Using the explicit constraints as hard filters before ranking."
        : "Keeping the search broad enough to avoid dropping relevant profiles too early.",
    },
  ];

  if (skills.length) {
    steps.push({
      label: "Check skills",
      phrase: `Checking ${formatSearchList(skills)} evidence`,
      detail: "Matching requested skills against normalized candidate skill tokens.",
    });
  }

  if (location) {
    steps.push({
      label: "Match location",
      phrase: `Filtering for ${location}`,
      detail: "Comparing candidate locations with the normalized location request.",
    });
  }

  steps.push(
    {
      label: "Scan profiles",
      phrase: `Scanning ${rolePhrase} profiles`,
      detail: "Looking at titles, profile summaries, experience, and indexed skills.",
    },
    {
      label: "Rank shortlist",
      phrase: "Balancing exact fit with semantic relevance",
      detail: "Prioritizing title evidence, role fit, seniority, experience, and match quality.",
    },
    {
      label: "Prepare results",
      phrase: "Preparing the first ranked profiles",
      detail: "Packaging the strongest candidates for the results list.",
    },
  );

  return steps;
}

function SearchProcessingState({ request }: { request: SearchRequest }) {
  const steps = useMemo(() => buildSearchLoadingSteps(request), [request]);
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const activeStep = steps[activeStepIndex] ?? steps[0];

  useEffect(() => {
    setActiveStepIndex(0);
    const stepTimer = window.setInterval(() => {
      setActiveStepIndex((currentIndex) => {
        if (currentIndex >= steps.length - 1) {
          window.clearInterval(stepTimer);
          return currentIndex;
        }

        return currentIndex + 1;
      });
    }, 1250);

    return () => {
      window.clearInterval(stepTimer);
    };
  }, [steps]);

  return (
    <Panel className="search-processing-panel" aria-busy="true" aria-label="Searching candidates">
      <div className="search-processing-visual" aria-hidden="true">
        <span className="search-processing-ring search-processing-ring--outer" />
        <span className="search-processing-ring search-processing-ring--inner" />
        <span className="search-processing-node search-processing-node--search">
          <Search size={15} />
        </span>
        <span className="search-processing-node search-processing-node--talent">
          <Users size={15} />
        </span>
        <div className="search-processing-core">
          <Sparkles size={22} />
        </div>
      </div>
      <div className="search-processing-copy">
        <strong>AI search in progress</strong>
        <span className="search-processing-phrase">{activeStep.phrase}</span>
        <p>{activeStep.detail}</p>
      </div>
      <div className="search-processing-steps">
        {steps.map((step, index) => (
          <span
            key={step.label}
            className={[
              "search-processing-step",
              index < activeStepIndex ? "search-processing-step--complete" : "",
              index === activeStepIndex ? "search-processing-step--active" : "",
            ].filter(Boolean).join(" ")}
          >
            <span>{String(index + 1).padStart(2, "0")}</span>
            {step.label}
          </span>
        ))}
      </div>
    </Panel>
  );
}

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
  const queryClient = useQueryClient();
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
  const [shortlistPendingKeys, setShortlistPendingKeys] = useState<Set<string>>(new Set());
  const [shortlistError, setShortlistError] = useState<string | null>(null);
  const [shortlistDrawerOpen, setShortlistDrawerOpen] = useState(false);
  const [previewCandidate, setPreviewCandidate] = useState<CandidateSearchResult | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [request, setRequest] = useState<SearchRequest | null>(initialSearchState.request);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const scopeKey = resolvedTenantIds.join("|");
  const shortlistQueryKey = useMemo(() => ["shortlist", scopeKey] as const, [scopeKey]);
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
  const shortlistQuery = useQuery({
    queryKey: shortlistQueryKey,
    queryFn: () => platformApi.getShortlist(resolvedTenantIds),
    placeholderData: keepPreviousData,
    staleTime: 60 * 1000,
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
  const shortlistItems = shortlistQuery.data ?? [];
  const loadingShortlist = shortlistQuery.isLoading && !shortlistQuery.data;
  const hasExecutedSearch = request !== null;
  const shortlistKeys = useMemo(
    () => new Set(shortlistItems.map((item) => shortlistKey(item.tenantId, item.candidateId))),
    [shortlistItems],
  );
  const sortedResults = useMemo(() => {
    const results = response?.results ?? [];

    switch (sortBy) {
      case "experience-desc":
        return [...results].sort((left, right) => right.yearsExperience - left.yearsExperience || right.matchScore - left.matchScore);
      case "experience-asc":
        return [...results].sort((left, right) => left.yearsExperience - right.yearsExperience || right.matchScore - left.matchScore);
      case "name-asc":
        return [...results].sort((left, right) => left.name.localeCompare(right.name));
      case "name-desc":
        return [...results].sort((left, right) => right.name.localeCompare(left.name));
      case "best-match":
      default:
        return results;
    }
  }, [response?.results, sortBy]);

  useEffect(() => {
    if (!shortlistItems.length && !shortlistError) {
      setShortlistDrawerOpen(false);
    }
  }, [shortlistItems.length, shortlistError]);

  useEffect(() => {
    setShortlistDrawerOpen(false);
    setPreviewCandidate(null);
    setShortlistError(null);
  }, [scopeKey]);

  useEffect(() => {
    if (shortlistQuery.error) {
      setShortlistError(String(shortlistQuery.error));
    } else if (!shortlistPendingKeys.size) {
      setShortlistError(null);
    }
  }, [shortlistPendingKeys.size, shortlistQuery.error]);

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

  const saveShortlistMutation = useMutation({
    mutationFn: (item: CandidateShortlistInput) => platformApi.saveShortlistItem(item),
    onSuccess: (saved) => {
      queryClient.setQueryData<CandidateShortlistItem[]>(shortlistQueryKey, (current = []) => {
        const key = shortlistKey(saved.tenantId, saved.candidateId);
        const withoutExisting = current.filter((item) => shortlistKey(item.tenantId, item.candidateId) !== key);
        return [saved, ...withoutExisting];
      });
    },
  });

  const removeShortlistMutation = useMutation({
    mutationFn: (item: { candidateId: string; tenantId: string }) => platformApi.removeShortlistItem(item.candidateId, item.tenantId),
    onSuccess: (_result, item) => {
      queryClient.setQueryData<CandidateShortlistItem[]>(shortlistQueryKey, (current = []) =>
        current.filter((shortlistItem) => shortlistKey(shortlistItem.tenantId, shortlistItem.candidateId) !== shortlistKey(item.tenantId, item.candidateId)),
      );
    },
  });

  const clearShortlistMutation = useMutation({
    mutationFn: () => platformApi.clearShortlist(resolvedTenantIds),
    onSuccess: () => {
      queryClient.setQueryData<CandidateShortlistItem[]>(shortlistQueryKey, []);
    },
  });

  function handleExecute() {
    const normalizedQuery = query.trim();
    const hasStructuredInput = Boolean(seniority || minYears > 0 || location.trim() || selectedSkills.length || selectedCompanies.length);
    if (!normalizedQuery && !hasStructuredInput) {
      setFormError("Enter a title, skill, or filter to start searching.");
      return;
    }

    const explicitFilters: SearchFilters = {
      seniority,
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

  function resolveCandidateTenantId(candidate: CandidateSearchResult) {
    return candidate.tenantId ?? currentWorkspace?.id ?? currentTenant?.id ?? resolvedTenantIds[0] ?? null;
  }

  function buildShortlistInput(candidate: CandidateSearchResult, tenantId: string): CandidateShortlistInput {
    return {
      tenantId,
      candidateId: candidate.candidateId,
      candidateName: candidate.name,
      currentTitle: candidate.currentTitle,
      location: candidate.location,
      yearsExperience: candidate.yearsExperience,
      seniority: candidate.seniority,
      primaryRole: candidate.primaryRole,
      topSkills: candidate.topSkills,
      matchRate: candidate.backendMatchRate,
      sourceQuery: request?.query ?? query.trim(),
      searchSnapshot: {
        headline: candidate.headline,
        shortSummary: candidate.shortSummary,
        matchSignals: candidate.matchSignals,
        matchNarrative: candidate.matchNarrative,
        stage: candidate.stage,
      },
    };
  }

  async function handleToggleShortlist(candidate: CandidateSearchResult) {
    const tenantId = resolveCandidateTenantId(candidate);
    if (!tenantId) {
      setShortlistError("Select a workspace before adding candidates to your shortlist.");
      return;
    }

    const key = shortlistKey(tenantId, candidate.candidateId);
    const isShortlisted = shortlistKeys.has(key);
    setShortlistError(null);
    setShortlistPendingKeys((current) => new Set(current).add(key));

    try {
      if (isShortlisted) {
        await removeShortlistMutation.mutateAsync({ candidateId: candidate.candidateId, tenantId });
      } else {
        await saveShortlistMutation.mutateAsync(buildShortlistInput(candidate, tenantId));
      }
    } catch (nextError) {
      setShortlistError(`Shortlist update failed: ${String(nextError)}`);
    } finally {
      setShortlistPendingKeys((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
    }
  }

  async function handleRemoveShortlistItem(item: CandidateShortlistItem) {
    const key = shortlistKey(item.tenantId, item.candidateId);
    setShortlistError(null);
    setShortlistPendingKeys((current) => new Set(current).add(key));
    try {
      await removeShortlistMutation.mutateAsync({ candidateId: item.candidateId, tenantId: item.tenantId });
    } catch (nextError) {
      setShortlistError(`Shortlist update failed: ${String(nextError)}`);
    } finally {
      setShortlistPendingKeys((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
    }
  }

  async function handleOpenShortlistCv(item: CandidateShortlistItem) {
    const key = `cv:${shortlistKey(item.tenantId, item.candidateId)}`;
    setShortlistError(null);
    setShortlistPendingKeys((current) => new Set(current).add(key));

    try {
      const documentUrl = await platformApi.getOriginalDocumentUrl(null, item.cvUrl, {
        candidateId: item.candidateId,
        tenantId: item.tenantId,
      });
      if (!documentUrl) {
        throw new Error("The original CV is not available from browser-accessible storage yet.");
      }
      window.open(documentUrl, "_blank", "noopener,noreferrer");
    } catch (nextError) {
      setShortlistError(`Could not open CV: ${String(nextError)}`);
    } finally {
      setShortlistPendingKeys((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
    }
  }

  async function handleClearShortlist() {
    if (!shortlistItems.length) {
      return;
    }

    const pendingKey = "clear-shortlist";
    setShortlistError(null);
    setShortlistPendingKeys((current) => new Set(current).add(pendingKey));
    try {
      await clearShortlistMutation.mutateAsync();
      setShortlistDrawerOpen(false);
    } catch (nextError) {
      setShortlistError(`Could not clear shortlist: ${String(nextError)}`);
    } finally {
      setShortlistPendingKeys((current) => {
        const next = new Set(current);
        next.delete(pendingKey);
        return next;
      });
    }
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
  const clearingShortlist = shortlistPendingKeys.has("clear-shortlist");
  const previewTenantId = previewCandidate ? resolveCandidateTenantId(previewCandidate) : null;
  const previewShortlistKey = previewCandidate && previewTenantId ? shortlistKey(previewTenantId, previewCandidate.candidateId) : "";
  const previewIsShortlisted = previewShortlistKey ? shortlistKeys.has(previewShortlistKey) : false;
  const previewShortlistPending = previewShortlistKey ? shortlistPendingKeys.has(previewShortlistKey) : false;
  const previewPartnerId = previewCandidate
    ? sortedResults.find((candidate) => candidate.candidateId !== previewCandidate.candidateId)?.candidateId
    : null;
  const workspaceStatsPanel = loadingWorkspaceStats ? (
    <div className="search-metrics-strip" aria-busy="true" aria-label="Loading workspace statistics">
      {["cv-pool", "candidate-profiles", "workspace"].map((item) => (
        <div key={item} className="search-metric search-metric--loading">
          <span className="stat-card__skeleton search-metric__icon" />
          <div>
            <span className="stat-card__skeleton search-metric__label" />
            <span className="stat-card__skeleton search-metric__value" />
          </div>
        </div>
      ))}
    </div>
  ) : workspaceStats ? (
    <div className="search-metrics-strip" aria-label="Search corpus summary">
      <div className="search-metric">
        <span className="search-metric__icon">
          <FileText size={16} />
        </span>
        <div>
          <span>CV Pool</span>
          <strong>{workspaceStats.documentCount.toLocaleString()}</strong>
          <small>indexed documents</small>
        </div>
      </div>

      <div className="search-metric">
        <span className="search-metric__icon search-metric__icon--secondary">
          <Users size={16} />
        </span>
        <div>
          <span>Candidate Profiles</span>
          <strong>{workspaceStats.candidateCount.toLocaleString()}</strong>
          <small>searchable</small>
        </div>
      </div>

      <div className="search-metric">
        <span className="search-metric__icon search-metric__icon--tertiary">
          {isAllScope ? <ShieldCheck size={16} /> : currentWorkspace ? <Building2 size={16} /> : <ShieldCheck size={16} />}
        </span>
        <div>
          <span>Workspace</span>
          <strong>{isAllScope ? "All workspaces" : currentWorkspace?.name ?? currentTenant?.name ?? "Demo Workspace"}</strong>
          <small>{isAllScope ? `${workspaceOptions.length} workspaces` : currentWorkspace ? `${currentWorkspace.role} access` : "tenant-scoped pool"}</small>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <div className="page-stack search-page">
      <section className="search-page-header" aria-labelledby="search-page-title">
        <div className="search-page-header__copy">
          <span className="eyebrow">Candidate search</span>
          <h1 id="search-page-title">Search candidates</h1>
        </div>

        <div className="search-page-header__actions">
          {shortlistItems.length ? (
            <button
              className="button button--secondary search-shortlist-button"
              type="button"
              onClick={() => setShortlistDrawerOpen(true)}
              aria-label={`Open shortlist with ${shortlistItems.length} candidates`}
            >
              <BookmarkCheck size={16} />
              <span>Shortlist</span>
              <strong>{shortlistItems.length}</strong>
            </button>
          ) : null}
          <PlatformScopeControl
            isPlatformAdmin={isPlatformAdmin}
            scopeMode={scopeMode}
            onChangeScopeMode={setScopeMode}
            currentWorkspace={currentWorkspace}
            workspaceOptions={workspaceOptions}
            onChangeWorkspace={setWorkspaceId}
          />
        </div>
      </section>

      {workspaceStatsPanel}

      <form
        className="search-console-form"
        onSubmit={(event) => {
          event.preventDefault();
          handleExecute();
        }}
      >
        <Panel className="search-command-panel">
          <div className="search-command-bar">
            <label className="search-field">
              <Sparkles size={18} />
              <input
                ref={queryInputRef}
                aria-label="Search candidates"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={defaultSearchQuery}
              />
            </label>
            <button
              className="button button--secondary search-filter-toggle"
              type="button"
              aria-expanded={filtersOpen}
              aria-controls="search-filter-region"
              onClick={() => setFiltersOpen((value) => !value)}
            >
              <SlidersHorizontal size={16} />
              Filters
              {activeFilterCount ? <strong>{activeFilterCount}</strong> : null}
            </button>
            <button className="button button--primary search-submit-button" type="submit" disabled={loadingInitial || loadingMore}>
              <Search size={16} />
              {loadingInitial ? "Searching..." : "Search"}
            </button>
          </div>

          {filtersOpen ? (
            <div id="search-filter-region" className="search-filter-region">
              <div className="search-filter-toolbar">
                <div className="search-filter-toolbar__title">
                  <SlidersHorizontal size={16} />
                  <strong>Filters</strong>
                  <span>{activeFilterCount ? `${activeFilterCount} active` : "All candidates"}</span>
                </div>
                {activeFilterCount ? (
                  <button className="button button--secondary button--compact" type="button" onClick={handleClearFilters}>
                    <X size={14} />
                    Clear
                  </button>
                ) : null}
              </div>

              <div className="search-filters-grid">
                <label className="search-filter-field">
                  <span>Seniority</span>
                  <PickerDropdown
                    value={seniority}
                    options={filterOptions?.seniority ?? []}
                    onChange={setSeniority}
                    placeholder="Any seniority"
                    emptyLabel="No seniority values available"
                  />
                </label>

                <label className="search-filter-field">
                  <span>Min years</span>
                  <input className="form-input" type="number" value={minYears} min={0} onChange={(event) => setMinYears(Number(event.target.value))} />
                </label>

                <label className="search-filter-field">
                  <span>Location</span>
                  <PickerDropdown
                    value={location}
                    options={(filterOptions?.locations ?? []).map((option) => ({ value: option, label: option }))}
                    onChange={setLocation}
                    placeholder="Any location"
                    emptyLabel="No indexed locations available"
                  />
                </label>

                <label className="search-filter-field search-filter-field--wide">
                  <span>Skills</span>
                  <FilterMultiSelect
                    options={filterOptions?.skills ?? []}
                    values={selectedSkills}
                    onChange={setSelectedSkills}
                    placeholder="Any skill"
                    searchPlaceholder="Search skills"
                    normalizeInput={parseSkillText}
                    emptyLabel="No skills match"
                  />
                </label>

                <label className="search-filter-field search-filter-field--wide">
                  <span>Companies</span>
                  <FilterMultiSelect
                    options={filterOptions?.companies ?? []}
                    values={selectedCompanies}
                    onChange={setSelectedCompanies}
                    placeholder="Any company"
                    searchPlaceholder="Search companies"
                    emptyLabel="No companies match"
                  />
                </label>
              </div>
            </div>
          ) : null}
        </Panel>
      </form>

      {shortlistItems.length || shortlistError ? (
        <Panel className="shortlist-tray">
          <div className="shortlist-tray__main">
            <span className="shortlist-tray__icon">
              <BookmarkCheck size={18} />
            </span>
            <div>
              <strong>{shortlistItems.length ? `${shortlistItems.length} shortlisted` : "Shortlist needs attention"}</strong>
              <p>{shortlistError ?? "Saved to your account. Review the list before exporting."}</p>
            </div>
          </div>
          <div className="shortlist-tray__actions">
            <button className="button button--primary" type="button" onClick={() => setShortlistDrawerOpen(true)} disabled={!shortlistItems.length}>
              <BookmarkCheck size={16} />
              Review
            </button>
            <button className="button button--secondary" type="button" onClick={handleExportShortlist} disabled={!shortlistItems.length}>
              <Download size={16} />
              Export CSV
            </button>
            <button className="button button--secondary" type="button" onClick={handleClearShortlist} disabled={!shortlistItems.length || clearingShortlist}>
              <Trash2 size={16} />
              {clearingShortlist ? "Clearing..." : "Clear"}
            </button>
          </div>
        </Panel>
      ) : null}

      {shortlistDrawerOpen ? (
        <>
          <div className="shortlist-drawer-backdrop" onClick={() => setShortlistDrawerOpen(false)} />
          <aside className="shortlist-drawer" role="dialog" aria-modal="true" aria-labelledby="shortlist-drawer-title">
            <div className="shortlist-drawer__header">
              <div className="stack">
                <span className="eyebrow">Saved shortlist</span>
                <h2 id="shortlist-drawer-title">{shortlistItems.length} candidates</h2>
                <p className="muted">Account-level selections for the active workspace scope.</p>
              </div>
              <button className="icon-button" type="button" onClick={() => setShortlistDrawerOpen(false)} aria-label="Close shortlist drawer">
                <X size={18} />
              </button>
            </div>

            <div className="shortlist-drawer__body">
              {shortlistError ? <p className="shortlist-drawer__error">{shortlistError}</p> : null}
              {loadingShortlist ? (
                <p className="muted">Loading saved candidates...</p>
              ) : !shortlistItems.length ? (
                <p className="muted">No candidates saved yet.</p>
              ) : (
                <div className="shortlist-drawer__list">
                  {shortlistItems.map((item) => {
                    const key = shortlistKey(item.tenantId, item.candidateId);
                    const removing = shortlistPendingKeys.has(key);
                    const openingCv = shortlistPendingKeys.has(`cv:${key}`);
                    return (
                      <article key={key} className="shortlist-drawer-card">
                        <div className="shortlist-drawer-card__header">
                          <div className="candidate-card__identity">
                            <Avatar name={item.candidateName} hue={item.candidateName.length * 17} size="sm" />
                            <div className="stack">
                              <strong>{item.candidateName}</strong>
                              <p>{item.currentTitle}</p>
                            </div>
                          </div>
                          {item.matchRate !== null ? <ScorePill score={item.matchRate} label="Match" /> : null}
                        </div>

                        <div className="meta-list shortlist-drawer-card__meta">
                          <span className="tag">
                            <MapPin size={14} />
                            {item.location}
                          </span>
                          {item.yearsExperience !== null ? (
                            <span className="tag">
                              <BriefcaseBusiness size={14} />
                              {formatYearsExperience(item.yearsExperience)}
                            </span>
                          ) : null}
                        </div>

                        {item.topSkills.length ? (
                          <div className="skill-list">
                            {item.topSkills.slice(0, 4).map((skill) => (
                              <Tag key={skill} tone="primary">
                                {skill}
                              </Tag>
                            ))}
                          </div>
                        ) : null}

                        <div className="shortlist-drawer-card__actions">
                          <Link className="button button--secondary button--compact" to={`/dossier/${item.candidateId}`} onClick={() => setShortlistDrawerOpen(false)}>
                            View
                          </Link>
                          {item.cvUrl ? (
                            <button className="button button--secondary button--compact" type="button" onClick={() => void handleOpenShortlistCv(item)} disabled={openingCv}>
                              <FileText size={14} />
                              {openingCv ? "Opening..." : "CV"}
                            </button>
                          ) : null}
                          <button
                            className="button button--secondary button--compact"
                            type="button"
                            onClick={() => void handleRemoveShortlistItem(item)}
                            disabled={removing}
                          >
                            <Trash2 size={14} />
                            {removing ? "Removing..." : "Remove"}
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="shortlist-drawer__footer">
              {shortlistChatHref ? (
                <Link className="button button--secondary" to={shortlistChatHref}>
                  Ask Agent
                  <MessageSquareText size={16} />
                </Link>
              ) : null}
              {shortlistCompareHref ? (
                <Link className="button button--primary" to={shortlistCompareHref}>
                  Compare
                  <ArrowRight size={16} />
                </Link>
              ) : null}
              <button className="button button--secondary" type="button" onClick={handleExportShortlist} disabled={!shortlistItems.length}>
                <Download size={16} />
                Export CSV
              </button>
              <button className="button button--secondary" type="button" onClick={handleClearShortlist} disabled={!shortlistItems.length || clearingShortlist}>
                <Trash2 size={16} />
                {clearingShortlist ? "Clearing..." : "Clear"}
              </button>
            </div>
          </aside>
        </>
      ) : null}

      {previewCandidate ? (
        <>
          <div className="candidate-preview-drawer-backdrop" onClick={() => setPreviewCandidate(null)} />
          <aside className="candidate-preview-drawer" role="dialog" aria-modal="true" aria-labelledby="candidate-preview-title">
            <div className="candidate-preview-drawer__header">
              <div className="candidate-card__identity">
                <Avatar name={previewCandidate.name} hue={previewCandidate.avatarHue} size="lg" />
                <div className="stack">
                  <span className="eyebrow">Sneak peek</span>
                  <h2 id="candidate-preview-title">{previewCandidate.name}</h2>
                  <p>{previewCandidate.currentTitle}</p>
                </div>
              </div>
              <button className="icon-button" type="button" onClick={() => setPreviewCandidate(null)} aria-label="Close candidate overview">
                <X size={18} />
              </button>
            </div>

            <div className="candidate-preview-drawer__body">
              <div className="candidate-preview-drawer__score-row">
                <ScorePill score={previewCandidate.backendMatchRate} label="Match rate" />
                <div className="skill-list">
                  <Tag>{previewCandidate.seniority}</Tag>
                  <Tag>{previewCandidate.primaryRole}</Tag>
                  <Tag tone="success">{previewCandidate.stage}</Tag>
                </div>
              </div>

              <div className="meta-list candidate-preview-drawer__meta">
                <span className="tag">
                  <MapPin size={14} />
                  {previewCandidate.location}
                </span>
                <span className="tag">
                  <BriefcaseBusiness size={14} />
                  {formatYearsExperience(previewCandidate.yearsExperience)}
                </span>
              </div>

              <section className="candidate-preview-section">
                <span className="eyebrow">Overview</span>
                <p>{previewCandidate.shortSummary || previewCandidate.headline || previewCandidate.matchNarrative}</p>
              </section>

              {previewCandidate.matchNarrative ? (
                <section className="candidate-preview-section">
                  <span className="eyebrow">Why this match</span>
                  <p>{previewCandidate.matchNarrative}</p>
                </section>
              ) : null}

              <section className="candidate-preview-section">
                <span className="eyebrow">Top skills</span>
                <div className="skill-list">
                  {previewCandidate.topSkills.slice(0, 8).map((skill) => (
                    <Tag key={skill} tone="primary">
                      {skill}
                    </Tag>
                  ))}
                </div>
              </section>

              {previewCandidate.strengths.length ? (
                <section className="candidate-preview-section">
                  <span className="eyebrow">Strengths</span>
                  <ul className="bullet-list">
                    {previewCandidate.strengths.slice(0, 3).map((strength) => (
                      <li key={strength}>{strength}</li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {previewCandidate.risks.length ? (
                <section className="candidate-preview-section">
                  <span className="eyebrow">Watchouts</span>
                  <ul className="bullet-list">
                    {previewCandidate.risks.slice(0, 2).map((risk) => (
                      <li key={risk}>{risk}</li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </div>

            <div className="candidate-preview-drawer__footer">
              <button
                className={previewIsShortlisted ? "button button--primary" : "button button--secondary"}
                type="button"
                aria-pressed={previewIsShortlisted}
                disabled={previewShortlistPending || !previewTenantId}
                onClick={() => void handleToggleShortlist(previewCandidate)}
              >
                {previewIsShortlisted ? <BookmarkCheck size={16} /> : <BookmarkPlus size={16} />}
                {previewShortlistPending ? "Saving..." : previewIsShortlisted ? "Shortlisted" : "Shortlist"}
              </button>
              <Link
                className="button button--primary"
                to={`/dossier/${previewCandidate.candidateId}`}
                state={{
                  searchMatchScore: previewCandidate.matchScore,
                  searchMatchSignals: previewCandidate.matchSignals,
                  searchQuery: request?.query ?? query,
                }}
                onClick={() => setPreviewCandidate(null)}
              >
                View Dossier
                <ArrowRight size={16} />
              </Link>
              <Link className="button button--secondary" to={buildChatHref([previewCandidate.candidateId], "Why is this candidate a strong fit?")}>
                Ask Agent
                <MessageSquareText size={16} />
              </Link>
              {previewPartnerId ? (
                <Link className="button button--secondary" to={`/compare?ids=${previewCandidate.candidateId},${previewPartnerId}`}>
                  Compare
                  <ArrowRight size={16} />
                </Link>
              ) : null}
            </div>
          </aside>
        </>
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
          <Panel className="search-summary-bar">
            <div className="search-summary-bar__main">
              <strong>Loaded {response.results.length} candidates</strong>
              <p>
                Results append automatically as you scroll. Sort applies to the loaded result set without changing the active search frame.
              </p>
              {topChatHref || topCompareHref ? (
                <div className="search-summary-actions">
                  {topChatHref ? (
                    <Link className="button button--secondary" to={topChatHref}>
                      Ask Agent
                      <MessageSquareText size={16} />
                    </Link>
                  ) : null}
                  {topCompareHref ? (
                    <Link className="button button--primary" to={topCompareHref}>
                      Compare Top Matches
                      <ArrowRight size={16} />
                    </Link>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="search-summary-bar__controls">
              <label className="search-sort">
                <span>Sort by</span>
                <select className="form-select" value={sortBy} onChange={(event) => setSortBy(event.target.value as SearchSortOption)}>
                  <option value="best-match">Best match</option>
                  <option value="experience-desc">Most experience</option>
                  <option value="experience-asc">Least experience</option>
                  <option value="name-asc">Name A-Z</option>
                  <option value="name-desc">Name Z-A</option>
                </select>
              </label>
            </div>
          </Panel>

          <div className="candidate-results">
            {sortedResults.map((candidate) => {
              const partnerId = sortedResults.find((item) => item.candidateId !== candidate.candidateId)?.candidateId;
              const candidateTenantId = resolveCandidateTenantId(candidate);
              const candidateShortlistKey = candidateTenantId ? shortlistKey(candidateTenantId, candidate.candidateId) : "";
              const isShortlisted = candidateShortlistKey ? shortlistKeys.has(candidateShortlistKey) : false;
              const shortlistPending = candidateShortlistKey ? shortlistPendingKeys.has(candidateShortlistKey) : false;

              return (
                <Panel key={candidate.candidateId} className="candidate-card">
                  <div className="candidate-card__header">
                    <div className="candidate-card__identity">
                      <Avatar name={candidate.name} hue={candidate.avatarHue} />
                      <div className="stack">
                        <h3>{candidate.name}</h3>
                        <p>{candidate.currentTitle}</p>
                        <div className="skill-list">
                          {isAllScope && candidate.tenantId ? <Tag>{workspaceNameById.get(candidate.tenantId) ?? "Workspace"}</Tag> : null}
                          <Tag>{candidate.seniority}</Tag>
                          <Tag>{candidate.primaryRole}</Tag>
                          <Tag tone="success">{candidate.stage}</Tag>
                        </div>
                      </div>
                    </div>
                    <ScorePill score={candidate.backendMatchRate} label="Match rate" />
                  </div>

                  <div className="meta-list">
                    <span className="tag">
                      <MapPin size={14} />
                      {candidate.location}
                    </span>
                    <span className="tag">
                      <BriefcaseBusiness size={14} />
                      {formatYearsExperience(candidate.yearsExperience)}
                    </span>
                  </div>

                  <div className="skill-list">
                    {candidate.topSkills.slice(0, 5).map((skill) => (
                      <Tag key={skill} tone="primary">
                        {skill}
                      </Tag>
                    ))}
                  </div>

	                  <div className="skill-list">
                    <button className="button button--secondary" type="button" onClick={() => setPreviewCandidate(candidate)}>
                      <Eye size={16} />
                      Quick overview
                    </button>
                    <button
                      className={[
                        "button",
                        isShortlisted ? "button--primary shortlist-action-button shortlist-action-button--active" : "button--secondary shortlist-action-button",
                      ].join(" ")}
                      type="button"
                      aria-pressed={isShortlisted}
                      disabled={shortlistPending || !candidateTenantId}
                      onClick={() => void handleToggleShortlist(candidate)}
                    >
                      {isShortlisted ? <BookmarkCheck size={16} /> : <BookmarkPlus size={16} />}
                      {shortlistPending ? "Saving..." : isShortlisted ? "Shortlisted" : "Shortlist"}
                    </button>
                    <Link
                      className="button button--secondary"
                      to={`/dossier/${candidate.candidateId}`}
                      state={{
                        searchMatchScore: candidate.matchScore,
                        searchMatchSignals: candidate.matchSignals,
                        searchQuery: request?.query ?? query,
                      }}
                    >
                      View Dossier
                    </Link>
                    <Link
                      className="button button--secondary"
                      to={buildChatHref([candidate.candidateId], "Why is this candidate a strong fit?")}
                    >
                      Ask Agent
                    </Link>
                    {partnerId ? (
                      <Link className="button button--primary" to={`/compare?ids=${candidate.candidateId},${partnerId}`}>
                        Compare
                      </Link>
                    ) : null}
                  </div>
                </Panel>
              );
            })}
          </div>

          <div ref={loadMoreRef} className="infinite-scroll-sentinel">
            {error ? (
              <Panel className="infinite-scroll-panel">
                <strong>Could not load more results</strong>
                <p>{error}</p>
                {request && response.nextCursor !== null ? (
                  <button
                    className="button button--secondary"
                    type="button"
                    onClick={() => void searchResultsQuery.fetchNextPage()}
                    disabled={loadingMore}
                  >
                    Retry
                  </button>
                ) : null}
              </Panel>
            ) : loadingMore ? (
              <Panel className="infinite-scroll-panel">
                <strong>Loading more candidates</strong>
                <p>Fetching the next ranked slice from the search index.</p>
              </Panel>
            ) : response.nextCursor !== null ? (
              <Panel className="infinite-scroll-panel">
                <strong>Keep scrolling</strong>
                <p>The next page will load automatically as this section enters the viewport.</p>
              </Panel>
            ) : (
              <Panel className="infinite-scroll-panel infinite-scroll-panel--complete">
                <div className="infinite-scroll-panel__badge">
                  <CheckCircle2 size={16} />
                  <span>Search complete</span>
                </div>
                <strong>{response.results.length} ranked candidates loaded</strong>
                <p>You’ve reached the end of this ranked result set. Broaden the search frame or adjust filters to surface more profiles.</p>
                <div className="infinite-scroll-panel__actions">
                  <button
                    className="button button--secondary"
                    type="button"
                    onClick={() => {
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                  >
                    <ArrowUp size={14} />
                    Back to Top
                  </button>
                  <button
                    className="button button--secondary"
                    type="button"
                    onClick={() => {
                      window.scrollTo({ top: 0, behavior: "smooth" });
                      window.setTimeout(() => queryInputRef.current?.focus(), 180);
                    }}
                  >
                    Refine Search
                  </button>
                </div>
              </Panel>
            )}
          </div>
        </>
      )}
    </div>
  );
}
