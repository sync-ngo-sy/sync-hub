import { useEffect, useMemo } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { buildGroupedSections, hasActiveFilters } from "@/features/candidates/candidateListState";
import type { CandidateListUrlState } from "@/features/candidates/hooks/useCandidateListUrlState";
import { platformApi } from "@/lib/platformApi";

type UseCandidateListDataOptions = {
  resolvedTenantIds: string[];
  filters: CandidateListUrlState["filters"];
  pageSize: number;
  pageIndex: number;
};

export function useCandidateListData({ resolvedTenantIds, filters, pageSize, pageIndex }: UseCandidateListDataOptions) {
  const [searchParams, setSearchParams] = useSearchParams();
  const scopeKey = resolvedTenantIds.join("|");

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
  const groupedSections = useMemo(
    () => buildGroupedSections(items, filters.groupBy, response?.groups),
    [filters.groupBy, items, response?.groups],
  );

  useEffect(() => {
    if (pageIndex !== safePageIndex && totalItems > 0) {
      const next = new URLSearchParams(searchParams);
      next.set("page", String(safePageIndex + 1));
      setSearchParams(next, { replace: true });
    }
  }, [pageIndex, safePageIndex, searchParams, setSearchParams, totalItems]);

  return {
    listQuery,
    response,
    items,
    totalItems,
    totalPages,
    safePageIndex,
    pageStart,
    pageEnd,
    activeFilters,
    groupedSections,
  };
}
