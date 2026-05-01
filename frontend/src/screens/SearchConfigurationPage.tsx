import { useEffect, useMemo, useState } from "react";
import { ArrowRight, BrainCircuit, DatabaseZap, FlaskConical, GitCompareArrows, SearchCheck, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { FilterMultiSelect } from "@/components/FilterMultiSelect";
import { PickerDropdown } from "@/components/PickerDropdown";
import { PlatformScopeControl } from "@/components/PlatformScopeControl";
import { EmptyState, PageIntro, Panel, Tag } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import type { SearchDebugResponse, SearchFilterOptions, SearchFilters } from "@/lib/contracts";
import { platformApi } from "@/lib/platformApi";
import { usePlatformScope } from "@/lib/platformScope";
import { parseSkillText } from "@/lib/queryIntent";

const PAGE_SIZE = 12;
const SIMULATOR_VIEWS = [
  { id: "overview", label: "Overview" },
  { id: "results", label: "Ranked results" },
  { id: "internals", label: "Advanced internals" },
] as const;

const SIMULATOR_STAGES = [
  {
    id: "request",
    label: "Normalize request",
    icon: SearchCheck,
    description: "Normalize explicit filters, scope, and request shape before any retrieval runs.",
  },
  {
    id: "intent",
    label: "Extract intent",
    icon: BrainCircuit,
    description: "Use LLM or rule-based extraction to convert the text query into structured ranking intent.",
  },
  {
    id: "embedding",
    label: "Build embedding",
    icon: Sparkles,
    description: "Generate the query vector that semantic retrieval uses against stored chunk embeddings.",
  },
  {
    id: "retrieve",
    label: "Retrieve candidates",
    icon: DatabaseZap,
    description: "Apply strict filters, run lexical and semantic retrieval, and collect candidate evidence.",
  },
  {
    id: "rank",
    label: "Rank response",
    icon: GitCompareArrows,
    description: "Fuse chunk, name, skill, seniority, and experience signals into the final ordered shortlist.",
  },
] as const;

function prettyJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function formatList(values: string[]) {
  return values.length ? values.join(", ") : "none";
}

function formatFilterValue(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return "none";
  }
  return String(value);
}

function formatSubscoreLabel(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function topReasons(subscores: Record<string, number>) {
  return Object.entries(subscores)
    .filter(([, value]) => value > 0)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 3);
}

function stageStatus(index: number, activeStage: number, completedCount: number, loading: boolean) {
  if (loading) {
    if (index === activeStage) {
      return "active";
    }
    if (index < activeStage) {
      return "complete";
    }
    return "pending";
  }

  if (completedCount > index) {
    return "complete";
  }

  return "pending";
}

