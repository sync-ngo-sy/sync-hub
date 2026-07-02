import type { TenantMembership } from "@/lib/auth";
import type { WorkspaceStats } from "@/lib/contracts";
import cardViewIcon from "@/assets/card_view.svg";
import groupFilledIcon from "@/assets/group_filled.svg";
import workspaceIcon from "@/assets/workspace.svg";

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
      <div
        className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full"
        aria-busy="true"
        aria-label="Loading workspace statistics"
      >
        {[1, 2, 3].map((item) => (
          <div
            key={item}
            className="flex items-center gap-4 p-4 bg-[var(--panel)] border border-[var(--border)] rounded-[var(--radius)] shadow-[var(--shadow)] animate-pulse"
          >
            <div className="w-5 h-5 rounded-md bg-[var(--border-strong)]" />
            <div className="h-4 w-2/3 rounded bg-[var(--border-strong)]" />
          </div>
        ))}
      </div>
    );
  }

  if (!stats) {
    return null;
  }

  const cardsData = [
    {
      id: "cv-pool",
      icon: cardViewIcon,
      title: "CV Pool",
      value: stats.documentCount.toLocaleString(),
      suffix: "indexed Documents",
    },
    {
      id: "candidates",
      icon: groupFilledIcon,
      title: "Candidate Profiles",
      value: stats.candidateCount.toLocaleString(),
      suffix: "searchable",
    },
    {
      id: "workspace",
      icon: workspaceIcon,
      title: "Workspace",
      value: isAllScope
        ? "All workspaces"
        : (currentWorkspace?.name ?? currentTenant?.name ?? "Demo Workspace"),
      suffix: isAllScope
        ? `${workspaceCount} workspaces`
        : currentWorkspace
          ? `${currentWorkspace.role} access`
          : "tenant-scoped Pool",
    },
  ];

  return (
    <div
      className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full font-sans"
      aria-label="Search corpus summary"
    >
      {cardsData.map((card) => (
        <div
          key={card.id}
          className="flex items-center gap-4 p-4 bg-[var(--panel)] border border-[var(--border)] rounded-[var(--radius)] shadow-[var(--shadow)] hover:border-[var(--border-strong)] transition-colors duration-200"
        >
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[var(--border)] shrink-0">
            <img src={card.icon} alt="" width={16} height={16} />
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-sm text-[var(--text-muted)]">
            <span className="font-medium text-[var(--text)]">{card.title}</span>
            <span className="text-[var(--text-soft)] select-none">-</span>
            <strong className="font-semibold text-[var(--primary)]">
              {card.value}
            </strong>
            <span className="text-[var(--text-soft)] select-none">•</span>
            <span className="first-letter:uppercase text-xs text-[var(--text-soft)]">
              {card.suffix}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
