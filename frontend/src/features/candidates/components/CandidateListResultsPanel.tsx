import { useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { EmptyState, Panel, Tag } from "@/components/ui";
import { CandidateListRow } from "@/features/candidates/components/CandidateListRow";
import { PAGE_SIZE_OPTIONS } from "@/features/candidates/constants";
import type { CandidateListGroupSection } from "@/features/candidates/types";
import type { CandidateListFilters, CandidateListGroup, CandidateListItem } from "@/lib/contracts";
import type { CandidateListUrlState } from "@/features/candidates/hooks/useCandidateListUrlState";

type CandidateListResultsPanelProps = {
  filters: CandidateListFilters;
  items: CandidateListItem[];
  groupedSections: CandidateListGroupSection[];
  groups?: CandidateListGroup[];
  totalItems: number;
  totalPages: number;
  safePageIndex: number;
  pageStart: number;
  pageEnd: number;
  pageSize: number;
  activeFilters: boolean;
  isFetching: boolean;
  showWorkspaceColumn: boolean;
  onUpdateParams: CandidateListUrlState["updateParams"];
  onClearFilters: () => void;
};

export function CandidateListResultsPanel({
  filters,
  items,
  groupedSections,
  groups,
  totalItems,
  totalPages,
  safePageIndex,
  pageStart,
  pageEnd,
  pageSize,
  activeFilters,
  isFetching,
  showWorkspaceColumn,
  onUpdateParams,
  onClearFilters,
}: CandidateListResultsPanelProps) {
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  return (
    <Panel className="table-card candidate-list-panel">
      <div className="job-table-toolbar">
        <div>
          <div className="skill-list">
            <Users size={16} />
            <h2>Candidate directory</h2>
          </div>
          <p>
            {isFetching ? "Refreshing…" : `${totalItems.toLocaleString()} candidate${totalItems === 1 ? "" : "s"}`}
            {filters.groupBy && groups?.length ? ` · ${groups.length} groups` : ""}
          </p>
        </div>
        <div className="job-table-toolbar__filters">
          <select
            className="form-select"
            value={pageSize}
            onChange={(event) => onUpdateParams((params) => {
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
              <button className="button button--secondary" type="button" onClick={onClearFilters}>
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
                      const summaryCount = groups?.find((group) => group.key === section.key)?.count ?? section.items.length;
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
                              <CandidateListRow key={`${item.tenantId}:${item.candidateId}`} item={item} showWorkspace={showWorkspaceColumn} />
                            ))),
                      ];
                    })
                  : items.map((item) => (
                      <CandidateListRow key={`${item.tenantId}:${item.candidateId}`} item={item} showWorkspace={showWorkspaceColumn} />
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
                onClick={() => onUpdateParams((params) => params.set("page", String(safePageIndex)), false)}
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
                onClick={() => onUpdateParams((params) => params.set("page", String(safePageIndex + 2)), false)}
              >
                Next
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </>
      )}
    </Panel>
  );
}
