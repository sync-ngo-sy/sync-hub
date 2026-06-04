import { Building2, FileText, ShieldCheck, Users } from "lucide-react";
import type { TenantMembership } from "@/lib/auth";
import type { WorkspaceStats } from "@/lib/contracts";

type WorkspaceStatsStripProps = {
  currentTenant: TenantMembership | null;
  currentWorkspace: TenantMembership | null;
  isAllScope: boolean;
  loading: boolean;
  stats: WorkspaceStats | null;
  workspaceCount: number;
};

export function WorkspaceStatsStrip({
  currentTenant,
  currentWorkspace,
  isAllScope,
  loading,
  stats,
  workspaceCount,
}: WorkspaceStatsStripProps) {
  if (loading) {
    return (
      <div className="search-metrics-strip" aria-busy="true" aria-label="Loading workspace statistics">
        {["cv-pool", "candidate-profiles", "workspace"].map((item) => (
          <div key={item} className="search-metric search-metric--loading">
            <span className="stat-card__skeleton search-metric__icon" />
            <div>
              <span className="stat-card__skeleton search-metric__label" />
              <span className="stat-card__skeleton search-metric__value" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!stats) {
    return null;
  }

  return (
    <div className="search-metrics-strip" aria-label="Search corpus summary">
      <div className="search-metric">
        <span className="search-metric__icon">
          <FileText size={16} />
        </span>
        <div>
          <span>CV Pool</span>
          <strong>{stats.documentCount.toLocaleString()}</strong>
          <small>indexed documents</small>
        </div>
      </div>

      <div className="search-metric">
        <span className="search-metric__icon search-metric__icon--secondary">
          <Users size={16} />
        </span>
        <div>
          <span>Candidate Profiles</span>
          <strong>{stats.candidateCount.toLocaleString()}</strong>
          <small>searchable</small>
        </div>
      </div>

      <div className="search-metric">
        <span className="search-metric__icon search-metric__icon--tertiary">
          {isAllScope ? <ShieldCheck size={16} /> : currentWorkspace ? <Building2 size={16} /> : <ShieldCheck size={16} />}
        </span>
        <div>
          <span>Workspace</span>
          <strong>{isAllScope ? "All workspaces" : currentWorkspace?.name ?? currentTenant?.name ?? "Demo Workspace"}</strong>
          <small>{isAllScope ? `${workspaceCount} workspaces` : currentWorkspace ? `${currentWorkspace.role} access` : "tenant-scoped pool"}</small>
        </div>
      </div>
    </div>
  );
}
