import { Building2, Globe2 } from "lucide-react";
import type { TenantMembership } from "@/lib/auth";
import type { PlatformScopeMode } from "@/lib/platformScope";
import { Tag } from "@/components/ui";

type PlatformScopeControlProps = {
  isPlatformAdmin: boolean;
  scopeMode: PlatformScopeMode;
  onChangeScopeMode: (mode: PlatformScopeMode) => void;
  currentWorkspace: TenantMembership | null;
  workspaceOptions: TenantMembership[];
  onChangeWorkspace: (tenantId: string) => void;
};

export function PlatformScopeControl({
  isPlatformAdmin,
  scopeMode,
  onChangeScopeMode,
  currentWorkspace,
  workspaceOptions,
  onChangeWorkspace,
}: PlatformScopeControlProps) {
  if (!isPlatformAdmin) {
    return null;
  }

  return (
    <div className="platform-scope-control">
      <div className="platform-scope-control__switch">
        <button
          className={scopeMode === "current" ? "button button--primary" : "button button--secondary"}
          type="button"
          onClick={() => onChangeScopeMode("current")}
        >
          <Building2 size={14} />
          Current Workspace
        </button>
        <button
          className={scopeMode === "all" ? "button button--primary" : "button button--secondary"}
          type="button"
          onClick={() => onChangeScopeMode("all")}
        >
          <Globe2 size={14} />
          All Workspaces
        </button>
      </div>

      {scopeMode === "current" ? (
        <label className="platform-scope-control__workspace">
          <span>Workspace</span>
          <select
            className="form-select"
            value={currentWorkspace?.id ?? ""}
            onChange={(event) => onChangeWorkspace(event.target.value)}
          >
            {workspaceOptions.map((workspace) => (
              <option key={workspace.id} value={workspace.id}>
                {workspace.name}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <Tag tone="primary">{workspaceOptions.length} workspaces in scope</Tag>
      )}
    </div>
  );
}
