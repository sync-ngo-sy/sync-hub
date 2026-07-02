import { useState } from "react";
import { BookmarkCheck, BookmarkPlus, Eye } from "lucide-react";
import { Link } from "react-router-dom";
import { Avatar, ScorePill, Tag } from "@/components/ui";
import { buildChatHref } from "@/lib/chatAgent";
import type { CandidateSearchResult } from "@/lib/contracts";
import { formatYearsExperience } from "@/lib/experience";

import locationIcon from "../../../../src/assets/location_outlined.svg";
import aiOutlinedIcon from "../../../../src/assets/ai_outlined.svg";
import aiFilledIcon from "../../../../src/assets/ai_filled.svg";
import checkIcon from "../../../../src/assets/check.svg";

type CandidateResultCardProps = {
  candidate: CandidateSearchResult;
  candidateTenantId: string | null;
  isShortlisted: boolean;
  searchQuery: string;
  shortlistPending: boolean;
  workspaceLabel?: string | null;
  onPreview: (candidate: CandidateSearchResult) => void;
  onToggleShortlist: (candidate: CandidateSearchResult) => void;
  isSelected: boolean;
  canSelect: boolean;
  onToggleSelect: (candidate: CandidateSearchResult) => void;
  onCompare?: () => void; // undefined = no other candidates yet
};

