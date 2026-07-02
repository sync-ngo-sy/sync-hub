import React, { useEffect, useState, useRef, useMemo } from "react";
import { ArrowRight, BookmarkCheck, BookmarkPlus } from "lucide-react";
import { Link } from "react-router-dom";
import { Avatar, ScorePill, Tag } from "@/components/ui";
import { buildChatHref } from "@/lib/chatAgent";
import type { CandidateSearchResult } from "@/lib/contracts";
import { formatYearsExperience } from "@/lib/experience";
import { getCleanCountry } from "../utils/countryFlags";
import { shortlistKey } from "@/features/search/searchState";

import aiOutlinedIcon from "../../../../src/assets/ai_outlined.svg";
import aiFilledIcon from "../../../../src/assets/ai_filled.svg";
import closeIcon from "../../../../src/assets/close.svg";
import removeIcon from "@/assets/remove.svg";

type SelectedCandidatesModalProps = {
  selectedCandidates: CandidateSearchResult[];
  shortlistKeys: Set<string>;
  shortlistPendingIds: Set<string>;
  resolveCandidateTenantId: (candidate: CandidateSearchResult) => string | null;
  searchQuery: string;
  onClose: () => void;
  onToggleSelect: (candidate: CandidateSearchResult) => void;
  onToggleShortlist: (candidate: CandidateSearchResult) => void;
};

type TabType = "overview" | "skills" | "watchouts";

