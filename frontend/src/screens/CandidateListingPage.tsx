import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Filter, RefreshCw, Search, Users, X } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { PlatformScopeControl } from "@/components/PlatformScopeControl";
import { EmptyState, PageIntro, Panel, Tag } from "@/components/ui";
import type { CandidateListFilters, CandidateListGroupBy, CandidateListItem } from "@/lib/contracts";
import { platformApi } from "@/lib/platformApi";
import { usePlatformScope } from "@/lib/platformScope";

const DEFAULT_PAGE_SIZE = 50;
const PAGE_SIZE_OPTIONS = [25, 50, 100];

const GROUP_BY_OPTIONS: Array<{ value: CandidateListGroupBy | ""; label: string }> = [
  { value: "", label: "No grouping" },
  { value: "status", label: "Status / stage" },
  { value: "role", label: "Applied role" },
  { value: "source", label: "Source" },
  { value: "location", label: "Location" },
];

function formatUpdatedAt(value: string) {
  if (!value) {
    return "—";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function parsePageSize(value: string | null) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_PAGE_SIZE;
  }
  return PAGE_SIZE_OPTIONS.includes(parsed) ? parsed : DEFAULT_PAGE_SIZE;
}

function readFilters(params: URLSearchParams): CandidateListFilters {
  const groupBy = params.get("groupBy") ?? "";
  return {
    query: params.get("q") ?? "",
    status: params.get("status") ?? "",
    role: params.get("role") ?? "",
    source: params.get("source") ?? "",
    location: params.get("location") ?? "",
    updatedFrom: params.get("updatedFrom") ?? "",
    updatedTo: params.get("updatedTo") ?? "",
    groupBy: groupBy === "status" || groupBy === "role" || groupBy === "source" || groupBy === "location" ? groupBy : "",
  };
}

function hasActiveFilters(filters: CandidateListFilters) {
  return Boolean(
    filters.query?.trim()
      || filters.status
      || filters.role
      || filters.source
      || filters.location
      || filters.updatedFrom
      || filters.updatedTo,
  );
}

function CandidateListingSkeleton() {
  return (
    <Panel className="table-card candidate-list-panel" aria-busy="true" aria-label="Loading candidates">
      <div className="candidate-list-skeleton">
        {Array.from({ length: 8 }).map((_, index) => (
          <div key={index} className="candidate-list-skeleton__row">
            <span className="stat-card__skeleton candidate-list-skeleton__cell candidate-list-skeleton__cell--name" />
            <span className="stat-card__skeleton candidate-list-skeleton__cell" />
            <span className="stat-card__skeleton candidate-list-skeleton__cell" />
            <span className="stat-card__skeleton candidate-list-skeleton__cell candidate-list-skeleton__cell--small" />
          </div>
        ))}
      </div>
    </Panel>
  );
}

function CandidateRow({ item, showWorkspace }: { item: CandidateListItem; showWorkspace: boolean }) {
  return (
    <tr>
      <td>
        <Link className="candidate-list__name-link" to={`/dossier/${item.candidateId}`}>
          <strong>{item.name}</strong>
        </Link>
        {item.email ? <span className="candidate-list__email">{item.email}</span> : null}
      </td>
      <td>
        <Tag tone="success">{item.stage}</Tag>
      </td>
      <td>{item.appliedRole || item.primaryRole || "—"}</td>
      <td>{item.location || "—"}</td>
      <td>
        <Tag>{item.source.replace(/_/g, " ")}</Tag>
      </td>
      {showWorkspace ? <td>{item.tenantId.slice(0, 8)}</td> : null}
      <td>{formatUpdatedAt(item.updatedAt)}</td>
    </tr>
  );
}

