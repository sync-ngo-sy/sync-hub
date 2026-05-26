import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Building2, FileStack, FlaskConical, Settings2, Sparkles, Users2 } from "lucide-react";
import { Link } from "react-router-dom";
import { EmptyState, PageIntro, Panel, StatCard, Tag } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import type { ParserProfile, ParsingOverview, WorkspaceStats } from "@/lib/contracts";
import { platformApi } from "@/lib/platformApi";

function formatPercent(value: number) {
  return `${Math.round(value)}%`;
}

function formatWorkspaceLabel(count: number) {
  return `${count} ${count === 1 ? "workspace" : "workspaces"}`;
}

function toneForStatus(failedCount: number, needsReviewCount: number) {
  if (failedCount > 0) {
    return "warning" as const;
  }
  if (needsReviewCount > 0) {
    return "primary" as const;
  }
  return "success" as const;
}

type WorkspaceRollup = {
  tenantId: string;
  name: string;
  candidates: number;
  documents: number;
  averageParse: number;
  needsReview: number;
  failed: number;
  activeProfiles: number;
};

const emptyOverview: ParsingOverview = {
  overallParsedPercentage: 0,
  averageConfidence: 0,
  documentsCount: 0,
  completedCount: 0,
  needsReviewCount: 0,
  failedCount: 0,
  items: [],
};

const emptyWorkspaceStats: WorkspaceStats = {
  documentCount: 0,
  candidateCount: 0,
  companyCount: 0,
};

