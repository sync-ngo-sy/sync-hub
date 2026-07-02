import { useEffect, useState } from "react";
import { ArrowRight, BookmarkCheck, BookmarkPlus, BriefcaseBusiness, MapPin, MessageSquareText, X } from "lucide-react";
import { Link } from "react-router-dom";
import { Avatar, ScorePill, Tag } from "@/components/ui";
import { buildChatHref } from "@/lib/chatAgent";
import type { CandidateSearchResult } from "@/lib/contracts";
import { formatYearsExperience } from "@/lib/experience";

type CandidatePreviewDrawerProps = {
  candidate: CandidateSearchResult;
  isShortlisted: boolean;
  partnerId?: string | null;
  searchQuery: string;
  shortlistPending: boolean;
  tenantId: string | null;
  onClose: () => void;
  onToggleShortlist: (candidate: CandidateSearchResult) => void;
};

export function CandidatePreviewDrawer({
                                         candidate,
                                         isShortlisted,
                                         partnerId,
                                         searchQuery,
                                         shortlistPending,
                                         tenantId,
                                         onClose,
                                         onToggleShortlist,
                                       }: CandidatePreviewDrawerProps) {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    // Trigger slide-in on mount
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setIsOpen(true);
      });
    });
  }, []);

  function handleClose() {
    setIsOpen(false);
    setTimeout(onClose, 220);
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="candidate-preview-drawer-backdrop"
        onClick={handleClose}
        style={{
          opacity: isOpen ? 1 : 0,
          transition: "opacity 220ms cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      />

      {/* Drawer */}
      <aside
        className="candidate-preview-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="candidate-preview-title"
        style={{
          transform: isOpen ? "translateX(0)" : "translateX(100%)",
          transition: "transform 220ms cubic-bezier(0.4, 0, 0.2, 1)",
          willChange: "transform",
        }}
      >
        <div className="candidate-preview-drawer__header">
          <div className="candidate-card__identity">
            <Avatar name={candidate.name} hue={candidate.avatarHue} size="lg" />
            <div className="stack">
              <h2 id="candidate-preview-title">{candidate.name}</h2>
              <p>{candidate.currentTitle}</p>
            </div>
          </div>
          <button className="icon-button" type="button" onClick={handleClose} aria-label="Close candidate overview">
            <X size={18} />
          </button>
        </div>

        <div className="candidate-preview-drawer__body">
          <div className="candidate-preview-drawer__score-row">
            <ScorePill score={candidate.backendMatchRate} label="Match rate" />
            <div className="skill-list">
              <Tag>{candidate.seniority}</Tag>
              <Tag>{candidate.primaryRole}</Tag>
              <Tag tone="success">{candidate.stage}</Tag>
            </div>
          </div>

          <div className="meta-list candidate-preview-drawer__meta">
            <span className="tag">
              <MapPin size={14} />
              {candidate.location}
            </span>
            <span className="tag">
              <BriefcaseBusiness size={14} />
              {formatYearsExperience(candidate.yearsExperience)}
            </span>
          </div>

          <section className="candidate-preview-section">
            <span className="eyebrow">Overview</span>
            <p>{candidate.shortSummary || candidate.headline || candidate.matchNarrative}</p>
          </section>

          {candidate.matchNarrative ? (
            <section className="candidate-preview-section">
              <span className="eyebrow">Why this match</span>
              <p>{candidate.matchNarrative}</p>
            </section>
          ) : null}

          <section className="candidate-preview-section">
            <span className="eyebrow">Top skills</span>
            <div className="skill-list">
              {candidate.topSkills.slice(0, 8).map((skill) => (
                <Tag key={skill} tone="primary">
                  {skill}
                </Tag>
              ))}
            </div>
          </section>

          {candidate.strengths.length ? (
            <section className="candidate-preview-section">
              <span className="eyebrow">Strengths</span>
              <ul className="bullet-list">
                {candidate.strengths.slice(0, 3).map((strength) => (
                  <li key={strength}>{strength}</li>
                ))}
              </ul>
            </section>
          ) : null}

          {candidate.risks.length ? (
            <section className="candidate-preview-section">
              <span className="eyebrow">Watchouts</span>
              <ul className="bullet-list">
                {candidate.risks.slice(0, 2).map((risk) => (
                  <li key={risk}>{risk}</li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>

        <div className="candidate-preview-drawer__footer">
          <button
            className={isShortlisted ? "button button--primary" : "button button--secondary"}
            type="button"
            aria-pressed={isShortlisted}
            disabled={shortlistPending || !tenantId}
            onClick={() => onToggleShortlist(candidate)}
          >
            {isShortlisted ? <BookmarkCheck size={16} /> : <BookmarkPlus size={16} />}
            {shortlistPending ? "Saving..." : isShortlisted ? "Shortlisted" : "Shortlist"}
          </button>
          <Link
            className="button button--primary"
            to={`/dossier/${candidate.candidateId}`}
            state={{
              searchMatchScore: candidate.matchScore,
              searchMatchSignals: candidate.matchSignals,
              searchQuery,
            }}
            onClick={handleClose}
          >
            View Dossier
            <ArrowRight size={16} />
          </Link>
          <Link className="button button--secondary" to={buildChatHref([candidate.candidateId], "Why is this candidate a strong fit?")}>
            Ask Agent
            <MessageSquareText size={16} />
          </Link>
          {partnerId ? (
            <Link className="button button--secondary" to={`/compare?ids=${candidate.candidateId},${partnerId}`}>
              Compare
              <ArrowRight size={16} />
            </Link>
          ) : null}
        </div>
      </aside>
    </>
  );
}
