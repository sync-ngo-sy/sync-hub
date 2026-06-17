import { Search } from "lucide-react";
import { Link } from "react-router-dom";
import { PlatformScopeControl } from "@/components/PlatformScopeControl";
import { PageIntro } from "@/components/ui";
import type { TenantMembership } from "@/lib/auth";
import type { PlatformScopeMode } from "@/lib/platformScope";

type CandidateListPageHeaderProps = {
  isPlatformAdmin: boolean;
  scopeMode: PlatformScopeMode;
  currentWorkspace: TenantMembership | null;
  workspaceOptions: TenantMembership[];
  onChangeScopeMode: (mode: PlatformScopeMode) => void;
  onChangeWorkspace: (workspaceId: string) => void;
};

export function CandidateListPageHeader(props: CandidateListPageHeaderProps) {
  return (
    <PageIntro
      eyebrow="Talent pool"
      title="Candidates"
      description="Browse, filter, and group your candidate corpus. Use this directory when you need a structured list rather than semantic search ranking."
      actions={
        <div className="job-page-actions">
          <PlatformScopeControl {...props} />
          <Link className="button button--secondary" to="/search">
            <Search size={16} />
            Search
          </Link>
        </div>
      }
    />
  );
}
