import {useState, type ReactNode} from "react";
import {PanelRightOpen, RefreshCcw} from "lucide-react";
import {PlatformScopeControl} from "@/components/PlatformScopeControl";
import type {PlatformScopeMode} from "@/lib/platformScope";

type Props = {
  scopedMode: boolean;
  contextCandidateIds: string[];
  isAllScope: boolean;
  workspaceOptions: any[];
  currentWorkspace: any;
  answersCount: number;
  isPlatformAdmin: boolean;
  scopeMode: PlatformScopeMode;
  setScopeMode: (mode: PlatformScopeMode) => void;
  setWorkspaceId: (id: string) => void;
  onOpenContext: () => void;
  onResetThread: () => void;
};

function Pill({children, onClick, active}: {children: ReactNode; onClick?: () => void; active?: boolean}) {
  const [isHovered, setIsHovered] = useState(false);
  const Component: any = onClick ? "button" : "div";
  const isClickable = !!onClick;

  // Background color turns teal-glow on hover (just like active General Mode)
  const getBackground = () => {
    if (active || (isHovered && isClickable)) {
      return "rgba(80, 193, 184, 0.10)"; // General Mode style teal-glow
    }
    return "rgba(255, 255, 255, 0.035)"; // Base gray state
  };

  // Text/Icon color turns teal on hover (just like active General Mode)
  const getColor = () => {
    if (active || (isHovered && isClickable)) {
      return "var(--primary)"; // General Mode style teal
    }
    return "var(--text-soft)"; // Base soft gray text
  };

  return (
    <Component
      type={onClick ? "button" : undefined}
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "8px",
        padding: "8px 16px",
        borderRadius: "9999px",
        background: getBackground(),
        color: getColor(),
        fontSize: "0.85rem",
        fontWeight: 500,
        textTransform: "capitalize",
        border: "none",
        cursor: isClickable ? "pointer" : "default",
        whiteSpace: "nowrap",
        transition: "background-color 180ms ease, color 180ms ease",
      }}
    >
      {children}
    </Component>
  );
}

export function ChatMetaRow({
                              scopedMode,
                              contextCandidateIds,
                              isAllScope,
                              workspaceOptions,
                              currentWorkspace,
                              answersCount,
                              isPlatformAdmin,
                              scopeMode,
                              setScopeMode,
                              setWorkspaceId,
                              onOpenContext,
                              onResetThread,
                            }: Props) {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        justifyContent: "center",
        gap: "8px",
        marginTop: "16px",
      }}
    >
      {scopedMode ? (
        <Pill onClick={onOpenContext} active>
          Scoped mode · {contextCandidateIds.length} candidates
        </Pill>
      ) : (
        <Pill active>General mode</Pill>
      )}

      {!scopedMode ? (
        <Pill>
          {isAllScope ? `${workspaceOptions.length} workspaces` : currentWorkspace?.name ?? "Current workspace"}
        </Pill>
      ) : null}

      {answersCount > 0 ? <Pill>{answersCount} answers</Pill> : null}

      <Pill onClick={onOpenContext}>
        <PanelRightOpen size={14}/>
        {contextCandidateIds.length ? `Context (${contextCandidateIds.length})` : "Context"}
      </Pill>

      {!scopedMode ? (
        <PlatformScopeControl
          isPlatformAdmin={isPlatformAdmin}
          scopeMode={scopeMode}
          onChangeScopeMode={setScopeMode}
          currentWorkspace={currentWorkspace}
          workspaceOptions={workspaceOptions}
          onChangeWorkspace={setWorkspaceId}
        />
      ) : null}

      {scopedMode ? (
        <Pill onClick={onResetThread}>
          <RefreshCcw size={14}/>
          Reset thread
        </Pill>
      ) : null}
    </div>
  );
}
