import type { SearchFilters } from "@/lib/contracts";

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