export function CandidateListingPage() {
  const [searchParams, setSearchParams] = useSearchParams();
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
  const scopeKey = resolvedTenantIds.join("|");
  const filters = useMemo(() => readFilters(searchParams), [searchParams]);
  const pageSize = parsePageSize(searchParams.get("pageSize"));
  const pageIndex = Math.max(0, Number(searchParams.get("page") ?? "1") - 1);
  const [queryInput, setQueryInput] = useState(filters.query ?? "");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  useEffect(() => {
    setQueryInput(filters.query ?? "");
  }, [filters.query]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const trimmed = queryInput.trim();
      if (trimmed === (filters.query ?? "").trim()) {
        return;
      }
      const next = new URLSearchParams(searchParams);
      if (trimmed) {
        next.set("q", trimmed);
      } else {
        next.delete("q");
      }
      next.set("page", "1");
      setSearchParams(next, { replace: true });
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [filters.query, queryInput, searchParams, setSearchParams]);

  const listQuery = useQuery({
    queryKey: ["candidates-list", scopeKey, pageSize, pageIndex, filters],
    queryFn: () =>
      platformApi.listCandidates(resolvedTenantIds, {
        pageSize,
        pageIndex,
        filters,
      }),
    placeholderData: keepPreviousData,
  });

  const response = listQuery.data;
  const items = response?.items ?? [];
  const totalItems = response?.itemsTotalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePageIndex = Math.min(pageIndex, totalPages - 1);
  const pageStart = totalItems ? safePageIndex * pageSize + 1 : 0;
  const pageEnd = totalItems ? Math.min(totalItems, pageStart + items.length - 1) : 0;
  const activeFilters = hasActiveFilters(filters);
  const showWorkspaceColumn = isPlatformAdmin && isAllScope;

  useEffect(() => {
    if (pageIndex !== safePageIndex && totalItems > 0) {
      const next = new URLSearchParams(searchParams);
      next.set("page", String(safePageIndex + 1));
      setSearchParams(next, { replace: true });
    }
  }, [pageIndex, safePageIndex, searchParams, setSearchParams, totalItems]);

  const updateParams = (mutate: (params: URLSearchParams) => void, resetPage = true) => {
    const next = new URLSearchParams(searchParams);
    mutate(next);
    if (resetPage) {
      next.set("page", "1");
    }
    setSearchParams(next, { replace: true });
  };

  const clearFilters = () => {
    const next = new URLSearchParams(searchParams);
    ["q", "status", "role", "source", "location", "updatedFrom", "updatedTo"].forEach((key) => next.delete(key));
    next.set("page", "1");
    setQueryInput("");
    setSearchParams(next, { replace: true });
  };

  const groupedSections = useMemo(() => {
    if (!filters.groupBy) {
      return [{ key: "__all__", label: "", count: items.length, items }];
    }
    const sections: Array<{ key: string; label: string; count: number; items: CandidateListItem[] }> = [];
    for (const item of items) {
      const key = item.groupKey ?? "unknown";
      const label = item.groupLabel ?? key;
      const current = sections[sections.length - 1];
      if (current?.key === key) {
        current.items.push(item);
      } else {
        const summary = response?.groups.find((group) => group.key === key);
        sections.push({
          key,
          label,
          count: summary?.count ?? 1,
          items: [item],
        });
      }
    }
    return sections;
  }, [filters.groupBy, items, response?.groups]);

  const filterOptions = response?.filterOptions;

  return (
    <div className="page-stack candidate-list-page">
      <PageIntro
        eyebrow="Talent pool"
        title="Candidates"
        description="Browse, filter, and group your candidate corpus. Use this directory when you need a structured list rather than semantic search ranking."
        actions={
          <div className="job-page-actions">
            <PlatformScopeControl
              isPlatformAdmin={isPlatformAdmin}
              scopeMode={scopeMode}
              currentWorkspace={currentWorkspace}
              workspaceOptions={workspaceOptions}
              onChangeScopeMode={setScopeMode}
              onChangeWorkspace={setWorkspaceId}
            />
            <Link className="button button--secondary" to="/search">
              <Search size={16} />
              Search
            </Link>
          </div>
        }
      />

      <Panel className="candidate-list-filters">
        <div className="candidate-list-filters__header">
          <div className="skill-list">
            <Filter size={16} />
            <h2>Filters</h2>
          </div>
          {activeFilters ? (
            <button className="button button--ghost" type="button" onClick={clearFilters}>
              <X size={14} />
              Clear all filters
            </button>
          ) : null}
        </div>

        <div className="candidate-list-filters__grid">
          <label className="search-input search-input--compact">
            <Search size={16} />
            <input
              value={queryInput}
              onChange={(event) => setQueryInput(event.target.value)}
              placeholder="Search name or email"
              aria-label="Search candidates by name or email"
            />
          </label>

          <select
            className="form-select"
            value={filters.status ?? ""}
            onChange={(event) => updateParams((params) => {
              if (event.target.value) {
                params.set("status", event.target.value);
              } else {
                params.delete("status");
              }
            })}
            aria-label="Filter by status"
          >
            <option value="">All statuses</option>
            {(filterOptions?.statuses ?? []).map((status) => (
              <option key={status} value={status}>
                {status.replace(/_/g, " ")}
              </option>
            ))}
          </select>

          <select
            className="form-select"
            value={filters.role ?? ""}
            onChange={(event) => updateParams((params) => {
              if (event.target.value) {
                params.set("role", event.target.value);
              } else {
                params.delete("role");
              }
            })}
            aria-label="Filter by role"
          >
            <option value="">All roles</option>
            {(filterOptions?.roles ?? []).map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>

          <select
            className="form-select"
            value={filters.source ?? ""}
            onChange={(event) => updateParams((params) => {
              if (event.target.value) {
                params.set("source", event.target.value);
              } else {
                params.delete("source");
              }
            })}
            aria-label="Filter by source"
          >
            <option value="">All sources</option>
            {(filterOptions?.sources ?? []).map((source) => (
              <option key={source} value={source}>
                {source.replace(/_/g, " ")}
              </option>
            ))}
          </select>

          <select
            className="form-select"
            value={filters.location ?? ""}
            onChange={(event) => updateParams((params) => {
              if (event.target.value) {
                params.set("location", event.target.value);
              } else {
                params.delete("location");
              }
            })}
            aria-label="Filter by location"
          >
            <option value="">All locations</option>
            {(filterOptions?.locations ?? []).map((location) => (
              <option key={location} value={location}>
                {location}
              </option>
            ))}
          </select>

          <input
            className="form-input"
            type="date"
            value={filters.updatedFrom ?? ""}
            onChange={(event) => updateParams((params) => {
              if (event.target.value) {
                params.set("updatedFrom", event.target.value);
              } else {
                params.delete("updatedFrom");
              }
            })}
            aria-label="Updated from"
          />

          <input
            className="form-input"
            type="date"
            value={filters.updatedTo ?? ""}
            onChange={(event) => updateParams((params) => {
              if (event.target.value) {
                params.set("updatedTo", event.target.value);
              } else {
                params.delete("updatedTo");
              }
            })}
            aria-label="Updated to"
          />

          <select
            className="form-select"
            value={filters.groupBy ?? ""}
            onChange={(event) => updateParams((params) => {
              const value = event.target.value;
              if (value) {
                params.set("groupBy", value);
              } else {
                params.delete("groupBy");
              }
            })}
            aria-label="Group candidates by"
          >
            {GROUP_BY_OPTIONS.map((option) => (
              <option key={option.label} value={option.value}>
                {option.value ? `Group by ${option.label.toLowerCase()}` : option.label}
              </option>
            ))}
          </select>
        </div>

        {activeFilters ? (
          <div className="candidate-list-active-filters" aria-label="Active filters">
            {filters.query ? <Tag>Search: {filters.query}</Tag> : null}
            {filters.status ? <Tag>Status: {filters.status}</Tag> : null}
            {filters.role ? <Tag>Role: {filters.role}</Tag> : null}
            {filters.source ? <Tag>Source: {filters.source}</Tag> : null}
            {filters.location ? <Tag>Location: {filters.location}</Tag> : null}
            {filters.updatedFrom ? <Tag>From: {filters.updatedFrom}</Tag> : null}
            {filters.updatedTo ? <Tag>To: {filters.updatedTo}</Tag> : null}
          </div>
        ) : null}
      </Panel>

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
        <CandidateListingSkeleton />
      ) : (
        <Panel className="table-card candidate-list-panel">
          <div className="job-table-toolbar">
            <div>
              <div className="skill-list">
                <Users size={16} />
                <h2>Candidate directory</h2>
              </div>
              <p>
                {listQuery.isFetching ? "Refreshing…" : `${totalItems.toLocaleString()} candidate${totalItems === 1 ? "" : "s"}`}
                {filters.groupBy && response?.groups.length ? ` · ${response.groups.length} groups` : ""}
              </p>
            </div>
            <div className="job-table-toolbar__filters">
              <select
                className="form-select"
                value={pageSize}
                onChange={(event) => updateParams((params) => {
                  params.set("pageSize", event.target.value);
                }, true)}
                aria-label="Candidates per page"
              >
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <option key={size} value={size}>
                    {size} per page
                  </option>
                ))}
              </select>
            </div>
          </div>

          {totalItems === 0 ? (
            <EmptyState
              title={activeFilters ? "No candidates match your filters" : "No candidates yet"}
              detail={
                activeFilters
                  ? "Try broadening your filters or clearing them to see the full talent pool."
                  : "Candidates will appear here after CVs are ingested into this workspace."
              }
              action={
                activeFilters ? (
                  <button className="button button--secondary" type="button" onClick={clearFilters}>
                    Clear filters
                  </button>
                ) : (
                  <Link className="button button--secondary" to="/search">
                    Go to Search
                  </Link>
                )
              }
            />
          ) : (
            <>
              <div className="candidate-list-table-scroll">
                <table className="candidate-list-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Stage</th>
                      <th>Applied role</th>
                      <th>Location</th>
                      <th>Source</th>
                      {showWorkspaceColumn ? <th>Workspace</th> : null}
                      <th>Last updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filters.groupBy
                      ? groupedSections.flatMap((section) => {
                          const collapsed = collapsedGroups.has(section.key);
                          const summaryCount = response?.groups.find((group) => group.key === section.key)?.count ?? section.items.length;
                          return [
                            <tr key={`group-${section.key}`} className="candidate-list-group-row">
                              <td colSpan={showWorkspaceColumn ? 7 : 6}>
                                <button
                                  className="candidate-list-group-toggle"
                                  type="button"
                                  onClick={() =>
                                    setCollapsedGroups((current) => {
                                      const next = new Set(current);
                                      if (next.has(section.key)) {
                                        next.delete(section.key);
                                      } else {
                                        next.add(section.key);
                                      }
                                      return next;
                                    })}
                                  aria-expanded={!collapsed}
                                >
                                  {collapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
                                  <strong>{section.label}</strong>
                                  <Tag>{summaryCount}</Tag>
                                </button>
                              </td>
                            </tr>,
                            ...(collapsed
                              ? []
                              : section.items.map((item) => (
                                  <CandidateRow key={`${item.tenantId}:${item.candidateId}`} item={item} showWorkspace={showWorkspaceColumn} />
                                ))),
                          ];
                        })
                      : items.map((item) => (
                          <CandidateRow key={`${item.tenantId}:${item.candidateId}`} item={item} showWorkspace={showWorkspaceColumn} />
                        ))}
                  </tbody>
                </table>
              </div>

              <div className="parsing-pagination">
                <span>
                  Showing {pageStart}-{pageEnd} of {totalItems.toLocaleString()} candidates
                </span>
                <div className="pagination-actions">
                  <button
                    className="button button--secondary"
                    type="button"
                    disabled={safePageIndex === 0}
                    onClick={() => updateParams((params) => params.set("page", String(safePageIndex)), false)}
                  >
                    <ChevronLeft size={14} />
                    Previous
                  </button>
                  <Tag>
                    Page {safePageIndex + 1} of {totalPages}
                  </Tag>
                  <button
                    className="button button--secondary"
                    type="button"
                    disabled={safePageIndex >= totalPages - 1}
                    onClick={() => updateParams((params) => params.set("page", String(safePageIndex + 2)), false)}
                  >
                    Next
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            </>
          )}
        </Panel>
      )}
    </div>
  );
}