function capitalize(str?: string): string {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function CandidateResultCard({
                                      candidate,
                                      candidateTenantId,
                                      isShortlisted,
                                      searchQuery,
                                      shortlistPending,
                                      workspaceLabel,
                                      onPreview,
                                      onToggleShortlist,
                                      isSelected,
                                      canSelect,
                                      onToggleSelect,
                                      onCompare,
                                    }: CandidateResultCardProps) {
  const [isAiHovered, setIsAiHovered] = useState(false);
  const [isCardHovered, setIsCardHovered] = useState(false);

  const selectButtonStyle: React.CSSProperties = {
    width: isSelected ? "112px" : "82px",
    overflow: "hidden",
    whiteSpace: "nowrap",
    transition:
      "width 250ms cubic-bezier(0.4, 0, 0.2, 1), background-color 200ms ease, color 200ms ease, opacity 200ms ease",
    boxSizing: "border-box",
  };

  return (
    <div
      className="candidate-card transition-all duration-300 ease-in-out hover:scale-[1.01] hover:shadow-[0_4px_20px_rgba(0,0,0,0.12)] rounded-xl p-5 bg-[var(--bg)] cursor-pointer"
      style={{
        borderWidth: "0.1px",
        borderStyle: "solid",
        borderColor: isCardHovered ? "transparent" : "var(--primary-strong)",
        borderRadius: "20px",
        transition:
          "border-color 300ms ease-in-out, box-shadow 300ms ease-in-out, transform 300ms ease-in-out",
      }}
      onClick={() => onPreview(candidate)}
      onMouseEnter={() => setIsCardHovered(true)}
      onMouseLeave={() => setIsCardHovered(false)}
    >
      {/* Header */}
      <div className="candidate-card__header flex items-start justify-between gap-4">
        <div className="candidate-card__identity flex gap-4">
          <Avatar name={candidate.name} hue={candidate.avatarHue} />
          <div className="stack flex flex-col gap-1 justify-center">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-lg font-semibold m-0 text-[var(--text)] leading-[1.1]">
                {candidate.name}
              </h3>
              <span className="text-[var(--text-muted)] opacity-65 text-xs self-center leading-none select-none">
                •
              </span>
              <span className="text-sm text-[var(--text-muted)] font-normal leading-none self-center">
                {formatYearsExperience(candidate.yearsExperience)}
              </span>
            </div>
            <p className="text-sm text-[var(--text-muted)] m-0 leading-tight">
              {candidate.currentTitle}
            </p>
          </div>
        </div>
        <ScorePill score={candidate.backendMatchRate} label="Match rate" />
      </div>

      {/* Tags */}
      <div className="skill-list flex flex-wrap gap-1.5 mt-4">
        {workspaceLabel ? <Tag>{capitalize(workspaceLabel)}</Tag> : null}
        <Tag>{capitalize(candidate.seniority)}</Tag>
        <Tag>{capitalize(candidate.primaryRole)}</Tag>
        <Tag tone="success">{capitalize(candidate.stage)}</Tag>
      </div>

      {/* Location */}
      <div className="meta-list mt-3.5 flex items-center gap-1.5">
        <span className="tag flex items-center gap-1.5 text-sm text-[var(--text-muted)]">
          <img
            src={locationIcon}
            alt="Location"
            width={14}
            height={14}
            className="opacity-70"
            style={{ display: "block" }}
          />
          {candidate.location}
        </span>
      </div>

      {/* Skills */}
      <div className="skill-list mt-3 flex flex-wrap gap-1.5">
        {candidate.topSkills.slice(0, 5).map((skill) => (
          <Tag key={skill} tone="primary">
            {capitalize(skill)}
          </Tag>
        ))}
      </div>

      {/* Actions */}
      <div className="skill-list mt-5 flex flex-wrap gap-2.5">
        {/* Select */}
        <button
          style={selectButtonStyle}
          className={`rounded-full text-sm font-normal tracking-wide select-none border-0 outline-none focus:outline-none focus:ring-0 flex items-center justify-center h-10 active:scale-[0.98]
            ${
            isSelected
              ? "bg-[var(--primary)] text-[#39393a] font-medium"
              : canSelect
                ? "bg-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--border-strong)] hover:text-[var(--text)]"
                : "bg-[var(--border)] text-[var(--text-muted)] opacity-35 cursor-not-allowed"
          }`}
          type="button"
          disabled={!canSelect}
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect(candidate);
          }}
        >
          <div className="flex items-center justify-center gap-1.5 w-full shrink-0">
            {isSelected ? (
              <>
                <img
                  src={checkIcon}
                  alt=""
                  className="w-3 h-3 shrink-0"
                  style={{
                    filter:
                      "brightness(0) saturate(100%) invert(21%) sepia(3%) saturate(137%) hue-rotate(201deg)",
                  }}
                />
                <span className="shrink-0">Selected</span>
              </>
            ) : (
              <span className="shrink-0">Select</span>
            )}
          </div>
        </button>

        {/* Overview */}
        <button
          className="px-4 rounded-full text-sm font-normal tracking-wide transition-colors duration-200 select-none cursor-pointer border-0 outline-none focus:outline-none focus:ring-0 flex items-center justify-center h-10 gap-1.5 bg-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--border-strong)] hover:text-[var(--text)]"
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onPreview(candidate);
          }}
        >
          <Eye size={16} />
          <span>Overview</span>
        </button>

        {/* Shortlist */}
        <button
          className={`px-4 rounded-full text-sm font-normal tracking-wide transition-colors duration-200 select-none border-0 outline-none focus:outline-none focus:ring-0 flex items-center justify-center h-10 gap-1.5
            ${
            isShortlisted
              ? "bg-[var(--primary)] text-[#39393a] hover:bg-[var(--primary)]/90 active:scale-95 shadow-md shadow-[var(--primary)]/10"
              : "bg-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--border-strong)] hover:text-[var(--text)] active:scale-95"
          }
            ${shortlistPending || !candidateTenantId ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
          type="button"
          aria-pressed={isShortlisted}
          disabled={shortlistPending || !candidateTenantId}
          onClick={(e) => {
            e.stopPropagation();
            onToggleShortlist(candidate);
          }}
        >
          {isShortlisted ? <BookmarkCheck size={16} /> : <BookmarkPlus size={16} />}
          <span>
            {shortlistPending ? "Saving..." : isShortlisted ? "Shortlisted" : "Shortlist"}
          </span>
        </button>

        {/* Dossier */}
        <Link
          className="px-4 rounded-full text-sm font-normal tracking-wide transition-colors duration-200 select-none cursor-pointer border-0 outline-none focus:outline-none focus:ring-0 flex items-center justify-center h-10 gap-1.5 bg-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--border-strong)] hover:text-[var(--text)]"
          to={`/dossier/${candidate.candidateId}`}
          state={{
            searchMatchScore: candidate.matchScore,
            searchMatchSignals: candidate.matchSignals,
            searchQuery,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <span>Dossier</span>
        </Link>

        {/* Ask Agent */}
        <Link
          className="px-4 rounded-full text-sm font-normal tracking-wide transition-colors duration-200 select-none cursor-pointer border-0 outline-none focus:outline-none focus:ring-0 flex items-center justify-center h-10 gap-1.5 bg-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--border-strong)] hover:text-[var(--text)]"
          to={buildChatHref([candidate.candidateId], "Why is this candidate a strong fit?")}
          onMouseEnter={() => setIsAiHovered(true)}
          onMouseLeave={() => setIsAiHovered(false)}
          onClick={(e) => e.stopPropagation()}
        >
          <span>Ask Agent</span>
          <div className="relative w-4 h-4 shrink-0 overflow-hidden">
            <img
              src={aiOutlinedIcon}
              alt=""
              className="absolute inset-0 w-full h-full transition-all duration-300 ease-in-out"
              style={{
                opacity: isAiHovered ? 0 : 0.8,
                transform: isAiHovered ? "scale(1.15)" : "scale(1)",
              }}
            />
            <img
              src={aiFilledIcon}
              alt=""
              className="absolute inset-0 w-full h-full transition-all duration-300 ease-in-out"
              style={{
                opacity: isAiHovered ? 1 : 0,
                transform: isAiHovered ? "scale(1)" : "scale(0.85)",
              }}
            />
          </div>
        </Link>

        {/* Compare — opens picker modal */}
        {onCompare ? (
          <button
            type="button"
            className="!rounded-xl px-5 select-none shrink-0 flex items-center justify-center gap-1.5 h-10 transition-colors duration-200 whitespace-nowrap outline-none focus:outline-none focus:ring-0 text-[15px] font-normal border-0 cursor-pointer bg-[var(--primary)] text-[#39393a] hover:bg-[var(--primary-strong)] hover:text-[var(--text)]"
            onClick={(e) => {
              e.stopPropagation();
              onCompare();
            }}
          >
            <span className="leading-none">Compare</span>
          </button>
        ) : null}
      </div>
    </div>
  );
}
