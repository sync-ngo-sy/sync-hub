import { useRef, useEffect } from "react";
import { X } from "lucide-react";
import { Link } from "react-router-dom";
import { Avatar, Tag } from "@/components/ui";
import type { CandidateDetail } from "@/lib/contracts";

type Props = {
  open: boolean;
  onClose: () => void;
  contextCandidateIds: string[];
  contextCandidates: CandidateDetail[];
  loadingContext: boolean;
  overflowCount: number;
};

export function ContextDrawer({
                                open,
                                onClose,
                                contextCandidateIds,
                                contextCandidates,
                                loadingContext,
                                overflowCount,
                              }: Props) {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  return (
    <>
      <div
        className={`context-drawer-backdrop ${open ? "context-drawer-backdrop--open" : ""}`}
        onClick={onClose}
      />
      <aside
        id="chat-context-drawer"
        className={`context-drawer ${open ? "context-drawer--open" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="chat-context-drawer-title"
        style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}
      >
        <div className="context-drawer__header">
          <div className="stack">
            <span className="eyebrow">Context</span>
            <h3 id="chat-context-drawer-title">Candidates in Scope</h3>
          </div>
          <button
            ref={closeButtonRef}
            className="icon-button"
            type="button"
            onClick={onClose}
            aria-label="Close context drawer"
          >
            <X size={18} />
          </button>
        </div>

        <div className="context-drawer__body">
          <div className="chat-context-grid">
            {loadingContext ? (
              <p className="muted">Loading candidate context…</p>
            ) : !contextCandidateIds.length ? (
              <p className="muted">No shortlist has been derived yet.</p>
            ) : (
              contextCandidates.map((candidate: CandidateDetail) => (
                <Link
                  key={candidate.candidateId}
                  className="chat-context-card"
                  to={`/dossier/${candidate.candidateId}`}
                  onClick={onClose}
                >
                  <div className="candidate-card__identity">
                    <Avatar name={candidate.name} hue={candidate.avatarHue} size="sm" />
                    <div className="stack">
                      <strong>{candidate.name}</strong>
                      <p>{candidate.currentTitle}</p>
                    </div>
                  </div>
                  <div className="skill-list">
                    <Tag>{candidate.seniority}</Tag>
                    <Tag tone="primary">{candidate.primaryRole}</Tag>
                  </div>
                </Link>
              ))
            )}
            {overflowCount > 0 ? <Tag>+{overflowCount} more in scope</Tag> : null}
          </div>
        </div>
      </aside>
    </>
  );
}
