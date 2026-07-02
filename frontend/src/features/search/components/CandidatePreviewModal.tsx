import React, { useEffect, useState, useRef } from "react";
import { ArrowRight, BookmarkCheck, BookmarkPlus, MapPin } from "lucide-react";
import { Link } from "react-router-dom";
import { Avatar, ScorePill, Tag } from "@/components/ui";
import { buildChatHref } from "@/lib/chatAgent";
import type { CandidateSearchResult } from "@/lib/contracts";
import { formatYearsExperience } from "@/lib/experience";
import { getCleanCountry } from "../utils/countryFlags";
import aiOutlinedIcon from "../../../../src/assets/ai_outlined.svg";
import aiFilledIcon from "../../../../src/assets/ai_filled.svg";
import closeIcon from "../../../../src/assets/close.svg";

type CandidatePreviewModalProps = {
  candidate: CandidateSearchResult;
  isShortlisted: boolean;
  searchQuery: string;
  shortlistPending: boolean;
  tenantId: string | null;
  onClose: () => void;
  onToggleShortlist: (candidate: CandidateSearchResult) => void;
  onCompare?: () => void;
};

type TabType = "overview" | "skills" | "watchouts";

export function CandidatePreviewModal({
                                        candidate,
                                        isShortlisted,
                                        searchQuery,
                                        shortlistPending,
                                        tenantId,
                                        onClose,
                                        onToggleShortlist,
                                        onCompare,
                                      }: CandidatePreviewModalProps) {
  const [isAnimating, setIsAnimating] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>("overview");
  const [isAiHovered, setIsAiHovered] = useState(false);

  // Height transition states
  const [panelHeight, setPanelHeight] = useState<number | string>("auto");
  const panelRef = useRef<HTMLDivElement>(null);

  // Load country profile with flag using utility helper
  const countryProfile = getCleanCountry(candidate.location);

  // Helper to auto-capitalize the first letter safely
  const capitalizeFirst = (str: string | undefined) => {
    if (!str) return "";
    return str.charAt(0).toUpperCase() + str.slice(1);
  };

  useEffect(() => {
    requestAnimationFrame(() => {
      setIsAnimating(true);
    });
  }, []);

  // Lock scroll when open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  // Handle escape key
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") handleClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Height observer for smooth content sizing
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
  }, [activeTab]);

  function handleClose() {
    setIsAnimating(false);
    setTimeout(onClose, 300);
  }

  function handleBackdropClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) {
      handleClose();
    }
  }

  return (
    <div
      onClick={handleBackdropClick}
      className={`fixed inset-0 z-[9999] flex items-center justify-center p-4 transition-all duration-300 ease-in-out cursor-default outline-none focus:outline-none focus:ring-0
        ${isAnimating ? "bg-black/60 backdrop-blur-md" : "bg-black/0 backdrop-blur-none pointer-events-none"}`}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl bg-[#39393a] border border-[var(--border)] rounded-[var(--radius)] shadow-[var(--shadow)] overflow-hidden flex flex-col max-h-[85vh] transition-all duration-300 ease-in-out outline-none focus:outline-none focus:ring-0"
        style={{
          transform: isAnimating ? "scale(100%)" : "scale(95%)",
          opacity: isAnimating ? 1 : 0,
        }}
        role="dialog"
        aria-modal="true"
        aria-label={`${candidate.name} Overview`}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-5 border-b border-[var(--border)] shrink-0 gap-4">
          <div className="candidate-card__identity flex gap-4 items-start">
            <div className="mt-0.5">
              <Avatar name={candidate.name} hue={candidate.avatarHue} size="lg" />
            </div>
            {/* Increased gap from 1.5 to 3 to better align with avatar height */}
            <div className="stack flex flex-col gap-3 justify-center mt-1">
              {/* Grouped Info: Name • Years of Experience */}
              <h2 className="text-lg font-bold text-[var(--text)] m-0 leading-tight flex items-center gap-2">
                <span>{candidate.name}</span>
                <span className="text-[var(--text-soft)] font-normal select-none">•</span>
                <span className="text-sm font-normal text-[var(--text-muted)]">
                  {formatYearsExperience(candidate.yearsExperience)}
                </span>
              </h2>

              {/* Current Title */}
              <p className="text-sm text-[var(--text-muted)] m-0 leading-tight">
                {candidate.currentTitle}
              </p>

              {/* Grouped Info: Location with Flag - positioned directly under the Title */}
              <div className="flex items-center gap-1.5 text-sm text-[var(--text-muted)]">
                {countryProfile.flagUrl ? (
                  <img
                    src={countryProfile.flagUrl}
                    alt=""
                    width={16}
                    height={16}
                    className="rounded-full shrink-0 object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = "https://hatscripts.github.io/circle-flags/flags/xx.svg";
                    }}
                    style={{
                      border: "1px solid var(--border-strong)",
                      display: "block"
                    }}
                  />
                ) : (
                  <MapPin size={13} className="text-[var(--text-muted)] shrink-0" />
                )}
                <span>{candidate.location}</span>
              </div>
            </div>
          </div>

          {/* Action corner: Close */}
          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={handleClose}
              className="w-9 h-9 rounded-[12px] flex items-center justify-center bg-[var(--border)] hover:bg-[var(--border-strong)] text-[var(--text-muted)] hover:text-[var(--text)] transition-all duration-200 outline-none border-0 cursor-pointer focus:outline-none focus:ring-0 shrink-0"
            >
              <img src={closeIcon} alt="Close" width={14} height={14} className="opacity-90"/>
            </button>
          </div>
        </div>

        {/* Tags Row - Under the Header with Match Rate to the right */}
        <div className="px-5 pt-2 pb-4 border-b border-[var(--border)] shrink-0 flex items-center justify-between gap-4">
          <div className="skill-list flex flex-wrap gap-1.5">
            <Tag>{capitalizeFirst(candidate.seniority)}</Tag>
            <Tag>{capitalizeFirst(candidate.primaryRole)}</Tag>
            <Tag tone="success">{capitalizeFirst(candidate.stage)}</Tag>
          </div>
          <ScorePill score={candidate.backendMatchRate} label="" />
        </div>

        {/* Connected Groups Tabs */}
        <div className="w-full border-b border-[var(--border)] bg-[#39393a] shrink-0 px-5 py-3.5">
          <div className="w-full bg-[var(--bg)]/45 p-1 rounded-full flex gap-1.5 border border-[var(--border)] select-none">
            <button
              type="button"
              onClick={() => setActiveTab("overview")}
              className={`flex-1 px-4 rounded-full text-sm font-normal tracking-wide transition-colors duration-200 select-none cursor-pointer border-0 outline-none focus:outline-none focus:ring-0 flex items-center justify-center h-10
                ${activeTab === "overview"
                ? "bg-[var(--primary)] text-[#39393a]"
                : "bg-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--border-strong)] hover:text-[var(--text)]"
              }`}
            >
              Overview
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("skills")}
              className={`flex-1 px-4 rounded-full text-sm font-normal tracking-wide transition-colors duration-200 select-none cursor-pointer border-0 outline-none focus:outline-none focus:ring-0 flex items-center justify-center h-10
                ${activeTab === "skills"
                ? "bg-[var(--primary)] text-[#39393a]"
                : "bg-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--border-strong)] hover:text-[var(--text)]"
              }`}
            >
              Skills & Strengths
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("watchouts")}
              className={`flex-1 px-4 rounded-full text-sm font-normal tracking-wide transition-colors duration-200 select-none cursor-pointer border-0 outline-none focus:outline-none focus:ring-0 flex items-center justify-center h-10
                ${activeTab === "watchouts"
                ? "bg-[var(--primary)] text-[#39393a]"
                : "bg-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--border-strong)] hover:text-[var(--text)]"
              }`}
            >
              Watchouts
            </button>
          </div>
        </div>

        {/* Body Content with Smooth Height Sizing */}
        <div className="flex-1 relative min-h-0 overflow-hidden px-5">
          <div className="absolute top-0 left-5 right-5 h-6 bg-gradient-to-b from-[#39393a] to-transparent z-10 pointer-events-none" />

          <div className="overflow-y-auto w-full h-full py-4 select-none outline-none focus:outline-none focus:ring-0">
            <div
              style={{
                height: typeof panelHeight === "number" ? `${panelHeight}px` : panelHeight,
                transition: "height 300ms cubic-bezier(0.4, 0, 0.2, 1)"
              }}
              className="overflow-hidden"
            >
              <div ref={panelRef} className="pb-4">
                {/* Tab Panel 1: Overview */}
                {activeTab === "overview" && (
                  <div className="space-y-5 animate-fadeIn">
                    <section>
                      <span className="eyebrow block mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-soft)]">
                        Overview
                      </span>
                      <p className="text-base text-[var(--text-muted)] leading-relaxed m-0">
                        {candidate.shortSummary || candidate.headline || candidate.matchNarrative}
                      </p>
                    </section>

                    {candidate.matchNarrative && (
                      <section>
                        <span className="eyebrow block mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-soft)]">
                          Why this match
                        </span>
                        <p className="text-base text-[var(--text-muted)] leading-relaxed m-0">{candidate.matchNarrative}</p>
                      </section>
                    )}
                  </div>
                )}

                {/* Tab Panel 2: Skills & Strengths */}
                {activeTab === "skills" && (
                  <div className="space-y-5 animate-fadeIn">
                    <section>
                      <span className="eyebrow block mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-soft)]">
                        Top skills
                      </span>
                      <div className="skill-list flex flex-wrap gap-1.5">
                        {candidate.topSkills.slice(0, 8).map((skill) => (
                          <Tag key={skill} tone="primary">
                            {skill}
                          </Tag>
                        ))}
                      </div>
                    </section>

                    {candidate.strengths.length > 0 && (
                      <section>
                        <span className="eyebrow block mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-soft)]">
                          Strengths
                        </span>
                        <ul className="list-disc pl-5 space-y-1.5 m-0 text-base text-[var(--text-muted)] leading-relaxed">
                          {candidate.strengths.slice(0, 3).map((strength) => (
                            <li key={strength}>{strength}</li>
                          ))}
                        </ul>
                      </section>
                    )}
                  </div>
                )}

                {/* Tab Panel 3: Watchouts */}
                {activeTab === "watchouts" && (
                  <div className="animate-fadeIn">
                    {candidate.risks.length > 0 ? (
                      <section>
                        <span className="eyebrow block mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-soft)]">
                          Watchouts
                        </span>
                        <ul className="list-disc pl-5 space-y-1.5 m-0 text-base text-[var(--text-muted)] leading-relaxed">
                          {candidate.risks.slice(0, 2).map((risk) => (
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

          <div className="absolute bottom-0 left-5 right-5 h-8 bg-gradient-to-t from-[#39393a] to-transparent z-10 pointer-events-none" />
        </div>

        {/* Centered Action Footer */}
        <div className="flex items-center justify-center flex-wrap gap-2.5 p-4 bg-[#39393a]/30 border-t border-[var(--border)] select-none shrink-0">

          {/* Button 1: Shortlist */}
          <button
            type="button"
            aria-pressed={isShortlisted}
            disabled={shortlistPending || !tenantId}
            onClick={() => onToggleShortlist(candidate)}
            className={`px-5 py-2.5 rounded-full text-xs font-semibold tracking-wide transition-all duration-300 outline-none border-0 focus:outline-none focus:ring-0 flex items-center gap-1.5
              ${isShortlisted
              ? "bg-[var(--primary)] text-[#39393a] hover:bg-[var(--primary)]/90 cursor-pointer active:scale-95 shadow-md shadow-[var(--primary)]/10"
              : "bg-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--border-strong)] hover:text-[var(--text)] cursor-pointer active:scale-95"
            }`}
          >
            {isShortlisted ? <BookmarkCheck size={16} /> : <BookmarkPlus size={16} />}
            {shortlistPending ? "Saving..." : isShortlisted ? "Shortlisted" : "Shortlist"}
          </button>

          {/* Button 2: Ask SYNC AI */}
          <Link
            onMouseEnter={() => setIsAiHovered(true)}
            onMouseLeave={() => setIsAiHovered(false)}
            to={buildChatHref([candidate.candidateId], "Why is this candidate a strong fit?")}
            className="px-5 py-2.5 rounded-full text-xs font-semibold tracking-wide transition-all duration-300 outline-none border-0 focus:outline-none focus:ring-0 bg-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--border-strong)] hover:text-[var(--text)] cursor-pointer active:scale-95 flex items-center gap-1.5"
          >
            <span>Ask SYNC AI</span>
            <img
              src={isAiHovered ? aiFilledIcon : aiOutlinedIcon}
              alt=""
              width={16}
              height={16}
              className="transition-all duration-300 shrink-0"
              style={{
                display: "block",
                filter: isAiHovered ? "brightness(0) saturate(100%) invert(100%)" : "brightness(0) saturate(100%) invert(70%)"
              }}
            />
          </Link>

          {/* Button 3: Compare - Now triggers onCompare callback */}
          {onCompare && (
            <button
              type="button"
              onClick={onCompare}
              className="px-5 py-2.5 rounded-full text-xs font-semibold tracking-wide transition-all duration-300 outline-none border-0 focus:outline-none focus:ring-0 bg-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--border-strong)] hover:text-[var(--text)] cursor-pointer active:scale-95 flex items-center gap-1.5"
            >
              Compare
              <ArrowRight size={16} />
            </button>
          )}

          {/* Button 4: View Dossier */}
          <Link
            to={`/dossier/${candidate.candidateId}`}
            state={{
              searchMatchScore: candidate.matchScore,
              searchMatchSignals: candidate.matchSignals,
              searchQuery,
            }}
            onClick={handleClose}
            className="group px-6 py-2.5 rounded-full text-xs font-semibold tracking-wide transition-colors duration-300 ease-in-out outline-none border-0 focus:outline-none focus:ring-0 bg-[var(--primary)] text-[#39393a] hover:bg-[var(--primary-strong)] hover:text-[var(--text)] cursor-pointer active:scale-95 flex items-center gap-1.5"
          >
            <span>View Dossier</span>
            <ArrowRight
              size={16}
              className="transition-transform duration-300 ease-in-out group-hover:translate-x-1 shrink-0"
            />
          </Link>
        </div>
      </div>
    </div>
  );
}
