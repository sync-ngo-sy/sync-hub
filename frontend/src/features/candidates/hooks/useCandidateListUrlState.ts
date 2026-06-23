import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { FILTER_PARAM_KEYS } from "@/features/candidates/constants";
import { parsePageSize, readFilters } from "@/features/candidates/candidateListState";
import type { CandidateListFilterOptions } from "@/lib/contracts";

type UpdateParamsHandler = (mutate: (params: URLSearchParams) => void, resetPage?: boolean) => void;

export function useCandidateListUrlState() {
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = useMemo(() => readFilters(searchParams), [searchParams]);
  const pageSize = parsePageSize(searchParams.get("pageSize"));
  const pageIndex = Math.max(0, Number(searchParams.get("page") ?? "1") - 1);
  const [queryInput, setQueryInput] = useState(filters.query ?? "");

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

  const updateParams: UpdateParamsHandler = (mutate, resetPage = true) => {
    const next = new URLSearchParams(searchParams);
    mutate(next);
    if (resetPage) {
      next.set("page", "1");
    }
    setSearchParams(next, { replace: true });
  };

  const clearFilters = () => {
    const next = new URLSearchParams(searchParams);
    FILTER_PARAM_KEYS.forEach((key) => next.delete(key));
    next.set("page", "1");
    setQueryInput("");
    setSearchParams(next, { replace: true });
  };

  return {
    filters,
    pageSize,
    pageIndex,
    queryInput,
    setQueryInput,
    updateParams,
    clearFilters,
  };
}

export type CandidateListUrlState = ReturnType<typeof useCandidateListUrlState>;

export type CandidateListFiltersPanelProps = {
  filters: CandidateListUrlState["filters"];
  queryInput: string;
  filterOptions?: CandidateListFilterOptions;
  activeFilters: boolean;
  onQueryInputChange: (value: string) => void;
  onUpdateParams: UpdateParamsHandler;
  onClearFilters: () => void;
};
