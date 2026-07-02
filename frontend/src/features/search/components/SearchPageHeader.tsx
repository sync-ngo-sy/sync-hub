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
  workspaceOptions,
  onChangeScopeMode,
  onChangeWorkspace,
}: SearchPageHeaderProps) {
  return (
    <section className="search-page-header" aria-labelledby="search-page-title">

      <div className="search-page-header__actions">
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
