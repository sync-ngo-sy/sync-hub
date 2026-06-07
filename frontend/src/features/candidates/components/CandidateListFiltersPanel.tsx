import { Filter, Search, X } from "lucide-react";
import { Panel, Tag } from "@/components/ui";
import { GROUP_BY_OPTIONS } from "@/features/candidates/constants";
import type { CandidateListFiltersPanelProps } from "@/features/candidates/hooks/useCandidateListUrlState";

export function CandidateListFiltersPanel({
  filters,
  queryInput,
  filterOptions,
  activeFilters,
  onQueryInputChange,
  onUpdateParams,
  onClearFilters,
}: CandidateListFiltersPanelProps) {
  return (
    <Panel className="candidate-list-filters">
      <div className="candidate-list-filters__header">
        <div className="skill-list">
          <Filter size={16} />
          <h2>Filters</h2>
        </div>
        {activeFilters ? (
          <button className="button button--ghost" type="button" onClick={onClearFilters}>
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
            onChange={(event) => onQueryInputChange(event.target.value)}
            placeholder="Search name or email"
            aria-label="Search candidates by name or email"
          />
        </label>

        <select
          className="form-select"
          value={filters.status ?? ""}
          onChange={(event) => onUpdateParams((params) => {
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
          onChange={(event) => onUpdateParams((params) => {
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
          onChange={(event) => onUpdateParams((params) => {
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
          onChange={(event) => onUpdateParams((params) => {
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
          onChange={(event) => onUpdateParams((params) => {
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
          onChange={(event) => onUpdateParams((params) => {
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
          onChange={(event) => onUpdateParams((params) => {
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
  );
}
