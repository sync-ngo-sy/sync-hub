import type { CandidateListFilters, CandidateListGroup, CandidateListItem } from "@/lib/contracts";
import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS } from "@/features/candidates/constants";
import type { CandidateListGroupSection } from "@/features/candidates/types";

export function formatUpdatedAt(value: string) {
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

export function parsePageSize(value: string | null) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_PAGE_SIZE;
  }
  return PAGE_SIZE_OPTIONS.includes(parsed as (typeof PAGE_SIZE_OPTIONS)[number]) ? parsed : DEFAULT_PAGE_SIZE;
}

export function readFilters(params: URLSearchParams): CandidateListFilters {
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

export function hasActiveFilters(filters: CandidateListFilters) {
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

export function buildGroupedSections(
  items: CandidateListItem[],
  groupBy: CandidateListFilters["groupBy"],
  groups: CandidateListGroup[] | undefined,
): CandidateListGroupSection[] {
  if (!groupBy) {
    return [{ key: "__all__", label: "", count: items.length, items }];
  }

  const sections: CandidateListGroupSection[] = [];
  for (const item of items) {
    const key = item.groupKey ?? "unknown";
    const label = item.groupLabel ?? key;
    const current = sections[sections.length - 1];
    if (current?.key === key) {
      current.items.push(item);
      continue;
    }
    const summary = groups?.find((group) => group.key === key);
    sections.push({
      key,
      label,
      count: summary?.count ?? 1,
      items: [item],
    });
  }
  return sections;
}
