import type { FormEvent, RefObject } from "react";
import { Search, SlidersHorizontal, Sparkles, X } from "lucide-react";
import { FilterMultiSelect } from "@/components/FilterMultiSelect";
import { PickerDropdown } from "@/components/PickerDropdown";
import { Panel } from "@/components/ui";
import type { SearchFilterOptions } from "@/lib/contracts";
import { parseSkillText } from "@/lib/queryIntent";

const DEFAULT_SEARCH_PLACEHOLDER = "engineer OR developer";

type SearchCommandPanelProps = {
  activeFilterCount: number;
  companies: string[];
  filterOptions: SearchFilterOptions | null;
  filtersOpen: boolean;
  loading: boolean;
  location: string;
  minYears: number;
  query: string;
  queryInputRef: RefObject<HTMLInputElement>;
  seniority: string;
  skills: string[];
  onClearFilters: () => void;
  onExecute: () => void;
  onSetCompanies: (values: string[]) => void;
  onSetFiltersOpen: (open: boolean) => void;
  onSetLocation: (value: string) => void;
  onSetMinYears: (value: number) => void;
  onSetQuery: (value: string) => void;
  onSetSeniority: (value: string) => void;
  onSetSkills: (values: string[]) => void;
};

export function SearchCommandPanel({
  activeFilterCount,
  companies,
  filterOptions,
  filtersOpen,
  loading,
  location,
  minYears,
  query,
  queryInputRef,
  seniority,
  skills,
  onClearFilters,
  onExecute,
  onSetCompanies,
  onSetFiltersOpen,
  onSetLocation,
  onSetMinYears,
  onSetQuery,
  onSetSeniority,
  onSetSkills,
}: SearchCommandPanelProps) {
  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    onExecute();
  }

  return (
    <form className="search-console-form" onSubmit={handleSubmit}>
      <Panel className="search-command-panel">
        <div className="search-command-bar">
          <label className="search-field">
            <Sparkles size={18} />
            <input ref={queryInputRef} aria-label="Search candidates" value={query} onChange={(event) => onSetQuery(event.target.value)} placeholder={DEFAULT_SEARCH_PLACEHOLDER} />
          </label>
          <button
            className="button button--secondary search-filter-toggle"
            type="button"
            aria-expanded={filtersOpen}
            aria-controls="search-filter-region"
            onClick={() => onSetFiltersOpen(!filtersOpen)}
          >
            <SlidersHorizontal size={16} />
            Filters
            {activeFilterCount ? <strong>{activeFilterCount}</strong> : null}
          </button>
          <button className="button button--primary search-submit-button" type="submit" disabled={loading}>
            <Search size={16} />
            {loading ? "Searching..." : "Search"}
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
                <button className="button button--secondary button--compact" type="button" onClick={onClearFilters}>
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
                  onChange={onSetSeniority}
                  placeholder="Any seniority"
                  emptyLabel="No seniority values available"
                />
              </label>

              <label className="search-filter-field">
                <span>Min years</span>
                <input className="form-input" type="number" value={minYears} min={0} onChange={(event) => onSetMinYears(Number(event.target.value))} />
              </label>

              <label className="search-filter-field">
                <span>Location</span>
                <PickerDropdown
                  value={location}
                  options={(filterOptions?.locations ?? []).map((option) => ({ value: option, label: option }))}
                  onChange={onSetLocation}
                  placeholder="Any location"
                  emptyLabel="No indexed locations available"
                />
              </label>

              <label className="search-filter-field search-filter-field--wide">
                <span>Skills</span>
                <FilterMultiSelect
                  options={filterOptions?.skills ?? []}
                  values={skills}
                  onChange={onSetSkills}
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
                  values={companies}
                  onChange={onSetCompanies}
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
  );
}