export function SelectedCandidatesModal({
                                          selectedCandidates,
                                          shortlistKeys,
                                          shortlistPendingIds,
                                          resolveCandidateTenantId,
                                          searchQuery,
                                          onClose,
                                          onToggleSelect,
                                          onToggleShortlist,
                                        }: SelectedCandidatesModalProps) {
  const [isAnimating, setIsAnimating] = useState(false);
  const [activeCandidateId, setActiveCandidateId] = useState<string>("");
  const [activeTab, setActiveTab] = useState<TabType>("overview");
  const [isAiHovered, setIsAiHovered] = useState(false);
  const [isLeftAiHovered, setIsLeftAiHovered] = useState(false);
  const [panelHeight, setPanelHeight] = useState<number | string>("auto");
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selectedCandidates.length > 0 && !selectedCandidates.some(c => c.candidateId === activeCandidateId)) {
      setActiveCandidateId(selectedCandidates[0].candidateId);
    } else if (selectedCandidates.length === 0) {
      handleClose();
    }
  }, [selectedCandidates, activeCandidateId]);

  const activeCandidate = useMemo(() => {
    return selectedCandidates.find((c) => c.candidateId === activeCandidateId) || selectedCandidates[0];
  }, [selectedCandidates, activeCandidateId]);

  const countryProfile = useMemo(() => {
    if (!activeCandidate) return { flagUrl: null };
    return getCleanCountry(activeCandidate.location);
  }, [activeCandidate]);

  const capitalizeFirst = (str: string | undefined) => {
    if (!str) return "";
    return str.charAt(0).toUpperCase() + str.slice(1);
  };

  useEffect(() => {
    requestAnimationFrame(() => {
      setIsAnimating(true);
    });
  }, []);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") handleClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (!panelRef.current) return;
    const handleResize = (entries: ResizeObserverEntry[]) => {
      for (let entry of entries) {
        setPanelHeight(entry.contentRect.height);
      }
    };
    const observer = new ResizeObserver(handleResize);
    observer.observe(panelRef.current);
    return () => observer.disconnect();
  }, [activeTab, activeCandidateId]);

  function handleClose() {
    setIsAnimating(false);
    setTimeout(onClose, 300);
  }

  if (!activeCandidate) return null;

  const tenantId = resolveCandidateTenantId(activeCandidate);
  const candidateShortlistKey = tenantId ? shortlistKey(tenantId, activeCandidate.candidateId) : "";
  const isShortlisted = candidateShortlistKey ? shortlistKeys.has(candidateShortlistKey) : false;
  const shortlistPending = shortlistPendingIds.has(activeCandidate.candidateId);

  return (
    <div
      onClick={(e) => e.target === e.currentTarget && handleClose()}
      className={`fixed inset-0 z-[9999] flex items-center justify-center p-4 transition-all duration-300 ease-in-out cursor-default outline-none focus:outline-none focus:ring-0
        ${isAnimating ? "bg-black/60 backdrop-blur-md" : "bg-black/0 backdrop-blur-none pointer-events-none"}`}
    >
      {/* max-w-6xl for wider workspace & max-h-[90vh] for taller workspace */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-6xl bg-[#39393a] border border-[var(--border)] rounded-[var(--radius,22px)] shadow-[var(--shadow)] overflow-hidden flex flex-col max-h-[90vh] transition-all duration-300 ease-in-out outline-none focus:outline-none focus:ring-0"
        style={{
          transform: isAnimating ? "scale(100%)" : "scale(95%)",
          opacity: isAnimating ? 1 : 0,
        }}
        role="dialog"
        aria-modal="true"
      >
        {/* Main Header */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-[var(--border)] shrink-0 gap-4">
          <div className="flex flex-col gap-1.5">
            <h2 className="text-2xl font-bold text-[var(--text)] m-0 leading-tight">
              Selected Candidates ({selectedCandidates.length}/3)
            </h2>
            <span className="text-[15px] text-[var(--text-muted)]">
              Toggle tabs to inspect and compare side by side
            </span>
          </div>

          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={handleClose}
              className="w-10 h-10 rounded-[12px] flex items-center justify-center bg-[var(--border)] hover:bg-[var(--border-strong)] text-[var(--text-muted)] hover:text-[var(--text)] transition-all duration-200 outline-none border-0 cursor-pointer focus:outline-none focus:ring-0 shrink-0"
            >
              <img src={closeIcon} alt="Close" width={15} height={14} className="opacity-90" />
            </button>
          </div>
        </div>

        {/* Dual Column Layout */}
        <div className="flex flex-1 min-h-0 divide-x divide-[var(--border)]">

          {/* LEFT COLUMN: Candidate Selectable Buttons (w-[320px] wide) */}
          <div className="w-[320px] shrink-0 bg-[#39393a]/50 flex flex-col h-full">

            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
              <span className="block mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-soft)] pl-2">
                Candidates List
              </span>
              {selectedCandidates.map((c) => {
                const isActive = c.candidateId === activeCandidateId;
                return (
                  <div
                    key={c.candidateId}
                    onClick={() => setActiveCandidateId(c.candidateId)}
                    className={`group relative flex items-center justify-between p-4 rounded-xl transition-all duration-150 cursor-pointer border border-transparent select-none
                      ${isActive
                      ? "bg-[var(--primary)] text-[#39393a]"
                      : "bg-[var(--border)] text-[var(--text)] hover:bg-[var(--border-strong)]"
                    }`}
                  >
                    <div className="flex items-center gap-3.5 min-w-0 pr-10">
                      <Avatar name={c.name} hue={c.avatarHue} size="sm" />
                      <div className="flex flex-col min-w-0">
                        <span className="text-[16px] font-bold truncate leading-tight">
                          {c.name}
                        </span>
                        <span className={`text-[13px] truncate leading-tight mt-1 ${isActive ? "text-[#39393a]/75" : "text-[var(--text-muted)]"}`}>
                          {c.currentTitle}
                        </span>
                      </div>
                    </div>

                    {/* Highly visible Deselect button matching root system color palette */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleSelect(c);
                      }}
                      className="absolute right-2.5 w-7.5 h-7.5 rounded-[8px] flex items-center justify-center transition-all duration-200 outline-none cursor-pointer shrink-0"
                      style={{
                        backgroundColor: isActive ? "rgba(0, 0, 0, 0.12)" : "var(--border-strong)",
                        border: isActive ? "1.5px solid rgba(0, 0, 0, 0.15)" : "1.5px solid var(--border-strong)",
                        boxSizing: "border-box"
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = isActive ? "rgba(0, 0, 0, 0.22)" : "rgba(255, 255, 255, 0.12)";
                        e.currentTarget.style.borderColor = isActive ? "rgba(0, 0, 0, 0.3)" : "var(--primary)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = isActive ? "rgba(0, 0, 0, 0.12)" : "var(--border-strong)";
                        e.currentTarget.style.borderColor = isActive ? "rgba(0, 0, 0, 0.15)" : "var(--border-strong)";
                      }}
                    >
                      <img
                        src={removeIcon}
                        alt="Remove"
                        className="w-3.5 h-3.5"
                        style={{
                          display: "block",
                          filter: isActive
                            ? "brightness(0) saturate(100%) invert(21%) sepia(3%) saturate(137%) hue-rotate(201deg)" // Charcoal text contrast
                            : "brightness(0) saturate(100%) invert(100%)" // Pure white close icon contrast
                        }}
                      />
                    </button>
                  </div>
                );
              })}
            </div>

            {/* AI Compare Button Sticky footer with white/muted-white icon styling */}
            {selectedCandidates.length > 1 && (
              <div className="p-4 border-t border-[var(--border)] bg-[#39393a]/25 shrink-0">
                <Link
                  onMouseEnter={() => setIsLeftAiHovered(true)}
                  onMouseLeave={() => setIsLeftAiHovered(false)}
                  to={buildChatHref(
                    selectedCandidates.map((c) => c.candidateId),
                    "Compare these candidates side-by-side and highlight their relative strengths and weaknesses."
                  )}
                  className="w-full h-11 rounded-xl text-sm font-semibold tracking-wide transition-all duration-300 outline-none border border-[var(--border-strong)] flex items-center justify-center gap-2 bg-[var(--border)] hover:bg-[var(--border-strong)] text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer select-none"
                >
                  <span>AI Compare Selected</span>
                  <div className="relative w-4 h-4 shrink-0 overflow-hidden">
                    <img
                      src={aiOutlinedIcon}
                      alt=""
                      className="absolute inset-0 w-full h-full transition-all duration-300 ease-in-out"
                      style={{
                        opacity: isLeftAiHovered ? 0 : 0.8,
                        transform: isLeftAiHovered ? "scale(1.15)" : "scale(1)",
                        filter: "brightness(0) saturate(100%) invert(70%)" // matches text-muted
                      }}
                    />
                    <img
                      src={aiFilledIcon}
                      alt=""
                      className="absolute inset-0 w-full h-full transition-all duration-300 ease-in-out"
                      style={{
                        opacity: isLeftAiHovered ? 1 : 0,
                        transform: isLeftAiHovered ? "scale(1)" : "scale(0.85)",
                        filter: "brightness(0) saturate(100%) invert(100%)" // matches pure white text
                      }}
                    />
                  </div>
                </Link>
              </div>
            )}
          </div>

          {/* RIGHT COLUMN: Candidate Preview Area */}
          <div className="flex-1 flex flex-col min-h-0 bg-[#39393a]">
            {/* Identity strip */}
            <div className="px-6 py-5 border-b border-[var(--border)] flex items-start justify-between gap-4">
              <div className="flex gap-4 items-start">
                <Avatar name={activeCandidate.name} hue={activeCandidate.avatarHue} size="sm" />
                <div className="stack flex flex-col gap-1.5 justify-center">
                  <h3 className="text-xl font-bold text-[var(--text)] m-0 leading-tight flex items-center gap-2.5">
                    <span>{activeCandidate.name}</span>
                    <span className="text-[var(--text-soft)] font-normal select-none">•</span>
                    <span className="text-[15px] font-normal text-[var(--text-muted)]">
                      {formatYearsExperience(activeCandidate.yearsExperience)}
                    </span>
                  </h3>
                  <p className="text-[15px] text-[var(--text-muted)] m-0 leading-tight">
                    {activeCandidate.currentTitle}
                  </p>

                  {/* Location strip — Flag after text, 18px size, white border */}
                  <div className="flex items-center gap-2 text-[14px] text-[var(--text-muted)] mt-0.5 select-none">
                    <span>{activeCandidate.location}</span>
                    {countryProfile.flagUrl && (
                      <img
                        src={countryProfile.flagUrl}
                        alt=""
                        width={18}
                        height={18}
                        className="rounded-full shrink-0 object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = "https://hatscripts.github.io/circle-flags/flags/xx.svg";
                        }}
                        style={{ border: "1.5px solid #ffffff", display: "block" }}
                      />
                    )}
                  </div>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1.5 shrink-0">
                <ScorePill score={activeCandidate.backendMatchRate} label="" />
              </div>
            </div>

            {/* Inner Tabs Navigation */}
            <div className="w-full border-b border-[var(--border)] bg-[#39393a] px-6 py-4 shrink-0">
              <div className="w-full bg-[var(--bg)]/45 p-1 rounded-full flex gap-1.5 border border-[var(--border)] select-none">
                {([
                  { key: "overview", label: "Overview" },
                  { key: "skills", label: "Skills & Strengths" },
                  { key: "watchouts", label: "Watchouts" }
                ] as const).map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveTab(tab.key)}
                    className={`flex-1 px-4 rounded-full text-sm font-semibold tracking-wide transition-colors duration-200 select-none cursor-pointer border-0 outline-none focus:outline-none flex items-center justify-center h-10
                      ${activeTab === tab.key
                      ? "bg-[var(--primary)] text-[#39393a] font-bold"
                      : "bg-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--border-strong)] hover:text-[var(--text)]"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Main Tabs Content Area */}
            <div className="flex-1 relative min-h-0 overflow-hidden px-6">
              <div className="absolute top-0 left-6 right-6 h-6 bg-gradient-to-b from-[#39393a] to-transparent z-10 pointer-events-none" />
              <div className="overflow-y-auto w-full h-full py-4 select-none outline-none focus:outline-none">
                <div
                  style={{
                    height: typeof panelHeight === "number" ? `${panelHeight}px` : panelHeight,
                    transition: "height 300ms cubic-bezier(0.4, 0, 0.2, 1)"
                  }}
                  className="overflow-hidden"
                >
                  <div ref={panelRef} className="pb-4 animate-fadeIn">
                    {activeTab === "overview" && (
                      <div className="space-y-5 animate-fadeIn">
                        <section>
                          <span className="eyebrow block mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-soft)]">
                            Overview
                          </span>
                          <p className="text-base text-[var(--text-muted)] leading-relaxed m-0">
                            {activeCandidate.shortSummary || activeCandidate.headline || activeCandidate.matchNarrative}
                          </p>
                        </section>
                        {activeCandidate.matchNarrative && (
                          <section>
                            <span className="eyebrow block mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-soft)]">
                              Why this match
                            </span>
                            <p className="text-base text-[var(--text-muted)] leading-relaxed m-0">
                              {activeCandidate.matchNarrative}
                            </p>
                          </section>
                        )}
                      </div>
                    )}

                    {activeTab === "skills" && (
                      <div className="space-y-5 animate-fadeIn">
                        <section>
                          <span className="eyebrow block mb-2.5 text-xs font-semibold uppercase tracking-wider text-[var(--text-soft)]">
                            Top skills
                          </span>
                          <div className="skill-list flex flex-wrap gap-1.5">
                            {activeCandidate.topSkills.slice(0, 8).map((skill) => (
                              <Tag key={skill} tone="primary">
                                {skill}
                              </Tag>
                            ))}
                          </div>
                        </section>
                        {activeCandidate.strengths.length > 0 && (
                          <section>
                            <span className="eyebrow block mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-soft)]">
                              Strengths
                            </span>
                            <ul className="list-disc pl-5 space-y-1.5 m-0 text-base text-[var(--text-muted)] leading-relaxed">
                              {activeCandidate.strengths.slice(0, 3).map((strength) => (
                                <li key={strength}>{strength}</li>
                              ))}
                            </ul>
                          </section>
                        )}
                      </div>
                    )}

                    {activeTab === "watchouts" && (
                      <div className="animate-fadeIn">
                        {activeCandidate.risks.length > 0 ? (
                          <section>
                            <span className="eyebrow block mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-soft)]">
                              Watchouts
                            </span>
                            <ul className="list-disc pl-5 space-y-1.5 m-0 text-base text-[var(--text-muted)] leading-relaxed">
                              {activeCandidate.risks.slice(0, 2).map((risk) => (
                                <li key={risk}>{risk}</li>
                              ))}
                            </ul>
                          </section>
                        ) : (
                          <div className="text-center py-8 text-base text-[var(--text-muted)] italic">
                            No watchouts found for this match.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="absolute bottom-0 left-6 right-6 h-6 bg-gradient-to-t from-[#39393a] to-transparent z-10 pointer-events-none" />
            </div>

            {/* Individual Candidate Details Footer Strip */}
            <div className="flex items-center justify-center flex-wrap gap-3 p-5 bg-[#39393a]/30 border-t border-[var(--border)] select-none shrink-0">
              <button
                type="button"
                aria-pressed={isShortlisted}
                disabled={shortlistPending || !tenantId}
                onClick={() => onToggleShortlist(activeCandidate)}
                className={`px-5 py-2.5 rounded-full text-sm font-semibold tracking-wide transition-all duration-300 outline-none border-0 flex items-center gap-1.5
                  ${isShortlisted
                  ? "bg-[var(--primary)] text-[#39393a] hover:bg-[var(--primary)]/90 cursor-pointer active:scale-95 shadow-md"
                  : "bg-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--border-strong)] hover:text-[var(--text)] cursor-pointer active:scale-95"
                }`}
              >
                {isShortlisted ? <BookmarkCheck size={15} /> : <BookmarkPlus size={15} />}
                {shortlistPending ? "Saving..." : isShortlisted ? "Shortlisted" : "Shortlist"}
              </button>

              <Link
                onMouseEnter={() => setIsAiHovered(true)}
                onMouseLeave={() => setIsAiHovered(false)}
                to={buildChatHref([activeCandidate.candidateId], "Why is this candidate a strong fit?")}
                className="px-5 py-2.5 rounded-full text-sm font-semibold tracking-wide transition-all duration-300 outline-none border-0 bg-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--border-strong)] hover:text-[var(--text)] cursor-pointer active:scale-95 flex items-center gap-1.5"
              >
                <span>Ask SYNC AI</span>
                <div className="relative w-4 h-4 shrink-0 overflow-hidden">
                  <img
                    src={aiOutlinedIcon}
                    alt=""
                    className="absolute inset-0 w-full h-full transition-all duration-300 ease-in-out"
                    style={{
                      opacity: isAiHovered ? 0 : 0.8,
                      transform: isAiHovered ? "scale(1.15)" : "scale(1)",
                      filter: "brightness(0) saturate(100%) invert(70%)"
                    }}
                  />
                  <img
                    src={aiFilledIcon}
                    alt=""
                    className="absolute inset-0 w-full h-full transition-all duration-300 ease-in-out"
                    style={{
                      opacity: isAiHovered ? 1 : 0,
                      transform: isAiHovered ? "scale(1)" : "scale(0.85)",
                      filter: "brightness(0) saturate(100%) invert(100%)"
                    }}
                  />
                </div>
              </Link>

              <Link
                to={`/dossier/${activeCandidate.candidateId}`}
                state={{
                  searchMatchScore: activeCandidate.matchScore,
                  searchMatchSignals: activeCandidate.matchSignals,
                  searchQuery,
                }}
                onClick={handleClose}
                className="group px-5 py-2.5 rounded-full text-sm font-semibold tracking-wide transition-colors duration-300 ease-in-out outline-none border-0 bg-[var(--primary)] text-[#39393a] hover:bg-[var(--primary-strong)] hover:text-[var(--text)] cursor-pointer active:scale-95 flex items-center gap-1.5"
              >
                <span>View Dossier</span>
                <ArrowRight size={15} className="transition-transform duration-300 ease-in-out group-hover:translate-x-1 shrink-0" />
              </Link>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
