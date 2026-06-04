import { useEffect, useRef, useState } from "react";
import { Building2, Check, ChevronDown, Globe2 } from "lucide-react";
import type { TenantMembership } from "@/lib/auth";
import type { PlatformScopeMode } from "@/lib/platformScope";
import { TenantBadge } from "@/components/ui";

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
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setWorkspaceMenuOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setWorkspaceMenuOpen(false);
      }
    }

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, []);

  if (!isPlatformAdmin) {
    return null;
  }

  return (
    <div className="platform-scope-control">
      <div className="platform-scope-control__switch">
        <div ref={rootRef} className="platform-scope-control__workspace-dropdown">
          <button
            className={scopeMode === "current"
              ? "button button--primary platform-scope-control__workspace-trigger"
              : "button button--secondary platform-scope-control__workspace-trigger"}
            type="button"
            aria-haspopup="listbox"
            aria-expanded={workspaceMenuOpen}
            onClick={() => {
              onChangeScopeMode("current");
              setWorkspaceMenuOpen((current) => !current);
            }}
          >
            <TenantBadge
              name={currentWorkspace?.name ?? "Workspace"}
              iconUrl={currentWorkspace?.iconUrl}
              size="sm"
            />
            <span className="platform-scope-control__workspace-copy">
              <span className="platform-scope-control__workspace-caption">Current Workspace</span>
              <strong>{currentWorkspace?.name ?? "Select workspace"}</strong>
            </span>
            <ChevronDown
              size={14}
              className={`platform-scope-control__workspace-chevron${workspaceMenuOpen ? " platform-scope-control__workspace-chevron--open" : ""}`}
            />
          </button>

          {workspaceMenuOpen ? (
            <div className="platform-scope-control__workspace-menu" role="listbox">
              {workspaceOptions.map((workspace) => {
                const isSelected = workspace.id === currentWorkspace?.id;

                return (
                  <button
                    key={workspace.id}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    className={`platform-scope-control__workspace-option${isSelected ? " platform-scope-control__workspace-option--active" : ""}`}
                    onClick={() => {
                      onChangeWorkspace(workspace.id);
                      onChangeScopeMode("current");
                      setWorkspaceMenuOpen(false);
                    }}
                  >
                    <span className="platform-scope-control__workspace-option-main">
                      <TenantBadge
                        name={workspace.name}
                        iconUrl={workspace.iconUrl}
                        size="sm"
                      />
                      <span className="platform-scope-control__workspace-option-copy">
                        <strong>{workspace.name}</strong>
                        <span>{workspace.role}</span>
                      </span>
                    </span>
                    {isSelected ? <Check size={14} /> : null}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
        <button
          className={scopeMode === "all" ? "button button--primary" : "button button--secondary"}
          type="button"
          onClick={() => {
            setWorkspaceMenuOpen(false);
            onChangeScopeMode("all");
          }}
        >
          <Globe2 size={14} />
          All Workspaces
        </button>
      </div>
    </div>
  );
}
