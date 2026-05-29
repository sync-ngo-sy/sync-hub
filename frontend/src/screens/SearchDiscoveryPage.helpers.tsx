import { useEffect, useMemo, useState } from "react";
import { Search, Sparkles, Users } from "lucide-react";
import { Panel } from "@/components/ui";
import type { SearchFilters } from "@/lib/contracts";
import { deriveSearchFilters } from "@/lib/queryIntent";

export type SearchRequest = {
  query: string;
  filters: SearchFilters;
  offset: number;
  limit: number;
};

export type SearchSortOption =
  | "best-match"
  | "experience-desc"
  | "experience-asc"
  | "name-asc"
  | "name-desc";

export const PAGE_SIZE = 8;
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

export function readStoredSearchState(): StoredSearchState {
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

export function writeStoredSearchState(request: SearchRequest | null, sortBy: SearchSortOption) {
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

export function shortlistKey(tenantId: string, candidateId: string) {
  return `${tenantId}:${candidateId}`;
}

function csvCell(value: unknown) {
  const normalized = Array.isArray(value) ? value.join("; ") : String(value ?? "");
  return `"${normalized.replace(/"/g, '""')}"`;
}

export function downloadCsv(filename: string, rows: unknown[][]) {
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

export function SearchProcessingState({ request }: { request: SearchRequest }) {
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
