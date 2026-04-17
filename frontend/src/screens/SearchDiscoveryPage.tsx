import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, ArrowUp, BriefcaseBusiness, CheckCircle2, MapPin, Search, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { FilterMultiSelect } from "@/components/FilterMultiSelect";
import { defaultSearchQuery } from "@/data/mockData";
import type { SearchFilterOptions, SearchFilters, SearchResponse } from "@/lib/contracts";
import { platformApi } from "@/lib/platformApi";
import { deriveSearchFilters, parseSkillText } from "@/lib/queryIntent";
import { Avatar, EmptyState, PageIntro, Panel, ProgressBar, ScorePill, Tag } from "@/components/ui";

type SearchRequest = {
  query: string;
  filters: SearchFilters;
  offset: number;
  limit: number;
};

type SearchSortOption =
  | "best-match"
  | "experience-desc"
  | "experience-asc"
  | "name-asc"
  | "name-desc";

const PAGE_SIZE = 8;

export function SearchDiscoveryPage() {
  const queryInputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState("");
  const [seniority, setSeniority] = useState("");
  const [minYears, setMinYears] = useState(0);
  const [location, setLocation] = useState("");
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<SearchSortOption>("best-match");
  const [filterOptions, setFilterOptions] = useState<SearchFilterOptions | null>(null);
  const [response, setResponse] = useState<SearchResponse | null>(null);
  const [loadingInitial, setLoadingInitial] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [request, setRequest] = useState<SearchRequest | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const requestedOffsetsRef = useRef<Set<number>>(new Set());
  const hasExecutedSearch = request !== null;
  const sortedResults = useMemo(() => {
    const results = response?.results ?? [];

    switch (sortBy) {
      case "experience-desc":
        return [...results].sort((left, right) => right.yearsExperience - left.yearsExperience || right.matchScore - left.matchScore);
      case "experience-asc":
        return [...results].sort((left, right) => left.yearsExperience - right.yearsExperience || right.matchScore - left.matchScore);
      case "name-asc":
        return [...results].sort((left, right) => left.name.localeCompare(right.name));
      case "name-desc":
        return [...results].sort((left, right) => right.name.localeCompare(left.name));
      case "best-match":
      default:
        return results;
    }
  }, [response?.results, sortBy]);

  useEffect(() => {
    let cancelled = false;

    platformApi.getSearchFilterOptions().then((nextOptions) => {
      if (!cancelled) {
        setFilterOptions(nextOptions);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!request) {
      return;
    }

    let cancelled = false;
    const isFirstPage = request.offset === 0;
    setError(null);
    if (isFirstPage) {
      setLoadingInitial(true);
    } else {
      setLoadingMore(true);
    }

    platformApi
      .search(request.query, request.filters, {
        offset: request.offset,
        limit: request.limit,
      })
      .then((nextResponse) => {
        if (cancelled) {
          return;
        }
        startTransition(() => {
          setResponse((currentResponse) => {
            if (isFirstPage || !currentResponse) {
              return nextResponse;
            }

            const seenIds = new Set(currentResponse.results.map((candidate) => candidate.candidateId));
            const appendedResults = nextResponse.results.filter((candidate) => !seenIds.has(candidate.candidateId));

            return {
              ...nextResponse,
              results: [...currentResponse.results, ...appendedResults],
              meta: {
                ...nextResponse.meta,
                count: currentResponse.results.length + appendedResults.length,
              },
            };
          });
          setLoadingInitial(false);
          setLoadingMore(false);
        });
      })
      .catch((nextError) => {
        if (cancelled) {
          return;
        }
        if (!isFirstPage) {
          requestedOffsetsRef.current.delete(request.offset);
        }
        setError(String(nextError));
        setLoadingInitial(false);
        setLoadingMore(false);
      });

    return () => {
      cancelled = true;
    };
  }, [request]);

  useEffect(() => {
    if (!response?.nextCursor || loadingInitial || loadingMore || error) {
      return;
    }

    const sentinel = loadMoreRef.current;
    if (!sentinel) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting || !request || response.nextCursor === null) {
          return;
        }

        if (requestedOffsetsRef.current.has(response.nextCursor)) {
          return;
        }

        requestedOffsetsRef.current.add(response.nextCursor);
        setRequest({
          ...request,
          offset: response.nextCursor,
        });
      },
      {
        rootMargin: "320px 0px",
      },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadingInitial, loadingMore, request, response]);

  function handleExecute() {
    const normalizedQuery = query.trim();
    const hasStructuredInput = Boolean(seniority || minYears > 0 || location.trim() || selectedSkills.length);
    if (!normalizedQuery && !hasStructuredInput) {
      setError("Enter a title, skill, or filter to start searching.");
      return;
    }

    const derivedFilters = deriveSearchFilters(normalizedQuery, {
      seniority,
      minYearsExperience: minYears,
      location,
      skills: selectedSkills,
    });

    if (derivedFilters.seniority) {
      setSeniority(derivedFilters.seniority);
    }
    if (minYears === 0 && (derivedFilters.minYearsExperience ?? 0) > 0) {
      setMinYears(derivedFilters.minYearsExperience ?? 0);
    }
    setSelectedSkills(derivedFilters.skills ?? []);

    setError(null);
    setResponse(null);
    requestedOffsetsRef.current = new Set([0]);
    setRequest({
      query: normalizedQuery,
      filters: derivedFilters,
      offset: 0,
      limit: PAGE_SIZE,
    });
  }

  const topCompareHref =
    response && sortedResults.length >= 2
      ? `/compare?ids=${sortedResults
          .slice(0, 2)
          .map((candidate) => candidate.candidateId)
          .join(",")}`
      : null;

  return (
    <div className="page-stack">
      <PageIntro
        eyebrow={hasExecutedSearch ? "Retrieval-first workflow" : "Candidate search"}
        title={hasExecutedSearch ? "Discover talent. Synthesize fit." : "Search candidates"}
        description={
          hasExecutedSearch
            ? "Use natural language plus structured filters to retrieve evidence-backed candidates. Results stay grounded in chunk-level signals and recruiter-friendly score diagnostics."
            : undefined
        }
        actions={
          hasExecutedSearch && topCompareHref ? (
            <div className="skill-list">
              <Link className="button button--primary" to={topCompareHref}>
                Compare Top Matches
                <ArrowRight size={16} />
              </Link>
            </div>
          ) : undefined
        }
      />

      <form
        className="hero-grid"
        onSubmit={(event) => {
          event.preventDefault();
          handleExecute();
        }}
      >
        <Panel className="hero-panel">
          <div className="hero-panel__glow" />
          <div className="stack">
            {hasExecutedSearch ? <Tag tone="primary">Rank version {response?.meta.rankVersion ?? "v1"}</Tag> : null}
            <h2>{hasExecutedSearch ? "Natural language search over dossiers, chunks, and profile signals." : "Start with a title, skill, or seniority."}</h2>
            {hasExecutedSearch ? (
              <p>
                The online layer is retrieval-first: structured filters reduce the candidate pool, then evidence-driven ranking surfaces the strongest profiles with clear reasons.
              </p>
            ) : null}
          </div>

          <div className="search-toolbar">
            <div className="search-input">
              <Sparkles size={18} />
              <input ref={queryInputRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={defaultSearchQuery} />
            </div>
            <button className="button button--primary" type="submit" disabled={loadingInitial || loadingMore}>
              <Search size={16} />
              {loadingInitial ? "Searching..." : "Search"}
            </button>
          </div>
        </Panel>

        <Panel className="filters-panel">
          <div className="panel__section">
            <span className="eyebrow">Structured filters</span>
            {hasExecutedSearch ? <p>Separate deterministic narrowing from semantic retrieval so the ranking layer stays explainable.</p> : null}
          </div>

          <label className="panel__section">
            <span>Seniority</span>
            <select className="form-select" value={seniority} onChange={(event) => setSeniority(event.target.value)}>
              <option value="">Any</option>
              {(filterOptions?.seniority ?? []).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <p className="muted">Options are loaded from the indexed candidate corpus.</p>
          </label>

          <label className="panel__section">
            <span>Minimum experience</span>
            <input className="form-input" type="number" value={minYears} min={0} onChange={(event) => setMinYears(Number(event.target.value))} />
          </label>

          <label className="panel__section">
            <span>Location hint</span>
            <input className="form-input" value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Optional city or region" />
          </label>

          <label className="panel__section">
            <span>Skills</span>
            <FilterMultiSelect
              options={filterOptions?.skills ?? []}
              values={selectedSkills}
              onChange={setSelectedSkills}
              placeholder="Add skills from the index or type your own"
              searchPlaceholder="Search indexed skills or type to add"
              normalizeInput={parseSkillText}
              emptyLabel="No indexed skills match the current search"
            />
            <p className="muted">Indexed skills come from Supabase. Typed values are still normalized into canonical search tokens.</p>
          </label>
        </Panel>
      </form>

      {!hasExecutedSearch ? null : loadingInitial ? (
        <EmptyState title="Searching candidates" detail="Applying structured filters, then ranking the candidate pool against semantic and skill signals." />
      ) : error && !response?.results.length ? (
        <EmptyState title="Search failed" detail={error} />
      ) : !response?.results.length ? (
        <EmptyState
          title="No candidates found"
          detail="The search ran successfully, but there are no indexed candidates matching the current query and filters yet."
        />
      ) : (
        <>
          <Panel className="search-summary-bar">
            <div>
              <strong>Loaded {response.results.length} ranked candidates</strong>
              <p>
                Results append automatically as you scroll. Sort applies to the loaded result set without changing the active search frame.
              </p>
            </div>

            <div className="search-summary-bar__controls">
              <label className="search-sort">
                <span>Sort by</span>
                <select className="form-select" value={sortBy} onChange={(event) => setSortBy(event.target.value as SearchSortOption)}>
                  <option value="best-match">Best match</option>
                  <option value="experience-desc">Most experience</option>
                  <option value="experience-asc">Least experience</option>
                  <option value="name-asc">Name A-Z</option>
                  <option value="name-desc">Name Z-A</option>
                </select>
              </label>
              <Tag tone={response.nextCursor === null ? "success" : "primary"}>
                {response.nextCursor === null ? "All loaded" : "Infinite scroll active"}
              </Tag>
            </div>
          </Panel>

          <div className="candidate-results">
            {sortedResults.map((candidate) => {
              const partnerId = sortedResults.find((item) => item.candidateId !== candidate.candidateId)?.candidateId;

              return (
                <Panel key={candidate.candidateId} className="candidate-card">
                  <div className="candidate-card__header">
                    <div className="candidate-card__identity">
                      <Avatar name={candidate.name} hue={candidate.avatarHue} />
                      <div className="stack">
                        <h3>{candidate.name}</h3>
                        <p>{candidate.currentTitle}</p>
                        <div className="skill-list">
                          <Tag>{candidate.seniority}</Tag>
                          <Tag>{candidate.primaryRole}</Tag>
                          <Tag tone="success">{candidate.stage}</Tag>
                        </div>
                      </div>
                    </div>
                    <ScorePill score={candidate.matchScore} />
                  </div>

                  <div className="meta-list">
                    <span className="tag">
                      <MapPin size={14} />
                      {candidate.location}
                    </span>
                    <span className="tag">
                      <BriefcaseBusiness size={14} />
                      {candidate.yearsExperience} years
                    </span>
                  </div>

                  <div className="signal-list">
                    <div className="signal-row">
                      <strong>Semantic alignment</strong>
                      <span>{Math.round(candidate.matchSignals.semantic * 100)}%</span>
                    </div>
                    <ProgressBar value={candidate.matchSignals.semantic * 100} />

                    <div className="signal-row">
                      <strong>Skill overlap</strong>
                      <span>{Math.round(candidate.matchSignals.skill * 100)}%</span>
                    </div>
                    <ProgressBar value={candidate.matchSignals.skill * 100} tone="secondary" />

                    <div className="signal-row">
                      <strong>Experience match</strong>
                      <span>{Math.round(candidate.matchSignals.experience * 100)}%</span>
                    </div>
                    <ProgressBar value={candidate.matchSignals.experience * 100} tone="tertiary" />
                  </div>

                  <div className="skill-list">
                    {candidate.topSkills.slice(0, 5).map((skill) => (
                      <Tag key={skill} tone="primary">
                        {skill}
                      </Tag>
                    ))}
                  </div>

                  <div className="skill-list">
                    <Link
                      className="button button--secondary"
                      to={`/dossier/${candidate.candidateId}`}
                      state={{
                        searchMatchScore: candidate.matchScore,
                        searchMatchSignals: candidate.matchSignals,
                        searchQuery: request?.query ?? query,
                      }}
                    >
                      View Dossier
                    </Link>
                    {partnerId ? (
                      <Link className="button button--primary" to={`/compare?ids=${candidate.candidateId},${partnerId}`}>
                        Compare
                      </Link>
                    ) : null}
                  </div>
                </Panel>
              );
            })}
          </div>

          <div ref={loadMoreRef} className="infinite-scroll-sentinel">
            {error ? (
              <Panel className="infinite-scroll-panel">
                <strong>Could not load more results</strong>
                <p>{error}</p>
                {request && response.nextCursor !== null ? (
                  <button
                    className="button button--secondary"
                    type="button"
                    onClick={() => {
                      requestedOffsetsRef.current.add(response.nextCursor as number);
                      setRequest({
                        ...request,
                        offset: response.nextCursor as number,
                      });
                    }}
                  >
                    Retry
                  </button>
                ) : null}
              </Panel>
            ) : loadingMore ? (
              <Panel className="infinite-scroll-panel">
                <strong>Loading more candidates</strong>
                <p>Fetching the next ranked slice from the search index.</p>
              </Panel>
            ) : response.nextCursor !== null ? (
              <Panel className="infinite-scroll-panel">
                <strong>Keep scrolling</strong>
                <p>The next page will load automatically as this section enters the viewport.</p>
              </Panel>
            ) : (
              <Panel className="infinite-scroll-panel infinite-scroll-panel--complete">
                <div className="infinite-scroll-panel__badge">
                  <CheckCircle2 size={16} />
                  <span>Search complete</span>
                </div>
                <strong>{response.results.length} ranked candidates loaded</strong>
                <p>You’ve reached the end of this ranked result set. Broaden the search frame or adjust filters to surface more profiles.</p>
                <div className="infinite-scroll-panel__actions">
                  <button
                    className="button button--secondary"
                    type="button"
                    onClick={() => {
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                  >
                    <ArrowUp size={14} />
                    Back to Top
                  </button>
                  <button
                    className="button button--secondary"
                    type="button"
                    onClick={() => {
                      window.scrollTo({ top: 0, behavior: "smooth" });
                      window.setTimeout(() => queryInputRef.current?.focus(), 180);
                    }}
                  >
                    Refine Search
                  </button>
                </div>
              </Panel>
            )}
          </div>
        </>
      )}
    </div>
  );
}
