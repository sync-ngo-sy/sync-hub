import { useEffect, useMemo, useState } from "react";
import { PAGE_SIZE, SIMULATOR_STAGES, type SearchSimulatorView } from "@/features/search-configuration/searchSimulator.constants";
import { buildStageNarrative, hasSearchSimulatorInput } from "@/features/search-configuration/searchSimulator.helpers";
import type { SearchDebugResponse, SearchFilterOptions, SearchFilters } from "@/lib/contracts";
import { platformApi } from "@/lib/platformApi";

type UseSearchSimulatorOptions = {
  resolvedTenantIds: string[];
};

export function useSearchSimulator({ resolvedTenantIds }: UseSearchSimulatorOptions) {
  const [query, setQuery] = useState("Laila Abbas");
  const [seniority, setSeniority] = useState("");
  const [minYears, setMinYears] = useState(0);
  const [location, setLocation] = useState("");
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [selectedCompanies, setSelectedCompanies] = useState<string[]>([]);
  const [filterOptions, setFilterOptions] = useState<SearchFilterOptions | null>(null);
  const [response, setResponse] = useState<SearchDebugResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeStage, setActiveStage] = useState(0);
  const [completedCount, setCompletedCount] = useState(0);
  const [animationTick, setAnimationTick] = useState(0);
  const [activeView, setActiveView] = useState<SearchSimulatorView>("overview");

  useEffect(() => {
    let cancelled = false;
    platformApi.getSearchFilterOptions(resolvedTenantIds).then((nextOptions) => {
      if (!cancelled) {
        setFilterOptions(nextOptions);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [resolvedTenantIds]);

  useEffect(() => {
    if (!loading) {
      return;
    }

    setCompletedCount(0);
    setActiveStage(0);

    const interval = window.setInterval(() => {
      setActiveStage((current) => (current + 1) % SIMULATOR_STAGES.length);
    }, 700);

    return () => window.clearInterval(interval);
  }, [loading]);

  useEffect(() => {
    if (!response) {
      return;
    }

    setCompletedCount(0);
    const timers = SIMULATOR_STAGES.map((_, index) =>
      window.setTimeout(() => {
        setCompletedCount(index + 1);
      }, 140 * (index + 1)),
    );

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [animationTick, response]);

  const activeFilters = useMemo<SearchFilters>(
    () => ({
      seniority,
      minYearsExperience: minYears,
      location,
      skills: selectedSkills,
      companies: selectedCompanies,
    }),
    [location, minYears, selectedCompanies, selectedSkills, seniority],
  );
  const stageNarrative = useMemo(() => buildStageNarrative(response), [response]);

  async function runSimulation() {
    const normalizedQuery = query.trim();
    if (!hasSearchSimulatorInput(normalizedQuery, activeFilters)) {
      setError("Enter a text query or at least one explicit filter to simulate search.");
      return;
    }

    setLoading(true);
    setError(null);
    setResponse(null);

    try {
      const nextResponse = await platformApi.searchDebug(
        normalizedQuery,
        activeFilters,
        {
          limit: PAGE_SIZE,
          offset: 0,
        },
        resolvedTenantIds,
      );

      setResponse(nextResponse);
      setActiveView("overview");
      setAnimationTick((current) => current + 1);
    } catch (nextError) {
      setError(String(nextError));
    } finally {
      setLoading(false);
    }
  }

  function resetSimulation() {
    setQuery("");
    setSeniority("");
    setMinYears(0);
    setLocation("");
    setSelectedSkills([]);
    setSelectedCompanies([]);
    setError(null);
    setResponse(null);
  }

  return {
    activeStage,
    activeView,
    completedCount,
    error,
    filterOptions,
    loading,
    location,
    minYears,
    query,
    response,
    selectedCompanies,
    selectedSkills,
    seniority,
    setActiveView,
    setLocation,
    setMinYears,
    setQuery,
    setSelectedCompanies,
    setSelectedSkills,
    setSeniority,
    stageNarrative,
    resetSimulation,
    runSimulation,
  };
}
