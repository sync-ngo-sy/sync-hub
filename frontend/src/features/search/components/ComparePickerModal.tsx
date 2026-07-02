import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Avatar, ScorePill, Tag } from "@/components/ui";
import type { CandidateSearchResult } from "@/lib/contracts";
import { formatYearsExperience } from "@/lib/experience";

import closeIcon from "../../../../src/assets/close.svg";
import checkIcon from "../../../../src/assets/check.svg";
import removeIcon from "@/assets/remove.svg";

type ComparePickerModalProps = {
  sourceCandidate: CandidateSearchResult;
  otherCandidates: CandidateSearchResult[];
  onClose: () => void;
};

function capitalize(str?: string): string {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function ComparePickerModal({
                                     sourceCandidate,
                                     otherCandidates,
                                     onClose,
                                   }: ComparePickerModalProps) {
  const [isAnimating, setIsAnimating] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    requestAnimationFrame(() => setIsAnimating(true));
  }, []);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") handleClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  function handleClose() {
    setIsAnimating(false);
    setTimeout(onClose, 300);
  }

  function toggleCandidate(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  const compareHref = useMemo(() => {
    const ids = [sourceCandidate.candidateId, ...Array.from(selectedIds)];
    return `/compare?ids=${ids.join(",")}`;
  }, [sourceCandidate.candidateId, selectedIds]);

  const canCompare = selectedIds.size > 0;
  const selectedCandidates = useMemo(
    () => otherCandidates.filter((c) => selectedIds.has(c.candidateId)),
    [otherCandidates, selectedIds],
  );

  return (
    <div
      onClick={(e) => e.target === e.currentTarget && handleClose()}
      className={`fixed inset-0 z-[9999] flex items-center justify-center p-4 transition-all duration-300 ease-in-out cursor-default outline-none
        ${isAnimating ? "bg-black/60 backdrop-blur-md" : "bg-black/0 backdrop-blur-none pointer-events-none"}`}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-5xl bg-[#39393a] border border-[var(--border)] rounded-[var(--radius,22px)] shadow-[var(--shadow)] overflow-hidden flex flex-col max-h-[85vh] transition-all duration-300 ease-in-out outline-none"
        style={{
          transform: isAnimating ? "scale(100%)" : "scale(95%)",
          opacity: isAnimating ? 1 : 0,
        }}
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-[var(--border)] shrink-0 gap-4">
          <div className="flex flex-col gap-1.5">
            <h2 className="text-2xl font-bold text-[var(--text)] m-0 leading-tight">
              Compare Candidates
            </h2>
            <span className="text-[15px] text-[var(--text-muted)]">
              Pick one or more candidates to compare with{" "}
              <span className="text-[var(--text)] font-semibold">{sourceCandidate.name}</span>
            </span>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="w-10 h-10 rounded-[12px] flex items-center justify-center bg-[var(--border)] hover:bg-[var(--border-strong)] text-[var(--text-muted)] hover:text-[var(--text)] transition-all duration-200 outline-none border-0 cursor-pointer focus:outline-none focus:ring-0 shrink-0"
          >
            <img src={closeIcon} alt="Close" width={15} height={14} className="opacity-90" />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-1 min-h-0 divide-x divide-[var(--border)]">

          {/* LEFT COLUMN — source candidate + selected list */}
          <div className="w-[280px] shrink-0 bg-[#39393a]/50 flex flex-col">
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">

              {/* Source card */}
              <div>
                <span className="block mb-2.5 text-xs font-semibold uppercase tracking-wider text-[var(--text-soft)] pl-1">
                  Comparing
                </span>
                <div className="p-4 rounded-xl bg-[var(--primary)] border border-transparent">
                  <div className="flex items-center gap-3 mb-3">
                    <Avatar name={sourceCandidate.name} hue={sourceCandidate.avatarHue} size="sm" />
                    <div className="flex flex-col min-w-0">
                      <span className="text-[15px] font-bold text-[#39393a] truncate leading-tight">
                        {sourceCandidate.name}
                      </span>
                      <span className="text-[12px] text-[#39393a]/70 truncate leading-tight mt-0.5">
                        {sourceCandidate.currentTitle}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    <Tag>{capitalize(sourceCandidate.seniority)}</Tag>
                    <Tag>{capitalize(sourceCandidate.primaryRole)}</Tag>
                  </div>
                  <p className="text-[12px] text-[#39393a]/60 mt-2 m-0 select-none">
                    {formatYearsExperience(sourceCandidate.yearsExperience)}
                    {sourceCandidate.location ? ` · ${sourceCandidate.location}` : ""}
                  </p>
                </div>
              </div>

              {/* Selected candidates preview */}
              {selectedCandidates.length > 0 && (
                <div>
                  <span className="block mb-2.5 text-xs font-semibold uppercase tracking-wider text-[var(--text-soft)] pl-1">
                    With ({selectedCandidates.length})
                  </span>
                  <div className="flex flex-col gap-2">
                    {selectedCandidates.map((c) => (
                      <div
                        key={c.candidateId}
                        className="flex items-center gap-2.5 p-3 rounded-xl bg-[var(--border)] border border-[var(--primary)]/40"
                      >
                        <Avatar name={c.name} hue={c.avatarHue} size="sm" />
                        <div className="flex flex-col min-w-0 flex-1">
                          <span className="text-[13px] font-semibold text-[var(--text)] truncate">
                            {c.name}
                          </span>
                          <span className="text-[12px] text-[var(--text-muted)] truncate">
                            {capitalize(c.seniority)}
                          </span>
                        </div>

                        {/* Replaced X Button with removeIcon style */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleCandidate(c.candidateId);
                          }}
                          className="w-7.5 h-7.5 rounded-[8px] flex items-center justify-center transition-all duration-200 outline-none cursor-pointer shrink-0"
                          style={{
                            backgroundColor: "var(--border-strong)",
                            border: "1.5px solid var(--border-strong)",
                            boxSizing: "border-box"
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.12)";
                            e.currentTarget.style.borderColor = "var(--primary)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = "var(--border-strong)";
                            e.currentTarget.style.borderColor = "var(--border-strong)";
                          }}
                          aria-label={`Remove ${c.name}`}
                        >
                          <img
                            src={removeIcon}
                            alt="Remove"
                            className="w-3.5 h-3.5"
                            style={{
                              display: "block",
                              filter: "brightness(0) saturate(100%) invert(100%)" // Pure white close icon contrast
                            }}
                          />
                        </button>

                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT COLUMN — candidate picker */}
          <div className="flex-1 flex flex-col min-h-0 bg-[#39393a]">
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2">
              <span className="block mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-soft)] pl-1">
                Available ({otherCandidates.length})
              </span>

              {otherCandidates.map((candidate) => {
                const isSelected = selectedIds.has(candidate.candidateId);
                return (
                  <div
                    key={candidate.candidateId}
                    onClick={() => toggleCandidate(candidate.candidateId)}
                    className={`relative flex items-center gap-4 p-4 rounded-xl cursor-pointer transition-all duration-150 border select-none
                      ${isSelected
                      ? "bg-[var(--border-strong)] border-[var(--primary)]/60 text-[var(--text)]"
                      : "bg-[var(--border)] border-transparent hover:bg-[var(--border-strong)] hover:border-[var(--border-strong)] text-[var(--text)]"
                    }`}
                  >
                    <Avatar name={candidate.name} hue={candidate.avatarHue} size="sm" />

                    <div className="flex flex-col min-w-0 flex-1 gap-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[15px] font-bold leading-tight truncate">
                          {candidate.name}
                        </span>
                        <span className="text-[13px] text-[var(--text-muted)]">
                          {formatYearsExperience(candidate.yearsExperience)}
                        </span>
                      </div>
                      <span className="text-[13px] text-[var(--text-muted)] truncate">
                        {candidate.currentTitle}
                      </span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        <Tag>{capitalize(candidate.seniority)}</Tag>
                        {candidate.topSkills.slice(0, 2).map((skill) => (
                          <Tag key={skill} tone="primary">
                            {capitalize(skill)}
                          </Tag>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <ScorePill score={candidate.backendMatchRate} label="" />
                      {/* Checkbox */}
                      <div
                        className={`w-6 h-6 rounded-full flex items-center justify-center border-2 transition-all duration-200 shrink-0
                          ${isSelected
                          ? "bg-[var(--primary)] border-[var(--primary)]"
                          : "bg-transparent border-[var(--border-strong)]"
                        }`}
                      >
                        {isSelected && (
                          <img
                            src={checkIcon}
                            alt=""
                            className="w-3 h-3"
                            style={{
                              filter:
                                "brightness(0) saturate(100%) invert(21%) sepia(3%) saturate(137%) hue-rotate(201deg)",
                            }}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Footer */}
            <div className="p-5 border-t border-[var(--border)] bg-[#39393a]/30 shrink-0 flex items-center justify-between gap-4">
              <span className="text-sm text-[var(--text-muted)]">
                {selectedIds.size === 0
                  ? "Select at least one candidate to compare"
                  : `Comparing ${sourceCandidate.name} with ${selectedIds.size} candidate${selectedIds.size > 1 ? "s" : ""}`}
              </span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-5 h-10 rounded-full text-sm font-semibold tracking-wide outline-none border-0 bg-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--border-strong)] hover:text-[var(--text)] cursor-pointer transition-colors duration-200 select-none"
                >
                  Cancel
                </button>
                {canCompare ? (
                  <Link
                    to={compareHref}
                    onClick={handleClose}
                    className="px-5 h-10 rounded-full text-sm font-semibold tracking-wide outline-none border-0 bg-[var(--primary)] text-[#39393a] hover:bg-[var(--primary-strong)] hover:text-[var(--text)] cursor-pointer transition-colors duration-200 flex items-center justify-center gap-1.5 select-none"
                  >
                    Compare
                  </Link>
                ) : (
                  <button
                    type="button"
                    disabled
                    className="px-5 h-10 rounded-full text-sm font-semibold tracking-wide outline-none border-0 bg-[var(--primary)] text-[#39393a] opacity-35 cursor-not-allowed flex items-center justify-center select-none"
                  >
                    Compare
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
