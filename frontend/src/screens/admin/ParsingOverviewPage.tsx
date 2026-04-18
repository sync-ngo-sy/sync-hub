import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, FileText, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { EmptyState, PageIntro, Panel, ScorePill, StatCard, Tag } from "@/components/ui";
import { parsingOverview as fallbackParsingOverview } from "@/data/mockData";
import { useAuth } from "@/lib/auth";
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

export function ParsingOverviewPage() {
  const { adminMemberships, enabled, isAdmin, loading } = useAuth();
  const [overview, setOverview] = useState<ParsingOverview>(fallbackParsingOverview);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const adminTenantIds = useMemo(() => adminMemberships.map((membership) => membership.id), [adminMemberships]);
  const workspaceNameById = useMemo(
    () => new Map(adminMemberships.map((membership) => [membership.id, membership.name])),
    [adminMemberships],
  );

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
      .getParsingOverview(adminTenantIds)
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
          setFetching(false);
        }
      });

    return () => {
      active = false;
    };
  }, [adminTenantIds, enabled, isAdmin, loading]);

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

  const documentsWithWarnings = overview.items.filter((item) => item.warnings.length > 0).length;
  const missingContact = overview.items.filter((item) => item.missingFields.includes("email") || item.missingFields.includes("phone")).length;
  const lowCoverage = overview.items.filter((item) => item.parsedPercentage < 70).length;
  const reviewQueue = overview.items.filter((item) => item.needsAttention).slice(0, 5);

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
                  <Tag tone="primary">{overview.documentsCount} total</Tag>
                </div>

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
                      {overview.items.map((item) => (
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
                              <span>{item.rawTextLength.toLocaleString()} chars</span>
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
                    reviewQueue.map((item) => (
                      <Link key={item.documentId} to={`/admin/parsing/${item.documentId}`} className="inline-cta">
                        <div>
                          <strong>{item.originalFilename}</strong>
                          <p>{workspaceNameById.get(item.tenantId) ?? "Unknown workspace"} · {item.keyFindings.join(" · ")}</p>
                        </div>
                      </Link>
                    ))
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
    </div>
  );
}
