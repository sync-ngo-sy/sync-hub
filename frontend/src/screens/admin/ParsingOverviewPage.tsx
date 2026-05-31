import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, FileText, Search, Sparkles, X } from "lucide-react";
import { Link } from "react-router-dom";
import { EmptyState, PageIntro, Panel, ScorePill, StatCard, Tag } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";
import type { ParsingOverview } from "@/lib/contracts";
import { platformApi } from "@/lib/platformApi";

function formatUploadedAt(value: string) {
  if (!value) {
    return "Unknown";
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

function toneForQualityBand(band: ParsingOverview["items"][number]["qualityBand"]) {
  if (band === "healthy") {
    return "success" as const;
  }
  if (band === "review") {
    return "warning" as const;
  }
  return "warning" as const;
}

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

const EMPTY_PARSING_OVERVIEW: ParsingOverview = {
  overallParsedPercentage: 0,
  averageConfidence: 0,
  documentsCount: 0,
  completedCount: 0,
  needsReviewCount: 0,
  failedCount: 0,
  documentsWithWarnings: 0,
  missingContactCount: 0,
  lowCoverageCount: 0,
  itemsTotalCount: 0,
  items: [],
};

function StatSkeletonGrid() {
  return (
    <div className="stats-grid" aria-hidden="true">
      {["coverage", "confidence", "review", "workspace"].map((item) => (
        <Panel key={item} className="stat-card stat-card--loading">
          <div className="stat-card__header">
            <span className="stat-card__skeleton stat-card__skeleton--label" />
            <span className="stat-card__skeleton stat-card__skeleton--icon" />
          </div>
          <div className="stat-card__value-row">
            <span className="stat-card__skeleton stat-card__skeleton--value" />
            <span className="stat-card__skeleton stat-card__skeleton--delta" />
          </div>
        </Panel>
      ))}
    </div>
  );
}

function ParsingOverviewSkeleton() {
  return (
    <div className="admin-grid" aria-busy="true" aria-label="Loading parsing diagnostics">
      <Panel className="table-card parsing-skeleton-card">
        <div className="stack">
          <span className="stat-card__skeleton parsing-skeleton__title" />
          <span className="stat-card__skeleton parsing-skeleton__subtitle" />
          <div className="parsing-skeleton-table">
            {Array.from({ length: 8 }).map((_, index) => (
              <div key={index} className="parsing-skeleton-row">
                <span className="stat-card__skeleton parsing-skeleton__cell parsing-skeleton__cell--workspace" />
                <span className="stat-card__skeleton parsing-skeleton__cell parsing-skeleton__cell--document" />
                <span className="stat-card__skeleton parsing-skeleton__cell" />
                <span className="stat-card__skeleton parsing-skeleton__cell parsing-skeleton__cell--small" />
              </div>
            ))}
          </div>
        </div>
      </Panel>

      <Panel className="table-card parsing-skeleton-card">
        <div className="stack">
          <span className="stat-card__skeleton parsing-skeleton__title" />
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="parsing-skeleton-note">
              <span className="stat-card__skeleton parsing-skeleton__subtitle" />
              <span className="stat-card__skeleton parsing-skeleton__line" />
              <span className="stat-card__skeleton parsing-skeleton__line parsing-skeleton__line--short" />
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

export function ParsingOverviewPage() {
  const { adminMemberships, enabled, isAdmin, loading } = useAuth();
  const [overview, setOverview] = useState<ParsingOverview>(EMPTY_PARSING_OVERVIEW);
  const [fetching, setFetching] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reviewFilter, setReviewFilter] = useState<"all" | "needsReview">("all");
  const [queryInput, setQueryInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [pageSize, setPageSize] = useState(25);
  const [pageIndex, setPageIndex] = useState(0);
  const adminTenantIds = useMemo(() => adminMemberships.map((membership) => membership.id), [adminMemberships]);
  const workspaceNameById = useMemo(
    () => new Map(adminMemberships.map((membership) => [membership.id, membership.name])),
    [adminMemberships],
  );

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setSearchQuery(queryInput.trim());
    }, 300);

    return () => window.clearTimeout(timeout);
  }, [queryInput]);

  useEffect(() => {
    if (enabled && loading) {
      return;
    }
    if (enabled && !isAdmin) {
      return;
    }

    let active = true;
    setFetching(true);
    setError(null);

    platformApi
      .getParsingOverview(adminTenantIds, { pageSize, pageIndex, reviewFilter, searchQuery })
      .then((nextOverview) => {
        if (active) {
          setOverview(nextOverview);
        }
      })
      .catch((fetchError) => {
        if (active) {
          setError(fetchError instanceof Error ? fetchError.message : "Unable to load parsing diagnostics.");
        }
      })
      .finally(() => {
        if (active) {
          setHasLoaded(true);
          setFetching(false);
        }
      });

    return () => {
      active = false;
    };
  }, [adminTenantIds, enabled, isAdmin, loading, pageIndex, pageSize, reviewFilter, searchQuery]);

  const paginatedItems = overview.items;
  const totalItems = overview.itemsTotalCount ?? overview.items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePageIndex = Math.min(pageIndex, totalPages - 1);
  const pageStart = totalItems ? safePageIndex * pageSize + 1 : 0;
  const pageEnd = totalItems ? Math.min(totalItems, pageStart + paginatedItems.length - 1) : 0;

  useEffect(() => {
    setPageIndex(0);
  }, [pageSize, reviewFilter, searchQuery]);

  useEffect(() => {
    setPageIndex((current) => Math.min(current, totalPages - 1));
  }, [totalPages]);

  if (enabled && !loading && !isAdmin) {
    return (
      <div className="page-stack">
        <EmptyState
          title="Admin access required"
          detail="Parsing quality is a platform-admin operations view across all workspaces."
          action={
            <Link className="button button--secondary" to="/search">
              Return to Search
            </Link>
          }
        />
      </div>
    );
  }

  const documentsWithWarnings = overview.documentsWithWarnings ?? overview.items.filter((item) => item.warnings.length > 0).length;
  const missingContact = overview.missingContactCount ?? overview.items.filter((item) => item.missingFields.includes("email") || item.missingFields.includes("phone")).length;
  const lowCoverage = overview.lowCoverageCount ?? overview.items.filter((item) => item.parsedPercentage < 70).length;
  const reviewQueue = overview.items.filter((item) => item.needsAttention).slice(0, 5);
  const filteredLabel = searchQuery ? "matching documents" : reviewFilter === "needsReview" ? "needs review" : "documents";

  return (
    <div className="page-stack">
      <PageIntro
        eyebrow="Admin"
        title="Parsing quality"
        description="Track parsing quality across the full platform. This view surfaces field coverage, confidence, warnings, and the documents that need parser tuning before a larger ingest."
        actions={
          <>
            <ScorePill score={overview.overallParsedPercentage} label="Corpus parse" />
            <Link className="button button--secondary" to="/admin/parsing/lab">
              Open Parsing Lab
            </Link>
          </>
        }
      />

      {error ? <div className="status-banner">{error}</div> : null}

      {fetching && !hasLoaded ? (
        <>
          <StatSkeletonGrid />
          <ParsingOverviewSkeleton />
        </>
      ) : (
        <>
          <div className="stats-grid">
        <StatCard
          label="Corpus parse coverage"
          value={`${overview.overallParsedPercentage}%`}
          delta={fetching ? "Refreshing" : `${overview.documentsCount} PDFs`}
        />
        <StatCard label="Average confidence" value={`${overview.averageConfidence}%`} delta="extraction" tone="secondary" />
        <StatCard label="Needs review" value={`${overview.needsReviewCount}`} delta="below threshold" tone="tertiary" />
        <StatCard
          label="Admin workspaces"
          value={`${adminMemberships.length}`}
          delta={fetching ? "Refreshing" : `${overview.failedCount} failed docs`}
        />
      </div>

      {overview.documentsCount === 0 ? (
        <EmptyState
          title="No parsed documents yet"
          detail="Run the offline worker and sync candidate profiles into Supabase before using this operations view."
        />
      ) : (
        <>
          <div className="admin-grid">
            <Panel className="table-card">
              <div className="stack">
                <div className="signal-row">
                  <div>
                    <h3>Document diagnostics</h3>
                    <p>Documents are ordered by lowest parse coverage first so operators can inspect weak parses immediately.</p>
                  </div>
                  <div className="skill-list">
                    <Tag tone="primary">{overview.documentsCount} total</Tag>
                    {reviewFilter === "needsReview" ? <Tag tone="warning">{totalItems} need review</Tag> : null}
                  </div>
                </div>

                <div className="parsing-table-controls">
                  <label className="parsing-search-field">
                    <span>Search</span>
                    <div className="parsing-search-control">
                      <Search size={15} />
                      <input
                        className="form-input"
                        value={queryInput}
                        onChange={(event) => setQueryInput(event.target.value)}
                        placeholder="File, candidate, title, skill..."
                      />
                      {queryInput ? (
                        <button className="icon-button parsing-search-clear" type="button" aria-label="Clear parsing search" onClick={() => setQueryInput("")}>
                          <X size={14} />
                        </button>
                      ) : null}
                    </div>
                  </label>

                  <div className="simulator-view-switch" role="tablist" aria-label="Parsing document filter">
                    <button
                      className={cn("simulator-view-button", reviewFilter === "all" && "simulator-view-button--active")}
                      type="button"
                      onClick={() => setReviewFilter("all")}
                    >
                      All
                    </button>
                    <button
                      className={cn("simulator-view-button", reviewFilter === "needsReview" && "simulator-view-button--active")}
                      type="button"
                      onClick={() => setReviewFilter("needsReview")}
                    >
                      Needs review
                    </button>
                  </div>

                  <label className="parsing-page-size">
                    <span>Rows</span>
                    <select className="form-select" value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}>
                      {PAGE_SIZE_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                {paginatedItems.length ? (
                  <>
                    <div className="parsing-table">
                      <table>
                        <thead>
                          <tr>
                            <th>Workspace</th>
                            <th>Document</th>
                            <th>Candidate</th>
                            <th>Parse</th>
                            <th>Confidence</th>
                            <th>Status</th>
                            <th>Warnings</th>
                            <th />
                          </tr>
                        </thead>
                        <tbody>
                          {paginatedItems.map((item) => (
                            <tr key={item.documentId}>
                              <td>{workspaceNameById.get(item.tenantId) ?? "Unknown workspace"}</td>
                              <td>
                                <div className="parsing-table__file">
                                  <strong>{item.originalFilename}</strong>
                                  <span>{item.mimeType} · {formatUploadedAt(item.uploadedAt)}</span>
                                </div>
                              </td>
                              <td>
                                <div className="parsing-table__candidate">
                                  <strong>{item.candidateName}</strong>
                                  <span>{item.currentTitle}</span>
                                </div>
                              </td>
                              <td>
                                <div className="parsing-table__score">
                                  <strong>{item.parsedPercentage}%</strong>
                                  <span>{item.rawTextLength ? `${item.rawTextLength.toLocaleString()} chars` : "text indexed"}</span>
                                </div>
                              </td>
                              <td>{item.extractionConfidence}%</td>
                              <td>
                                <div className="skill-list">
                                  <Tag tone={toneForQualityBand(item.qualityBand)}>{item.qualityBand}</Tag>
                                  <Tag>{item.status}</Tag>
                                </div>
                              </td>
                              <td>{item.warnings.length}</td>
                              <td className="parsing-table__actions">
                                <Link className="button button--secondary" to={`/admin/parsing/${item.documentId}`}>
                                  Inspect
                                </Link>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="parsing-pagination">
                      <span>
                        Showing {pageStart}-{pageEnd} of {totalItems} {filteredLabel}
                      </span>
                      <div className="pagination-actions">
                        <button
                          className="button button--secondary"
                          type="button"
                          onClick={() => setPageIndex((current) => Math.max(0, current - 1))}
                          disabled={safePageIndex === 0}
                        >
                          <ChevronLeft size={14} />
                          Previous
                        </button>
                        <Tag>
                          Page {safePageIndex + 1} of {totalPages}
                        </Tag>
                        <button
                          className="button button--secondary"
                          type="button"
                          onClick={() => setPageIndex((current) => Math.min(totalPages - 1, current + 1))}
                          disabled={safePageIndex >= totalPages - 1}
                        >
                          Next
                          <ChevronRight size={14} />
                        </button>
                      </div>
                    </div>
                  </>
                ) : (
                  <EmptyState
                    title={searchQuery ? "No documents match your search" : "No documents need review"}
                    detail={searchQuery ? "Try a candidate name, file name, title, skill, or contact detail." : "The current filter has no matching documents."}
                    action={
                      <button
                        className="button button--secondary"
                        type="button"
                        onClick={() => {
                          setQueryInput("");
                          setReviewFilter("all");
                        }}
                      >
                        Clear filters
                      </button>
                    }
                  />
                )}
              </div>
            </Panel>

            <Panel className="table-card">
              <div className="stack">
                <div className="skill-list">
                  <Sparkles size={16} />
                  <h3>Operator focus</h3>
                </div>

                <div className="evidence-card">
                  <div className="signal-row">
                    <strong>Parser warnings</strong>
                    <Tag tone={documentsWithWarnings ? "warning" : "success"}>{documentsWithWarnings}</Tag>
                  </div>
                  <p>Documents with warnings need review before you trust their chunking and embeddings in recruiter search.</p>
                </div>

                <div className="evidence-card">
                  <div className="signal-row">
                    <strong>Missing contact details</strong>
                    <Tag tone={missingContact ? "warning" : "success"}>{missingContact}</Tag>
                  </div>
                  <p>These resumes need better header/contact extraction if recruiters are expected to contact candidates directly from the dossier.</p>
                </div>

                <div className="evidence-card">
                  <div className="signal-row">
                    <strong>Low coverage docs</strong>
                    <Tag tone={lowCoverage ? "warning" : "success"}>{lowCoverage}</Tag>
                  </div>
                  <p>Coverage below 70% usually means the parser missed major sections like experience, skills, or contact blocks.</p>
                </div>

                <div className="stack">
                  <div className="skill-list">
                    <AlertTriangle size={16} />
                    <h4>Review queue</h4>
                  </div>
                  {reviewQueue.length ? (
                    <>
                      {reviewQueue.map((item) => (
                        <Link key={item.documentId} to={`/admin/parsing/${item.documentId}`} className="inline-cta">
                          <div>
                            <strong>{item.originalFilename}</strong>
                            <p>{workspaceNameById.get(item.tenantId) ?? "Unknown workspace"} · {item.keyFindings.join(" · ")}</p>
                          </div>
                        </Link>
                      ))}
                      <button className="button button--secondary" type="button" onClick={() => setReviewFilter("needsReview")}>
                        Show all review docs
                      </button>
                    </>
                  ) : (
                    <div className="evidence-card">
                      <div className="skill-list">
                        <CheckCircle2 size={16} />
                        <strong>No documents currently need manual review</strong>
                      </div>
                      <p>The active corpus is parsing cleanly enough for search-quality demos.</p>
                    </div>
                  )}
                </div>

                <div className="parsing-operator-note">
                  <div className="skill-list">
                    <FileText size={16} />
                    <strong>What this score means</strong>
                  </div>
                  <p>The parse percentage measures extracted field coverage. Confidence remains separate so low-quality model output does not get hidden behind a high-looking percentage.</p>
                </div>
              </div>
            </Panel>
          </div>
        </>
      )}
        </>
      )}
    </div>
  );
}
