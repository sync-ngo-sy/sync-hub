import { ArrowRight, BookmarkCheck, BookmarkPlus, BriefcaseBusiness, Eye, MapPin, MessageSquareText } from "lucide-react";
import { Link } from "react-router-dom";
import { Avatar, Panel, ScorePill, Tag } from "@/components/ui";
import { buildChatHref } from "@/lib/chatAgent";
import type { CandidateSearchResult } from "@/lib/contracts";
import { formatYearsExperience } from "@/lib/experience";

type CandidateResultCardProps = {
  candidate: CandidateSearchResult;
  candidateTenantId: string | null;
  isShortlisted: boolean;
  partnerId?: string | null;
  searchQuery: string;
  shortlistPending: boolean;
  workspaceLabel?: string | null;
  onPreview: (candidate: CandidateSearchResult) => void;
  onToggleShortlist: (candidate: CandidateSearchResult) => void;
};

export function CandidateResultCard({
  candidate,
  candidateTenantId,
  isShortlisted,
  partnerId,
  searchQuery,
  shortlistPending,
  workspaceLabel,
  onPreview,
  onToggleShortlist,
}: CandidateResultCardProps) {
  return (
    <Panel className="candidate-card">
      <div className="candidate-card__header">
        <div className="candidate-card__identity">
          <Avatar name={candidate.name} hue={candidate.avatarHue} />
          <div className="stack">
            <h3>{candidate.name}</h3>
            <p>{candidate.currentTitle}</p>
            <div className="skill-list">
              {workspaceLabel ? <Tag>{workspaceLabel}</Tag> : null}
              <Tag>{candidate.seniority}</Tag>
              <Tag>{candidate.primaryRole}</Tag>
              <Tag tone="success">{candidate.stage}</Tag>
            </div>
          </div>
        </div>
        <ScorePill score={candidate.backendMatchRate} label="Match rate" />
      </div>

      <div className="meta-list">
        <span className="tag">
          <MapPin size={14} />
          {candidate.location}
        </span>
        <span className="tag">
          <BriefcaseBusiness size={14} />
          {formatYearsExperience(candidate.yearsExperience)}
        </span>
      </div>

      <div className="skill-list">
        {candidate.topSkills.slice(0, 5).map((skill) => (
          <Tag key={skill} tone="primary">
            {skill}
          </Tag>
        ))}
      </div>

      <div className="skill-list">
        <button className="button button--secondary" type="button" onClick={() => onPreview(candidate)}>
          <Eye size={16} />
          Quick overview
        </button>
        <button
          className={[
            "button",
            isShortlisted ? "button--primary shortlist-action-button shortlist-action-button--active" : "button--secondary shortlist-action-button",
          ].join(" ")}
          type="button"
          aria-pressed={isShortlisted}
          disabled={shortlistPending || !candidateTenantId}
          onClick={() => onToggleShortlist(candidate)}
        >
          {isShortlisted ? <BookmarkCheck size={16} /> : <BookmarkPlus size={16} />}
          {shortlistPending ? "Saving..." : isShortlisted ? "Shortlisted" : "Shortlist"}
        </button>
        <Link
          className="button button--secondary"
          to={`/dossier/${candidate.candidateId}`}
          state={{
            searchMatchScore: candidate.matchScore,
            searchMatchSignals: candidate.matchSignals,
            searchQuery,
          }}
        >
          View Dossier
        </Link>
        <Link className="button button--secondary" to={buildChatHref([candidate.candidateId], "Why is this candidate a strong fit?")}>
          Ask Agent
          <MessageSquareText size={16} />
        </Link>
        {partnerId ? (
          <Link className="button button--primary" to={`/compare?ids=${candidate.candidateId},${partnerId}`}>
            Compare
            <ArrowRight size={16} />
          </Link>
        ) : null}
      </div>
    </Panel>
  );
}
