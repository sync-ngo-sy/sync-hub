import { FlaskConical } from "lucide-react";
import { FilterMultiSelect } from "@/components/FilterMultiSelect";
import { PickerDropdown } from "@/components/PickerDropdown";
import { Panel, Tag } from "@/components/ui";
import type { SearchFilterOptions } from "@/lib/contracts";
import { parseSkillText } from "@/lib/queryIntent";

type SearchSimulatorControlsProps = {
  error: string | null;
  filterOptions: SearchFilterOptions | null;
  loading: boolean;
  location: string;
  minYears: number;
  query: string;
  selectedCompanies: string[];
  selectedSkills: string[];
  seniority: string;
  onChangeLocation: (value: string) => void;
  onChangeMinYears: (value: number) => void;
  onChangeQuery: (value: string) => void;
  onChangeSelectedCompanies: (values: string[]) => void;
  onChangeSelectedSkills: (values: string[]) => void;
  onChangeSeniority: (value: string) => void;
  onReset: () => void;
  onRun: () => Promise<void>;
};

export function SearchSimulatorControls({
  error,
  filterOptions,
  loading,
  location,
  minYears,
  query,
  selectedCompanies,
  selectedSkills,
  seniority,
  onChangeLocation,
  onChangeMinYears,
  onChangeQuery,
  onChangeSelectedCompanies,
  onChangeSelectedSkills,
  onChangeSeniority,
  onReset,
  onRun,
}: SearchSimulatorControlsProps) {
  return (
    <Panel className="simulator-panel simulator-panel--controls">
      <div className="simulator-panel__header">
        <div>
          <Tag tone="primary">Live request</Tag>
          <h2>Replay the full search request exactly as the frontend sends it.</h2>
        </div>
      </div>

      <label className="panel__section">
        <span>Text query</span>
        <textarea
          className="form-textarea simulator-query"
          value={query}
          onChange={(event) => onChangeQuery(event.target.value)}
          placeholder="Senior backend engineer with Node.js and GraphQL"
        />
      </label>

      <div className="simulator-filters-grid">
        <label className="panel__section">
          <span>Seniority</span>
          <PickerDropdown
            value={seniority}
            options={filterOptions?.seniority ?? []}
            onChange={onChangeSeniority}
            placeholder="Any seniority"
            emptyLabel="No seniority values available"
          />
        </label>

        <label className="panel__section">
          <span>Min years</span>
          <input
            className="form-input"
            type="number"
            min={0}
            value={minYears}
            onChange={(event) => onChangeMinYears(Number(event.target.value) || 0)}
          />
        </label>
      </div>

      <label className="panel__section">
        <span>Location</span>
        <PickerDropdown
          value={location}
          options={(filterOptions?.locations ?? []).map((option) => ({ value: option, label: option }))}
          onChange={onChangeLocation}
          placeholder="Any location"
          emptyLabel="No indexed locations available"
        />
      </label>

      <label className="panel__section">
        <span>Skills</span>
        <FilterMultiSelect
          options={filterOptions?.skills ?? []}
          values={selectedSkills}
          onChange={onChangeSelectedSkills}
          placeholder="Add strict required skills"
          searchPlaceholder="Search skills"
          normalizeInput={parseSkillText}
        />
      </label>

      <label className="panel__section">
        <span>Companies</span>
        <FilterMultiSelect
          options={filterOptions?.companies ?? []}
          values={selectedCompanies}
          onChange={onChangeSelectedCompanies}
          placeholder="Add current or past companies"
          searchPlaceholder="Search companies"
        />
      </label>

      <div className="simulator-actions">
        <button className="button button--primary" type="button" onClick={() => void onRun()} disabled={loading}>
          <FlaskConical size={14} />
          {loading ? "Running..." : "Run simulation"}
        </button>
        <button className="button button--secondary" type="button" onClick={onReset}>
          Reset
        </button>
      </div>

      {error ? <p className="simulator-error">{error}</p> : null}
    </Panel>
  );
}
