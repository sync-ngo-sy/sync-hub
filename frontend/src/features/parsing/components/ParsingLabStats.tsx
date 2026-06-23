import { StatCard } from "@/components/ui";
import type { TenantMembership } from "@/lib/auth";
import type { ParserProfile } from "@/lib/contracts";

type ParsingLabStatsProps = {
  activeProfile: ParserProfile | null;
  adminMemberships: TenantMembership[];
  fetching: boolean;
  profiles: ParserProfile[];
  workspacesRepresented: number;
};

export function ParsingLabStats({
  activeProfile,
  adminMemberships,
  fetching,
  profiles,
  workspacesRepresented,
}: ParsingLabStatsProps) {
  return (
    <div className="stats-grid">
      <StatCard label="Profiles" value={`${profiles.length}`} delta={fetching ? "Refreshing" : "versioned"} />
      <StatCard
        label="Active profile"
        value={activeProfile?.name ?? "None"}
        delta={activeProfile?.promptVersion ?? "not published"}
        tone="secondary"
      />
      <StatCard
        label="Evaluated docs"
        value={`${profiles.reduce((sum, profile) => sum + profile.documentsEvaluated, 0)}`}
        delta="across profiles"
        tone="tertiary"
      />
      <StatCard
        label="Workspaces"
        value={`${workspacesRepresented}`}
        delta={`${adminMemberships.length} total on platform`}
      />
    </div>
  );
}
