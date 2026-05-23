import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, CheckCircle2, ExternalLink, FileWarning, FileText, ScanText } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { EmptyState, PageIntro, Panel, StatCard, Tag } from "@/components/ui";
import { getParsingDocument as getFallbackParsingDocument } from "@/data/mockData";
import { useAuth } from "@/lib/auth";
import type { ParsingDocumentDetail } from "@/lib/contracts";
import { formatYearsExperience } from "@/lib/experience";
import { platformApi } from "@/lib/platformApi";

function toneForField(state: ParsingDocumentDetail["fieldCoverage"][number]["state"]) {
  if (state === "parsed") {
    return "success" as const;
  }
  if (state === "partial") {
    return "warning" as const;
  }
  return "warning" as const;
}

function formatDateTime(value: string) {
  if (!value) {
    return "Unknown";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function ParsingDetailSkeleton() {
  return (
    <div className="page-stack" aria-busy="true" aria-label="Loading parsing document diagnostics">
      <Panel className="table-card parsing-detail-skeleton__header">
        <div className="stack">
          <span className="stat-card__skeleton parsing-skeleton__subtitle" />
          <span className="stat-card__skeleton parsing-detail-skeleton__title" />
          <span className="stat-card__skeleton parsing-detail-skeleton__copy" />
        </div>
      </Panel>

      <div className="stats-grid">
        {["coverage", "confidence", "text", "warnings"].map((item) => (
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

      <div className="detail-grid">
        <div className="page-stack">
          {["fields", "profile", "content", "raw"].map((section) => (
            <Panel key={section} className="table-card parsing-skeleton-card">
              <div className="stack">
                <span className="stat-card__skeleton parsing-skeleton__title" />
                <span className="stat-card__skeleton parsing-skeleton__subtitle" />
                <div className="parsing-detail-skeleton__grid">
                  {Array.from({ length: section === "raw" ? 3 : 4 }).map((_, index) => (
                    <div key={index} className="parsing-skeleton-note">
                      <span className="stat-card__skeleton parsing-skeleton__subtitle" />
                      <span className="stat-card__skeleton parsing-skeleton__line" />
                      <span className="stat-card__skeleton parsing-skeleton__line parsing-skeleton__line--short" />
                    </div>
                  ))}
                </div>
              </div>
            </Panel>
          ))}
        </div>

        <div className="page-stack">
          {["metadata", "warnings", "hints"].map((section) => (
            <Panel key={section} className="table-card parsing-skeleton-card">
              <div className="stack">
                <span className="stat-card__skeleton parsing-skeleton__title" />
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="parsing-skeleton-note">
                    <span className="stat-card__skeleton parsing-skeleton__subtitle" />
                    <span className="stat-card__skeleton parsing-skeleton__line" />
                  </div>
                ))}
              </div>
            </Panel>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ParsingDetailPage() {
  const { documentId } = useParams();
  const { adminMemberships, enabled, isAdmin, loading } = useAuth();
  const [detail, setDetail] = useState<ParsingDocumentDetail | null>(documentId ? getFallbackParsingDocument(documentId) : null);
  const [fetching, setFetching] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [openingOriginal, setOpeningOriginal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const adminTenantIds = useMemo(() => adminMemberships.map((membership) => membership.id), [adminMemberships]);
  const workspaceNameById = useMemo(
    () => new Map(adminMemberships.map((membership) => [membership.id, membership.name])),
    [adminMemberships],
  );

  useEffect(() => {
    if (!documentId) {
      return;
    }
    if (enabled && loading) {
      return;
    }
    if (enabled && !isAdmin) {
      return;
    }

    let active = true;
    setDetail(null);
    setFetching(true);
    setHasLoaded(false);
    setError(null);

    platformApi
      .getParsingDocument(documentId, adminTenantIds)
      .then((nextDetail) => {
        if (active) {
          setDetail(nextDetail);
        }
      })
      .catch((fetchError) => {
        if (active) {
          setError(fetchError instanceof Error ? fetchError.message : "Unable to load document diagnostics.");
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
  }, [adminTenantIds, documentId, enabled, isAdmin, loading]);

  async function handleOpenOriginalCv() {
    if (!detail || openingOriginal) {
      return;
    }

    setOpeningOriginal(true);
    setError(null);

    try {
      const documentUrl = await platformApi.getOriginalDocumentUrl(detail.storagePath, detail.sourceUri, { documentId: detail.documentId });
      if (!documentUrl) {
        throw new Error("The original CV is not available from browser-accessible storage yet.");
      }

      window.open(documentUrl, "_blank", "noopener,noreferrer");
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : "Unable to open the original CV.");
    } finally {
      setOpeningOriginal(false);
    }
  }

  if (!documentId) {
    return (
      <div className="page-stack">
        <EmptyState
          title="Document not selected"
          detail="Choose a parsed document from the parsing overview to inspect its extracted fields and parser diagnostics."
          action={
            <Link className="button button--secondary" to="/admin/parsing">
              Back to Parsing Overview
            </Link>
          }
        />
      </div>
    );
  }

  if ((enabled && loading) || (fetching && !hasLoaded)) {
    return <ParsingDetailSkeleton />;
  }

  if (enabled && !loading && !isAdmin) {
    return (
      <div className="page-stack">
        <EmptyState
          title="Admin access required"
          detail="Parsing diagnostics are restricted to platform admins."
          action={
            <Link className="button button--secondary" to="/search">
              Return to Search
            </Link>
          }
        />
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="page-stack">
        <EmptyState
          title="Document not found"
          detail="This document is not available in the admin workspace scope for the current user."
          action={
            <Link className="button button--secondary" to="/admin/parsing">
              Back to Parsing Overview
            </Link>
          }
        />
      </div>
    );
  }

  const workspaceName = detail ? workspaceNameById.get(detail.tenantId) ?? "Unknown workspace" : "Unknown workspace";
  const canOpenOriginal = Boolean(detail.storagePath || (detail.sourceUri && /^(https?:)?\/\//i.test(detail.sourceUri)));

  return (
    <div className="page-stack">
      <PageIntro
        eyebrow={`Admin · ${workspaceName}`}
        title={detail.originalFilename}
        description="Inspect exactly what the parser extracted, how strong the field coverage is, and where to tune the parser before scaling up the platform corpus."
        actions={
          <>
            <button
              className="button button--primary"
              onClick={() => void handleOpenOriginalCv()}
              type="button"
              disabled={openingOriginal || !canOpenOriginal}
            >
              <ExternalLink size={14} />
              {openingOriginal ? "Opening CV..." : "Open Original CV"}
            </button>
            <Link className="button button--secondary" to="/admin/parsing">
              <ArrowLeft size={14} />
              Back to Overview
            </Link>
          </>
        }
      />

      {error ? <div className="status-banner">{error}</div> : null}

      <div className="stats-grid">
        <StatCard label="Parse coverage" value={`${detail.parsedPercentage}%`} delta={detail.qualityBand} />
        <StatCard label="Extraction confidence" value={`${detail.extractionConfidence}%`} delta={fetching ? "Refreshing" : detail.status} tone="secondary" />
        <StatCard label="Raw text length" value={detail.rawTextLength.toLocaleString()} delta="characters" tone="tertiary" />
        <StatCard label="Warnings" value={`${detail.warnings.length}`} delta={`${detail.missingFields.length} missing`} />
      </div>

      <div className="detail-grid">
        <div className="page-stack">
          <Panel className="table-card">
            <div className="stack">
              <div className="signal-row">
                <div>
                  <h3>Field coverage</h3>
                  <p>Coverage is the basis for the parse percentage. Parsed means the field group is present and structurally usable; partial means it needs review.</p>
                </div>
                <div className="skill-list">
                  <Tag tone={detail.qualityBand === "healthy" ? "success" : "warning"}>{detail.qualityBand}</Tag>
                  <Tag>{detail.status}</Tag>
                </div>
              </div>

              <div className="parsing-field-grid">
                {detail.fieldCoverage.map((field) => (
                  <div key={field.label} className={`parsing-field-card parsing-field-card--${field.state}`}>
                    <div className="signal-row">
                      <strong>{field.label}</strong>
                      <Tag tone={toneForField(field.state)}>{field.state}</Tag>
                    </div>
                    <p>{field.detail}</p>
                  </div>
                ))}
              </div>
            </div>
          </Panel>

          <Panel className="table-card">
            <div className="stack">
              <div className="signal-row">
                <div>
                  <h3>Extracted profile</h3>
                  <p>This is the recruiter-facing structure derived from the source CV.</p>
                </div>
                <div className="skill-list">
                  <Tag tone="primary">{detail.seniority}</Tag>
                  <Tag>{detail.primaryRole}</Tag>
                  <Tag>{formatYearsExperience(detail.yearsExperience, "yrs")}</Tag>
                </div>
              </div>

              <div className="parsing-profile-grid">
                <div className="evidence-card">
                  <span className="parsing-profile-grid__label">Candidate</span>
                  <strong>{detail.candidateName}</strong>
                  <p>{detail.currentTitle}</p>
                </div>
                <div className="evidence-card">
                  <span className="parsing-profile-grid__label">Location</span>
                  <strong>{detail.location || "Not parsed"}</strong>
                  <p>{detail.headline || "No headline parsed"}</p>
                </div>
                <div className="evidence-card">
                  <span className="parsing-profile-grid__label">Email</span>
                  <strong>{detail.email || "Not parsed"}</strong>
                  <p>{detail.phone || "No phone parsed"}</p>
                </div>
                <div className="evidence-card">
                  <span className="parsing-profile-grid__label">Sections</span>
                  <div className="skill-list">
                    {detail.parsedSections.map((section) => (
                      <Tag key={section}>{section}</Tag>
                    ))}
                  </div>
                </div>
              </div>

              {detail.summary ? (
                <div className="evidence-card">
                  <span className="parsing-profile-grid__label">Summary</span>
                  <p>{detail.summary}</p>
                </div>
              ) : null}
            </div>
          </Panel>

          <Panel className="table-card">
            <div className="stack">
              <div className="skill-list">
                <CheckCircle2 size={16} />
                <h3>Parsed content</h3>
              </div>

              <div className="parsing-content-grid">
                <div className="evidence-card">
                  <span className="parsing-profile-grid__label">Skills</span>
                  <div className="skill-list">
                    {detail.skills.length ? detail.skills.map((skill) => <Tag key={skill}>{skill}</Tag>) : <p>No skills parsed.</p>}
                  </div>
                </div>

                <div className="evidence-card">
                  <span className="parsing-profile-grid__label">Links</span>
                  {detail.links.length ? (
                    <ul className="bullet-list">
                      {detail.links.map((link) => (
                        <li key={link}>{link}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>No links parsed.</p>
                  )}
                </div>

                <div className="evidence-card">
                  <span className="parsing-profile-grid__label">Education</span>
                  {detail.education.length ? (
                    <ul className="bullet-list">
                      {detail.education.map((entry) => (
                        <li key={entry}>{entry}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>No education parsed.</p>
                  )}
                </div>

                <div className="evidence-card">
                  <span className="parsing-profile-grid__label">Projects</span>
                  {detail.projects.length ? (
                    <ul className="bullet-list">
                      {detail.projects.map((project) => (
                        <li key={project}>{project}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>No projects parsed.</p>
                  )}
                </div>
              </div>

              <div className="timeline">
                {detail.timeline.length ? (
                  detail.timeline.map((entry) => (
                    <div key={`${entry.employer}-${entry.role}-${entry.start}`} className="timeline-entry">
                      <div className="signal-row">
                        <strong>{entry.role}</strong>
                        <span>{entry.start} - {entry.end}</span>
                      </div>
                      <p>{entry.employer}</p>
                      {entry.scope ? <p>{entry.scope}</p> : null}
                    </div>
                  ))
                ) : (
                  <div className="evidence-card">
                    <p>No experience timeline was segmented from this CV.</p>
                  </div>
                )}
              </div>
            </div>
          </Panel>

          <Panel className="table-card">
            <div className="stack">
              <div className="skill-list">
                <ScanText size={16} />
                <h3>Raw text preview</h3>
              </div>
              <p>This is the parsed document body that downstream extraction and embeddings were built from.</p>
              <pre className="parsing-raw-text">{detail.rawTextPreview || "No raw text preview available."}</pre>
            </div>
          </Panel>
        </div>

        <div className="page-stack">
          <Panel className="table-card">
            <div className="stack">
              <div className="skill-list">
                <FileText size={16} />
                <h3>Processing metadata</h3>
              </div>
              <div className="parsing-meta-list">
                <div className="signal-row">
                  <span>Workspace</span>
                  <strong>{workspaceName}</strong>
                </div>
                <div className="signal-row">
                  <span>Uploaded</span>
                  <strong>{formatDateTime(detail.uploadedAt)}</strong>
                </div>
                <div className="signal-row">
                  <span>Updated</span>
                  <strong>{formatDateTime(detail.updatedAt)}</strong>
                </div>
                <div className="signal-row">
                  <span>Parser</span>
                  <strong>{detail.parserVersion}</strong>
                </div>
                <div className="signal-row">
                  <span>Model</span>
                  <strong>{detail.modelVersion}</strong>
                </div>
                <div className="signal-row">
                  <span>Prompt</span>
                  <strong>{detail.promptVersion}</strong>
                </div>
                <div className="signal-row">
                  <span>Embeddings</span>
                  <strong>{detail.embeddingVersion}</strong>
                </div>
              </div>
              <div className="evidence-card">
                <span className="parsing-profile-grid__label">Source URI</span>
                <p>{detail.sourceUri}</p>
                {detail.storagePath ? <p>{detail.storagePath}</p> : null}
              </div>
            </div>
          </Panel>

          <Panel className="table-card">
            <div className="stack">
              <div className="skill-list">
                <FileWarning size={16} />
                <h3>Warnings and missing fields</h3>
              </div>

              <div className="evidence-card">
                <span className="parsing-profile-grid__label">Missing fields</span>
                {detail.missingFields.length ? (
                  <div className="skill-list">
                    {detail.missingFields.map((field) => (
                      <Tag key={field} tone="warning">
                        {field}
                      </Tag>
                    ))}
                  </div>
                ) : (
                  <p>No required fields are currently flagged as missing.</p>
                )}
              </div>

              <div className="evidence-card">
                <span className="parsing-profile-grid__label">Parse warnings</span>
                {detail.parseWarnings.length ? (
                  <ul className="bullet-list">
                    {detail.parseWarnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                ) : (
                  <p>No parse warnings were recorded.</p>
                )}
              </div>

              <div className="evidence-card">
                <span className="parsing-profile-grid__label">Processing warnings</span>
                {detail.processingWarnings.length ? (
                  <ul className="bullet-list">
                    {detail.processingWarnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                ) : (
                  <p>No processing warnings were recorded.</p>
                )}
              </div>

              {detail.errorCode || detail.errorMessage ? (
                <div className="evidence-card">
                  <span className="parsing-profile-grid__label">Run error</span>
                  <p>{detail.errorCode ?? "Unknown error"}</p>
                  {detail.errorMessage ? <p>{detail.errorMessage}</p> : null}
                </div>
              ) : null}
            </div>
          </Panel>

          <Panel className="table-card">
            <div className="stack">
              <div className="skill-list">
                <AlertTriangle size={16} />
                <h3>Optimization hints</h3>
              </div>
              {detail.optimizationHints.length ? (
                <ul className="bullet-list">
                  {detail.optimizationHints.map((hint) => (
                    <li key={hint}>{hint}</li>
                  ))}
                </ul>
              ) : (
                <p>No immediate parser optimization suggestions were generated for this document.</p>
              )}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