export function SearchConfigurationPage() {
  const { isAdmin } = useAuth();
  const {
    currentWorkspace,
    isPlatformAdmin,
    resolvedTenantIds,
    scopeMode,
    setScopeMode,
    setWorkspaceId,
    workspaceOptions,
  } = usePlatformScope();
  const workspaceNameById = useMemo(
    () => new Map(workspaceOptions.map((workspace) => [workspace.id, workspace.name])),
    [workspaceOptions],
  );

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
  const [activeView, setActiveView] = useState<(typeof SIMULATOR_VIEWS)[number]["id"]>("overview");

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
      }, 140 * (index + 1))
    );

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [animationTick, response]);

  const activeFilters: SearchFilters = {
    seniority,
    minYearsExperience: minYears,
    location,
    skills: selectedSkills,
    companies: selectedCompanies,
  };

  const stageNarrative = useMemo(() => {
    if (!response) {
      return SIMULATOR_STAGES.map((stage) => stage.description);
    }

    return [
      `Scope: ${response.request.tenantIds.length ? `${response.request.tenantIds.length} workspace(s)` : "all visible workspaces"} · Filters: ${
        response.analysis.engine.strictFilters.length ? response.analysis.engine.strictFilters.join(", ") : "none"
      }`,
      `Intent source: ${response.analysis.intentSource}. Resolved role=${response.analysis.resolvedIntent.role ?? "none"}, seniority=${response.analysis.resolvedIntent.seniority ?? "none"}, skills=${
        response.analysis.resolvedIntent.skills.length ? response.analysis.resolvedIntent.skills.join(", ") : "none"
      }, companies=${
        response.analysis.resolvedIntent.companies.length ? response.analysis.resolvedIntent.companies.join(", ") : "none"
      }`,
      `Embedding provider: ${response.analysis.embedding.provider} · version=${response.analysis.embedding.version ?? "n/a"} · dimensions=${response.analysis.embedding.dimensions}`,
      `Lexical=${response.analysis.engine.usesLexical ? "on" : "off"} · Semantic=${response.analysis.engine.usesSemantic ? "on" : "off"} · Returned ${response.meta.count} result(s)`,
      `Rank version ${response.meta.rankVersion}. Name boost=${response.analysis.engine.usesNameBoost ? "on" : "off"}`,
    ];
  }, [response]);

  const topResult = response?.results[0] ?? null;
  const strictFilters = response?.analysis.engine.strictFilters ?? [];
  const embeddingLabel = response
    ? `${response.analysis.embedding.provider} · ${response.analysis.embedding.dimensions} dims`
    : "Not run yet";
  const resolvedIntentSummary = response
    ? [
        response.analysis.resolvedIntent.role ? `role ${response.analysis.resolvedIntent.role}` : null,
        response.analysis.resolvedIntent.seniority ? `seniority ${response.analysis.resolvedIntent.seniority}` : null,
        response.analysis.resolvedIntent.minYearsExperience !== null ? `min ${response.analysis.resolvedIntent.minYearsExperience}+ years` : null,
        response.analysis.resolvedIntent.location ? `location ${response.analysis.resolvedIntent.location}` : null,
        response.analysis.resolvedIntent.skills.length ? `skills ${response.analysis.resolvedIntent.skills.join(", ")}` : null,
        response.analysis.resolvedIntent.companies.length ? `companies ${response.analysis.resolvedIntent.companies.join(", ")}` : null,
      ].filter(Boolean).join(" · ")
    : "";
  const topReasonsForTopResult = topResult ? topReasons(topResult.subscores) : [];

  if (!isAdmin) {
    return (
      <div className="page-stack">
        <EmptyState title="Admin only" detail="Search simulation is restricted to platform admins because it exposes raw ranking diagnostics and request internals." />
      </div>
    );
  }

  async function handleRun() {
    const normalizedQuery = query.trim();
    const hasStructuredInput = Boolean(seniority || minYears > 0 || location.trim() || selectedSkills.length || selectedCompanies.length);
    if (!normalizedQuery && !hasStructuredInput) {
      setError("Enter a text query or at least one explicit filter to simulate search.");
      return;
    }

    setLoading(true);
    setError(null);
    setResponse(null);

    try {
      const nextResponse = await platformApi.searchDebug(normalizedQuery, activeFilters, {
        limit: PAGE_SIZE,
        offset: 0,
      }, resolvedTenantIds);

      setResponse(nextResponse);
      setActiveView("overview");
      setAnimationTick((current) => current + 1);
    } catch (nextError) {
      setError(String(nextError));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page-stack">
      <PageIntro
        eyebrow="Operator diagnostics"
        title="Search Simulator"
        description="Run the live search stack with exact request internals, resolved intent, embedding diagnostics, and raw ranked items. This page is for debugging retrieval quality, not recruiter-facing search."
        actions={(
          <Link className="button button--secondary" to="/search">
            Launch Search
            <ArrowRight size={14} />
          </Link>
        )}
      />

      <PlatformScopeControl
        isPlatformAdmin={isPlatformAdmin}
        scopeMode={scopeMode}
        onChangeScopeMode={setScopeMode}
        currentWorkspace={currentWorkspace}
        workspaceOptions={workspaceOptions}
        onChangeWorkspace={setWorkspaceId}
      />

      <div className="simulator-layout">
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
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Senior backend engineer with Node.js and GraphQL"
            />
          </label>

          <div className="simulator-filters-grid">
            <label className="panel__section">
              <span>Seniority</span>
              <PickerDropdown
                value={seniority}
                options={filterOptions?.seniority ?? []}
                onChange={setSeniority}
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
                onChange={(event) => setMinYears(Number(event.target.value) || 0)}
              />
            </label>
          </div>

          <label className="panel__section">
            <span>Location</span>
            <PickerDropdown
              value={location}
              options={(filterOptions?.locations ?? []).map((option) => ({ value: option, label: option }))}
              onChange={setLocation}
              placeholder="Any location"
              emptyLabel="No indexed locations available"
            />
          </label>

          <label className="panel__section">
            <span>Skills</span>
            <FilterMultiSelect
              options={filterOptions?.skills ?? []}
              values={selectedSkills}
              onChange={setSelectedSkills}
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
              onChange={setSelectedCompanies}
              placeholder="Add current or past companies"
              searchPlaceholder="Search companies"
            />
          </label>

          <div className="simulator-actions">
            <button className="button button--primary" type="button" onClick={() => void handleRun()} disabled={loading}>
              <FlaskConical size={14} />
              {loading ? "Running..." : "Run simulation"}
            </button>
            <button
              className="button button--secondary"
              type="button"
              onClick={() => {
                setQuery("");
                setSeniority("");
                setMinYears(0);
                setLocation("");
                setSelectedSkills([]);
                setSelectedCompanies([]);
                setError(null);
                setResponse(null);
              }}
            >
              Reset
            </button>
          </div>

          {error ? <p className="simulator-error">{error}</p> : null}
        </Panel>

        <Panel className="simulator-panel simulator-panel--timeline">
          <div className="simulator-panel__header">
            <div>
              <Tag tone="primary">Execution trace</Tag>
              <h2>Watch the request move through the search engine.</h2>
            </div>
          </div>

          <div className="simulator-timeline">
            {SIMULATOR_STAGES.map((stage, index) => {
              const status = stageStatus(index, activeStage, completedCount, loading);
              const Icon = stage.icon;

              return (
                <div key={stage.id} className={`simulator-step simulator-step--${status}`}>
                  <div className="simulator-step__icon">
                    <Icon size={16} />
                  </div>
                  <div className="simulator-step__body">
                    <div className="simulator-step__title-row">
                      <strong>{stage.label}</strong>
                      <Tag tone={status === "complete" ? "success" : status === "active" ? "primary" : "neutral"}>
                        {status === "complete" ? "Done" : status === "active" ? "Running" : "Pending"}
                      </Tag>
                    </div>
                    <p>{stageNarrative[index]}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>
      </div>

      {!response && !loading ? (
        <EmptyState
          title="No simulation run yet"
          detail="Run a search to inspect the exact request payload, resolved intent, embedding metadata, and raw ranked results."
        />
      ) : null}

      {response ? (
        <>
          <div className="simulator-view-switch" role="tablist" aria-label="Search simulator views">
            {SIMULATOR_VIEWS.map((view) => (
              <button
                key={view.id}
                type="button"
                className={`simulator-view-button${activeView === view.id ? " simulator-view-button--active" : ""}`}
                onClick={() => setActiveView(view.id)}
              >
                {view.label}
              </button>
            ))}
          </div>

          {activeView === "overview" ? (
            <>
              <div className="simulator-explainer-grid">
                <Panel className="simulator-overview-card">
                  <div className="simulator-panel__header">
                    <div>
                      <Tag tone="primary">Plain English</Tag>
                      <h3>What matters in this run</h3>
                      <p>You do not need to read vector values. Focus on filters, intent, top result order, and evidence.</p>
                    </div>
                  </div>
                  <div className="simulator-overview-grid">
                    <div className="simulator-overview-metric">
                      <span>Hard filters</span>
                      <strong>{strictFilters.length ? strictFilters.length : "None"}</strong>
                      <p>{strictFilters.length ? strictFilters.join(", ") : "No explicit gating was applied."}</p>
                    </div>
                    <div className="simulator-overview-metric">
                      <span>Intent source</span>
                      <strong>{response.analysis.intentSource}</strong>
                      <p>{resolvedIntentSummary || "No structured query intent was extracted."}</p>
                    </div>
                    <div className="simulator-overview-metric">
                      <span>Semantic retrieval</span>
                      <strong>{embeddingLabel}</strong>
                      <p>Embeddings help the system find chunks that mean something similar, not just exact word matches.</p>
                    </div>
                    <div className="simulator-overview-metric">
                      <span>Top result</span>
                      <strong>{topResult?.name ?? "No result"}</strong>
                      <p>{topResult ? `${topResult.matchRate}% backend rate · raw ${topResult.scoreRaw.toFixed(4)}` : "No candidate was returned."}</p>
                    </div>
                  </div>
                </Panel>

                <Panel className="simulator-overview-card">
                  <div className="simulator-panel__header">
                    <div>
                      <Tag tone="primary">How to read this page</Tag>
                      <h3>Fast debugging order</h3>
                    </div>
                  </div>
                  <ul className="simulator-bullet-list">
                    <li>Check that strict filters match what the recruiter explicitly selected.</li>
                    <li>Check resolved intent to confirm the query was interpreted correctly.</li>
                    <li>Check the top ranked candidates and their evidence chunks.</li>
                    <li>Use embedding details only when debugging semantic search quality or model mismatch.</li>
                  </ul>
                </Panel>
              </div>

              <Panel className="simulator-top-result-card">
                <div className="simulator-panel__header">
                  <div>
                    <Tag tone="primary">Top ranked candidate</Tag>
                    <h2>{topResult?.name ?? "No result returned"}</h2>
                    <p>
                      {topResult
                        ? `${topResult.currentTitle} · ${topResult.location} · ${workspaceNameById.get(topResult.tenantId ?? "") ?? "Current workspace"}`
                        : "Run another search to inspect the best ranked candidate."}
                    </p>
                  </div>
                  {topResult ? (
                    <div className="simulator-result-score simulator-result-score--spotlight">
                      <strong>{topResult.matchRate}%</strong>
                      <span>backend rate · raw {topResult.scoreRaw.toFixed(4)}</span>
                    </div>
                  ) : null}
                </div>

                {topResult ? (
                  <div className="simulator-top-result-grid">
                    <div>
                      <h4>Why this person ranked first</h4>
                      <div className="simulator-reason-list">
                        {topReasonsForTopResult.map(([label, value]) => (
                          <div key={label} className="simulator-reason-chip">
                            <span>{formatSubscoreLabel(label)}</span>
                            <strong>{value.toFixed(4)}</strong>
                          </div>
                        ))}
                      </div>
                      <p className="simulator-summary-copy">{topResult.summaryShort || "No summary available."}</p>
                    </div>

                    <div>
                      <h4>Best evidence</h4>
                      {topResult.evidence[0] ? (
                        <div className="simulator-evidence-preview">
                          <div className="simulator-evidence-meta">
                            <Tag tone="primary">{topResult.evidence[0].chunkType}</Tag>
                            <span>{topResult.evidence[0].relevance.toFixed(3)}</span>
                          </div>
                          <p>{topResult.evidence[0].excerpt}</p>
                        </div>
                      ) : (
                        <p className="simulator-muted">No evidence snippet was returned for the top candidate.</p>
                      )}
                    </div>
                  </div>
                ) : null}
              </Panel>

              <div className="simulator-insight-grid simulator-insight-grid--compact">
                <Panel className="simulator-info-card">
                  <div className="simulator-panel__header">
                    <div>
                      <Tag tone="primary">Request summary</Tag>
                      <h3>What the frontend asked for</h3>
                    </div>
                  </div>
                  <dl className="simulator-detail-list">
                    <div><dt>Query</dt><dd>{response.request.query || "none"}</dd></div>
                    <div><dt>Scope</dt><dd>{response.request.tenantIds.length ? `${response.request.tenantIds.length} workspace(s)` : "all visible workspaces"}</dd></div>
                    <div><dt>Strict filters</dt><dd>{formatList(response.analysis.engine.strictFilters)}</dd></div>
                    <div><dt>Requested results</dt><dd>{response.request.limit}</dd></div>
                  </dl>
                </Panel>

                <Panel className="simulator-info-card">
                  <div className="simulator-panel__header">
                    <div>
                      <Tag tone="primary">Resolved intent</Tag>
                      <h3>How the query was interpreted</h3>
                    </div>
                  </div>
                  <dl className="simulator-detail-list">
                    <div><dt>Role</dt><dd>{formatFilterValue(response.analysis.resolvedIntent.role)}</dd></div>
                    <div><dt>Seniority</dt><dd>{formatFilterValue(response.analysis.resolvedIntent.seniority)}</dd></div>
                    <div><dt>Min years</dt><dd>{formatFilterValue(response.analysis.resolvedIntent.minYearsExperience)}</dd></div>
                    <div><dt>Location</dt><dd>{formatFilterValue(response.analysis.resolvedIntent.location)}</dd></div>
                    <div><dt>Skills</dt><dd>{formatList(response.analysis.resolvedIntent.skills)}</dd></div>
                  </dl>
                </Panel>

                <Panel className="simulator-info-card">
                  <div className="simulator-panel__header">
                    <div>
                      <Tag tone="primary">Retrieval engine</Tag>
                      <h3>What search signals ran</h3>
                    </div>
                  </div>
                  <dl className="simulator-detail-list">
                    <div><dt>Lexical retrieval</dt><dd>{response.analysis.engine.usesLexical ? "On" : "Off"}</dd></div>
                    <div><dt>Semantic retrieval</dt><dd>{response.analysis.engine.usesSemantic ? "On" : "Off"}</dd></div>
                    <div><dt>Name boost</dt><dd>{response.analysis.engine.usesNameBoost ? "On" : "Off"}</dd></div>
                    <div><dt>Embedding provider</dt><dd>{response.analysis.embedding.provider}</dd></div>
                    <div><dt>Embedding version</dt><dd>{response.analysis.embedding.version ?? "n/a"}</dd></div>
                  </dl>
                </Panel>

                <Panel className="simulator-info-card">
                  <div className="simulator-panel__header">
                    <div>
                      <Tag tone="primary">Response summary</Tag>
                      <h3>What came back</h3>
                    </div>
                  </div>
                  <dl className="simulator-detail-list">
                    <div><dt>Result count</dt><dd>{response.meta.count}</dd></div>
                    <div><dt>Next cursor</dt><dd>{formatFilterValue(response.nextCursor)}</dd></div>
                    <div><dt>Rank version</dt><dd>{response.meta.rankVersion}</dd></div>
                    <div><dt>Source</dt><dd>{response.meta.source}</dd></div>
                  </dl>
                </Panel>
              </div>
            </>
          ) : null}

          {activeView === "results" ? (
            <Panel className="simulator-results-panel">
              <div className="simulator-panel__header">
                <div>
                  <Tag tone="primary">Exact ranked rows</Tag>
                  <h2>{response.results.length} result(s) returned</h2>
                  <p>These are the exact ranked items returned by backend search ranking, with the strongest reasons surfaced first.</p>
                </div>
              </div>

              <div className="simulator-result-list">
                {response.results.map((result, index) => (
                  <details key={`${result.candidateId}-${index}`} className="simulator-result-card" open={index === 0}>
                    <summary>
                      <div className="simulator-result-summary">
                        <div className="simulator-result-rank">#{index + 1}</div>
                        <div className="simulator-result-main">
                          <strong>{result.name}</strong>
                          <span>{result.currentTitle}</span>
                          <div className="simulator-result-meta">
                            <Tag>{result.seniority}</Tag>
                            <Tag>{result.primaryRole}</Tag>
                            <Tag>{result.location}</Tag>
                            {result.tenantId ? <Tag tone="primary">{workspaceNameById.get(result.tenantId) ?? result.tenantId}</Tag> : null}
                          </div>
                          <div className="simulator-reason-list">
                            {topReasons(result.subscores).map(([label, value]) => (
                              <div key={label} className="simulator-reason-chip">
                                <span>{formatSubscoreLabel(label)}</span>
                                <strong>{value.toFixed(4)}</strong>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="simulator-result-score">
                          <strong>{result.matchRate}%</strong>
                          <span>backend rate · raw {result.scoreRaw.toFixed(4)}</span>
                        </div>
                      </div>
                    </summary>

                    <div className="simulator-result-body">
                      <div className="simulator-subscore-grid">
                        {Object.entries(result.subscores).map(([label, value]) => (
                          <div key={label} className="simulator-subscore">
                            <span>{formatSubscoreLabel(label)}</span>
                            <strong>{value.toFixed(4)}</strong>
                          </div>
                        ))}
                      </div>

                      <div className="simulator-result-columns">
                        <div>
                          <h4>Matched filters</h4>
                          <pre>{prettyJson(result.matchedFilters)}</pre>
                        </div>

                        <div>
                          <h4>Evidence</h4>
                          {result.evidence.length ? (
                            <ul className="simulator-evidence-list">
                              {result.evidence.map((evidence) => (
                                <li key={evidence.id}>
                                  <div className="simulator-evidence-meta">
                                    <Tag tone="primary">{evidence.chunkType}</Tag>
                                    <span>{evidence.relevance.toFixed(3)}</span>
                                  </div>
                                  <p>{evidence.excerpt}</p>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="simulator-muted">No chunk evidence was attached to this result.</p>
                          )}
                        </div>
                      </div>

                      <div className="simulator-summary-block">
                        <h4>Summary short</h4>
                        <p>{result.summaryShort || "No summary available."}</p>
                      </div>
                    </div>
                  </details>
                ))}
              </div>
            </Panel>
          ) : null}

          {activeView === "internals" ? (
            <>
              <div className="simulator-insight-grid">
                <Panel className="simulator-json-card">
                  <div className="simulator-panel__header">
                    <div>
                      <Tag tone="primary">Exact request</Tag>
                      <h3>Frontend payload</h3>
                    </div>
                  </div>
                  <pre>{prettyJson(response.request)}</pre>
                </Panel>

                <Panel className="simulator-json-card">
                  <div className="simulator-panel__header">
                    <div>
                      <Tag tone="primary">Intent</Tag>
                      <h3>LLM vs explicit filters</h3>
                    </div>
                  </div>
                  <div className="simulator-intent-blocks">
                    <div>
                      <span>Intent source</span>
                      <strong>{response.analysis.intentSource}</strong>
                    </div>
                    <div>
                      <span>Resolved intent</span>
                      <pre>{prettyJson(response.analysis.resolvedIntent)}</pre>
                    </div>
                    <div>
                      <span>LLM intent</span>
                      <pre>{prettyJson(response.analysis.llmIntent)}</pre>
                    </div>
                  </div>
                </Panel>

                <Panel className="simulator-json-card">
                  <div className="simulator-panel__header">
                    <div>
                      <Tag tone="primary">Embedding</Tag>
                      <h3>Semantic retrieval</h3>
                    </div>
                  </div>
                  <div className="simulator-intent-blocks">
                    <div>
                      <span>Provider</span>
                      <strong>{response.analysis.embedding.provider}</strong>
                    </div>
                    <div>
                      <span>Version</span>
                      <strong>{response.analysis.embedding.version ?? "n/a"}</strong>
                    </div>
                    <div>
                      <span>Dimensions</span>
                      <strong>{response.analysis.embedding.dimensions}</strong>
                    </div>
                    <div>
                      <span>What this means</span>
                      <p className="simulator-muted">
                        This vector is generated from the search text and compared against stored CV chunk vectors. The numeric preview is mainly for low-level debugging.
                      </p>
                    </div>
                  </div>
                  <details className="simulator-advanced-card">
                    <summary>Show vector preview</summary>
                    <pre>{prettyJson(response.analysis.embedding.preview)}</pre>
                  </details>
                </Panel>

                <Panel className="simulator-json-card">
                  <div className="simulator-panel__header">
                    <div>
                      <Tag tone="primary">RPC payload</Tag>
                      <h3>What SQL receives</h3>
                    </div>
                  </div>
                  <details className="simulator-advanced-card" open>
                    <summary>Show exact RPC payload</summary>
                    <pre>{prettyJson(response.analysis.rpcPayload)}</pre>
                  </details>
                </Panel>
              </div>

              <Panel className="simulator-json-card">
                <div className="simulator-panel__header">
                  <div>
                    <Tag tone="primary">Deep diagnostics</Tag>
                    <h2>Full function payload</h2>
                    <p>Keep this collapsed unless you need the exact backend JSON for debugging or sharing.</p>
                  </div>
                </div>
                <details className="simulator-advanced-card">
                  <summary>Show raw response JSON</summary>
                  <pre>{prettyJson(response.rawResponse)}</pre>
                </details>
              </Panel>
            </>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
