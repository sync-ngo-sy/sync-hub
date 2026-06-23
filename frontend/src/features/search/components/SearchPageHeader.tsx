import { BookmarkCheck } from "lucide-react";
import { PlatformScopeControl } from "@/components/PlatformScopeControl";
import type { TenantMembership } from "@/lib/auth";
import type { PlatformScopeMode } from "@/lib/platformScope";

type SearchPageHeaderProps = {
  currentWorkspace: TenantMembership | null;
  isPlatformAdmin: boolean;
  scopeMode: PlatformScopeMode;
  shortlistCount: number;
  workspaceOptions: TenantMembership[];
  onChangeScopeMode: (mode: PlatformScopeMode) => void;
  onChangeWorkspace: (tenantId: string) => void;
  onOpenShortlist: () => void;
};

export function SearchPageHeader({
  currentWorkspace,
  isPlatformAdmin,
  scopeMode,
  shortlistCount,
  workspaceOptions,
  onChangeScopeMode,
  onChangeWorkspace,
  onOpenShortlist,
}: SearchPageHeaderProps) {
  return (
    <section className="search-page-header" aria-labelledby="search-page-title">
      <div className="search-page-header__copy">
        <span className="eyebrow">Candidate search</span>
        <h1 id="search-page-title">Search candidates</h1>
      </div>

      <div className="search-page-header__actions">
        {shortlistCount ? (
          <button
            className="button button--secondary search-shortlist-button"
            type="button"
            onClick={onOpenShortlist}
            aria-label={`Open shortlist with ${shortlistCount} candidates`}
          >
            <BookmarkCheck size={16} />
            <span>Shortlist</span>
            <strong>{shortlistCount}</strong>
          </button>
        ) : null}
        <PlatformScopeControl
          isPlatformAdmin={isPlatformAdmin}
          scopeMode={scopeMode}
          onChangeScopeMode={onChangeScopeMode}
          currentWorkspace={currentWorkspace}
          workspaceOptions={workspaceOptions}
          onChangeWorkspace={onChangeWorkspace}
        />
      </div>
    </section>
  );
}
