import { Panel, Tag } from "@/components/ui";
import { SIMULATOR_VIEWS, type SearchSimulatorView } from "@/features/search-configuration/searchSimulator.constants";
import {
  buildEmbeddingLabel,
  buildResolvedIntentSummary,
  formatFilterValue,
  formatList,
  formatSubscoreLabel,
  prettyJson,
  topReasons,
} from "@/features/search-configuration/searchSimulator.helpers";
import type { SearchDebugResponse, SearchDebugResult } from "@/lib/contracts";

type SearchSimulatorResponseViewsProps = {
  activeView: SearchSimulatorView;
  response: SearchDebugResponse;
  workspaceNameById: ReadonlyMap<string, string>;
  onChangeView: (view: SearchSimulatorView) => void;
};

export function SearchSimulatorResponseViews({
  activeView,
  response,
  workspaceNameById,
  onChangeView,
}: SearchSimulatorResponseViewsProps) {
  return (
    <>
      <div className="simulator-view-switch" role="tablist" aria-label="Search simulator views">
        {SIMULATOR_VIEWS.map((view) => (
          <button
            key={view.id}
            type="button"
            className={`simulator-view-button${activeView === view.id ? " simulator-view-button--active" : ""}`}
            onClick={() => onChangeView(view.id)}
          >
            {view.label}
          </button>
        ))}
      </div>

      {activeView === "overview" ? <SearchSimulatorOverview response={response} workspaceNameById={workspaceNameById} /> : null}
      {activeView === "results" ? <SearchSimulatorResults response={response} workspaceNameById={workspaceNameById} /> : null}
      {activeView === "internals" ? <SearchSimulatorInternals response={response} /> : null}
    </>
  );
}

function SearchSimulatorOverview({
  response,
  workspaceNameById,
}: {
  response: SearchDebugResponse;
  workspaceNameById: ReadonlyMap<string, string>;
}) {
  const topResult = response.results[0] ?? null;
  const strictFilters = response.analysis.engine.strictFilters;
  const embeddingLabel = buildEmbeddingLabel(response);
  const resolvedIntentSummary = buildResolvedIntentSummary(response);
  const topReasonsForTopResult = topResult ? topReasons(topResult.subscores) : [];

  return (
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
            <div>
              <dt>Query</dt>
              <dd>{response.request.query || "none"}</dd>
            </div>
            <div>
              <dt>Scope</dt>
              <dd>{response.request.tenantIds.length ? `${response.request.tenantIds.length} workspace(s)` : "all visible workspaces"}</dd>
            </div>
            <div>
              <dt>Strict filters</dt>
              <dd>{formatList(response.analysis.engine.strictFilters)}</dd>
            </div>
            <div>
              <dt>Requested results</dt>
              <dd>{response.request.limit}</dd>
            </div>
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
            <div>
              <dt>Role</dt>
              <dd>{formatFilterValue(response.analysis.resolvedIntent.role)}</dd>
            </div>
            <div>
              <dt>Seniority</dt>
              <dd>{formatFilterValue(response.analysis.resolvedIntent.seniority)}</dd>
            </div>
            <div>
              <dt>Min years</dt>
              <dd>{formatFilterValue(response.analysis.resolvedIntent.minYearsExperience)}</dd>
            </div>
            <div>
              <dt>Location</dt>
              <dd>{formatFilterValue(response.analysis.resolvedIntent.location)}</dd>
            </div>
            <div>
              <dt>Skills</dt>
              <dd>{formatList(response.analysis.resolvedIntent.skills)}</dd>
            </div>
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
            <div>
              <dt>Lexical retrieval</dt>
              <dd>{response.analysis.engine.usesLexical ? "On" : "Off"}</dd>
            </div>
            <div>
              <dt>Semantic retrieval</dt>
              <dd>{response.analysis.engine.usesSemantic ? "On" : "Off"}</dd>
            </div>
            <div>
              <dt>Name boost</dt>
              <dd>{response.analysis.engine.usesNameBoost ? "On" : "Off"}</dd>
            </div>
            <div>
              <dt>Embedding provider</dt>
              <dd>{response.analysis.embedding.provider}</dd>
            </div>
            <div>
              <dt>Embedding version</dt>
              <dd>{response.analysis.embedding.version ?? "n/a"}</dd>
            </div>
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
            <div>
              <dt>Result count</dt>
              <dd>{response.meta.count}</dd>
            </div>
            <div>
              <dt>Next cursor</dt>
              <dd>{formatFilterValue(response.nextCursor)}</dd>
            </div>
            <div>
              <dt>Rank version</dt>
              <dd>{response.meta.rankVersion}</dd>
            </div>
            <div>
              <dt>Source</dt>
              <dd>{response.meta.source}</dd>
            </div>
          </dl>
        </Panel>
      </div>
    </>
  );
}

function SearchSimulatorResults({
  response,
  workspaceNameById,
}: {
  response: SearchDebugResponse;
  workspaceNameById: ReadonlyMap<string, string>;
}) {
  return (
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
          <SearchSimulatorResultCard key={`${result.candidateId}-${index}`} result={result} index={index} workspaceNameById={workspaceNameById} />
        ))}
      </div>
    </Panel>
  );
}

function SearchSimulatorResultCard({
  result,
  index,
  workspaceNameById,
}: {
  result: SearchDebugResult;
  index: number;
  workspaceNameById: ReadonlyMap<string, string>;
}) {
  return (
    <details className="simulator-result-card" open={index === 0}>
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
  );
}

function SearchSimulatorInternals({ response }: { response: SearchDebugResponse }) {
  return (
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
                This vector is generated from the search text and compared against stored CV chunk vectors. The numeric preview is mainly for low-level
                debugging.
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
  );
}