function StatSkeletonGrid() {
  return (
    <div className="stats-grid" aria-hidden="true">
      {["candidates", "workspaces", "cv-pool", "profiles"].map((item) => (
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

function AdminDashboardSkeleton() {
  return (
    <div className="admin-grid" aria-busy="true" aria-label="Loading admin dashboard">
      <Panel className="table-card parsing-skeleton-card">
        <div className="stack">
          <span className="stat-card__skeleton parsing-skeleton__title" />
          <span className="stat-card__skeleton parsing-skeleton__subtitle" />
          <div className="parsing-skeleton-table">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="parsing-skeleton-row">
                <span className="stat-card__skeleton parsing-skeleton__cell parsing-skeleton__cell--workspace" />
                <span className="stat-card__skeleton parsing-skeleton__cell parsing-skeleton__cell--small" />
                <span className="stat-card__skeleton parsing-skeleton__cell parsing-skeleton__cell--small" />
                <span className="stat-card__skeleton parsing-skeleton__cell" />
              </div>
            ))}
          </div>
        </div>
      </Panel>

      <Panel className="table-card parsing-skeleton-card">
        <div className="stack">
          <span className="stat-card__skeleton parsing-skeleton__title" />
          {Array.from({ length: 3 }).map((_, index) => (
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

export function PlatformAdminDashboardPage() {
  const { adminMemberships, enabled, isAdmin, loading } = useAuth();
  const [workspaceStats, setWorkspaceStats] = useState<WorkspaceStats>(emptyWorkspaceStats);
  const [overview, setOverview] = useState<ParsingOverview>(emptyOverview);
  const [profiles, setProfiles] = useState<ParserProfile[]>([]);
  const [fetching, setFetching] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const adminTenantIds = useMemo(() => adminMemberships.map((membership) => membership.id), [adminMemberships]);

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

    Promise.allSettled([
      platformApi.getWorkspaceStats(adminTenantIds),
      platformApi.getParsingOverview(adminTenantIds, { pageSize: 0 }),
      platformApi.getParserProfiles(adminTenantIds),
    ])
      .then(([workspaceStatsResult, overviewResult, profilesResult]) => {
        if (!active) {
          return;
        }

        const errors: string[] = [];
        if (workspaceStatsResult.status === "fulfilled") {
          setWorkspaceStats(workspaceStatsResult.value);
        } else {
          errors.push(`Workspace stats: ${workspaceStatsResult.reason instanceof Error ? workspaceStatsResult.reason.message : String(workspaceStatsResult.reason)}`);
        }

        if (overviewResult.status === "fulfilled") {
          setOverview(overviewResult.value);
        } else {
          errors.push(`Parsing diagnostics: ${overviewResult.reason instanceof Error ? overviewResult.reason.message : String(overviewResult.reason)}`);
        }

        if (profilesResult.status === "fulfilled") {
          setProfiles(profilesResult.value);
        } else {
          errors.push(`Parser profiles: ${profilesResult.reason instanceof Error ? profilesResult.reason.message : String(profilesResult.reason)}`);
        }

        setError(errors.length ? errors.join(" ") : null);
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
  }, [adminTenantIds, enabled, isAdmin, loading]);

  const workspaceRows = useMemo<WorkspaceRollup[]>(() => {
    const activeProfilesByTenant = new Map<string, number>();
    for (const profile of profiles) {
      if (profile.status !== "active") {
        continue;
      }
      activeProfilesByTenant.set(profile.tenantId, (activeProfilesByTenant.get(profile.tenantId) ?? 0) + 1);
    }

    if (overview.workspaceRollups?.length) {
      const rollupByTenant = new Map(overview.workspaceRollups.map((rollup) => [rollup.tenantId, rollup]));
      return adminMemberships
        .map((membership) => {
          const rollup = rollupByTenant.get(membership.id);

          return {
            tenantId: membership.id,
            name: membership.name,
            candidates: rollup?.candidates ?? 0,
            documents: rollup?.documents ?? 0,
            averageParse: rollup?.averageParse ?? 0,
            needsReview: rollup?.needsReview ?? 0,
            failed: rollup?.failed ?? 0,
            activeProfiles: activeProfilesByTenant.get(membership.id) ?? 0,
          };
        })
        .sort((left, right) => {
          if (right.documents !== left.documents) {
            return right.documents - left.documents;
          }
          if (right.needsReview !== left.needsReview) {
            return right.needsReview - left.needsReview;
          }
          return left.name.localeCompare(right.name);
        });
    }

    const aggregates = new Map<
      string,
      {
        candidates: Set<string>;
        documents: number;
        parseTotal: number;
        needsReview: number;
        failed: number;
      }
    >();

    for (const item of overview.items) {
      const current = aggregates.get(item.tenantId) ?? {
        candidates: new Set<string>(),
        documents: 0,
        parseTotal: 0,
        needsReview: 0,
        failed: 0,
      };
      current.documents += 1;
      current.parseTotal += item.parsedPercentage;
      if (item.candidateId) {
        current.candidates.add(item.candidateId);
      }
      if (item.needsAttention) {
        current.needsReview += 1;
      }
      if (item.status === "failed" || item.status === "partial_failed") {
        current.failed += 1;
      }
      aggregates.set(item.tenantId, current);
    }

    return adminMemberships
      .map((membership) => {
        const aggregate = aggregates.get(membership.id);
        const documents = aggregate?.documents ?? 0;

        return {
          tenantId: membership.id,
          name: membership.name,
          candidates: aggregate?.candidates.size ?? 0,
          documents,
          averageParse: documents ? aggregate!.parseTotal / documents : 0,
          needsReview: aggregate?.needsReview ?? 0,
          failed: aggregate?.failed ?? 0,
          activeProfiles: activeProfilesByTenant.get(membership.id) ?? 0,
        };
      })
      .sort((left, right) => {
        if (right.documents !== left.documents) {
          return right.documents - left.documents;
        }
        if (right.needsReview !== left.needsReview) {
          return right.needsReview - left.needsReview;
        }
        return left.name.localeCompare(right.name);
      });
  }, [adminMemberships, overview.items, overview.workspaceRollups, profiles]);

  const activeProfiles = profiles.filter((profile) => profile.status === "active").length;
  const draftProfiles = profiles.filter((profile) => profile.status === "draft").length;
  const documentsWithWarnings = overview.documentsWithWarnings ?? overview.items.filter((item) => item.warnings.length > 0).length;
  const missingContact = overview.missingContactCount ?? overview.items.filter((item) => item.missingFields.includes("email") || item.missingFields.includes("phone")).length;
  const topWorkspace = workspaceRows.find((item) => item.documents > 0) ?? null;

  if (enabled && !loading && !isAdmin) {
    return (
      <div className="page-stack">
        <EmptyState
          title="Admin access required"
          detail="Platform dashboard is restricted to platform admins."
          action={
            <Link className="button button--secondary" to="/search">
              Return to Search
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="page-stack">
      <PageIntro
        eyebrow="Admin"
        title="Platform dashboard"
        description="Cross-workspace operational view for candidate volume, tenant coverage, parser health, and rollout readiness."
        actions={
          <>
            <Link className="button button--secondary" to="/admin/parsing">
              Parsing Quality
            </Link>
            <Link className="button button--secondary" to="/admin/accounts">
              Account provisioning
            </Link>
            <Link className="button button--secondary" to="/admin/parsing/lab">
              Parsing Lab
            </Link>
            <Link className="button button--secondary" to="/admin/settings">
              Runtime settings
            </Link>
          </>
        }
      />

      {error ? <div className="status-banner">{error}</div> : null}

      {fetching && !hasLoaded ? (
        <>
          <StatSkeletonGrid />
          <StatSkeletonGrid />
          <AdminDashboardSkeleton />
        </>
      ) : (
        <>
      <div className="stats-grid">
        <StatCard
          label="Total candidates"
          value={workspaceStats.candidateCount.toLocaleString()}
          delta={fetching ? "Refreshing" : `${workspaceStats.documentCount.toLocaleString()} CVs indexed`}
          icon={<Users2 size={16} />}
        />
        <StatCard
          label="Total workspaces"
          value={adminMemberships.length.toLocaleString()}
          delta={formatWorkspaceLabel(adminMemberships.length)}
          tone="secondary"
          icon={<Building2 size={16} />}
        />
        <StatCard
          label="CV pool"
          value={workspaceStats.documentCount.toLocaleString()}
          delta={fetching ? "Refreshing" : "source documents"}
          tone="tertiary"
          icon={<FileStack size={16} />}
        />
        <StatCard
          label="Active parser profiles"
          value={activeProfiles.toLocaleString()}
          delta={`${draftProfiles} drafts`}
          icon={<FlaskConical size={16} />}
        />
      </div>

      <div className="stats-grid">
        <StatCard label="Corpus parse coverage" value={formatPercent(overview.overallParsedPercentage)} delta="platform-wide" />
        <StatCard label="Average confidence" value={formatPercent(overview.averageConfidence)} delta="structured extraction" tone="secondary" />
        <StatCard label="Needs review" value={overview.needsReviewCount.toLocaleString()} delta={`${documentsWithWarnings} with warnings`} tone="tertiary" />
        <StatCard label="Failed parses" value={overview.failedCount.toLocaleString()} delta={`${missingContact} missing contact`} icon={<AlertTriangle size={16} />} />
      </div>

      <div className="admin-grid">
        <Panel className="table-card">
          <div className="stack">
            <div className="signal-row">
              <div>
                <h3>Workspace rollup</h3>
                <p>Use this to see which tenants are carrying the most candidate volume and where parser quality still needs intervention.</p>
              </div>
              <Tag tone="primary">{adminMemberships.length} workspaces</Tag>
            </div>

            <table>
              <thead>
                <tr>
                  <th>Workspace</th>
                  <th>Candidates</th>
                  <th>CVs</th>
                  <th>Parse</th>
                  <th>Needs review</th>
                  <th>Active profiles</th>
                </tr>
              </thead>
              <tbody>
                {workspaceRows.map((item) => (
                  <tr key={item.tenantId}>
                    <td>
                      <div className="stack">
                        <strong>{item.name}</strong>
                        <span className="muted">{item.failed ? `${item.failed} failed` : "No failed parses"}</span>
                      </div>
                    </td>
                    <td>{item.candidates.toLocaleString()}</td>
                    <td>{item.documents.toLocaleString()}</td>
                    <td>{item.documents ? formatPercent(item.averageParse) : "—"}</td>
                    <td>
                      <Tag tone={toneForStatus(item.failed, item.needsReview)}>
                        {item.needsReview.toLocaleString()}
                      </Tag>
                    </td>
                    <td>{item.activeProfiles.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
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
                <strong>Platform status</strong>
                <Tag tone={overview.failedCount ? "warning" : "success"}>{overview.failedCount ? "Needs attention" : "Healthy"}</Tag>
              </div>
              <p>
                {topWorkspace
                  ? `${topWorkspace.name} currently has the largest indexed corpus with ${topWorkspace.documents.toLocaleString()} CVs and ${formatPercent(topWorkspace.averageParse)} average parse coverage.`
                  : "No workspace documents have been indexed yet."}
              </p>
            </div>

            <div className="evidence-card">
              <div className="signal-row">
                <strong>Review queue</strong>
                <Tag tone={overview.needsReviewCount ? "warning" : "success"}>{overview.needsReviewCount.toLocaleString()}</Tag>
              </div>
              <p>
                {overview.needsReviewCount
                  ? `${overview.needsReviewCount.toLocaleString()} documents need parser review, with ${documentsWithWarnings.toLocaleString()} already carrying explicit warnings.`
                  : "No documents are currently below the parser review threshold."}
              </p>
            </div>

            <div className="evidence-card">
              <div className="signal-row">
                <strong>Parser rollout</strong>
                <Tag tone={activeProfiles ? "primary" : "warning"}>{activeProfiles.toLocaleString()} active</Tag>
              </div>
              <p>
                {activeProfiles
                  ? `${activeProfiles.toLocaleString()} active parser profiles are published across the platform, with ${draftProfiles.toLocaleString()} drafts still under evaluation.`
                  : "No active parser profile is published yet. Promote a profile before the next larger ingest."}
              </p>
            </div>

            <Link to="/admin/parsing" className="inline-cta">
              <div>
                <strong>Open parsing queue</strong>
                <p>Inspect weak parses, failed runs, and field-coverage gaps.</p>
              </div>
            </Link>
            <Link to="/admin/parsing/lab" className="inline-cta">
              <div>
                <strong>Manage parser profiles</strong>
                <p>Update model, prompt, OCR, and embedding versions for the next run.</p>
              </div>
            </Link>
            <Link to="/admin/settings" className="inline-cta">
              <div className="stack">
                <div className="skill-list">
                  <Settings2 size={16} />
                  <strong>Runtime settings</strong>
                </div>
                <p>Change Gemini model ID, LLM provider, and timeouts for search / ask / agent without a CLI deploy.</p>
              </div>
            </Link>
          </div>
        </Panel>
      </div>
        </>
      )}
    </div>
  );
}
