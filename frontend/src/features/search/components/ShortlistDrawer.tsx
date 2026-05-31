import { ArrowRight, BookmarkCheck, BriefcaseBusiness, Download, FileText, MapPin, MessageSquareText, Trash2, X } from "lucide-react";
import { Link } from "react-router-dom";
import { Avatar, ScorePill, Tag } from "@/components/ui";
import type { CandidateShortlistItem } from "@/lib/contracts";
import { formatYearsExperience } from "@/lib/experience";
import { shortlistKey } from "@/features/search/searchState";

type ShortlistDrawerProps = {
  chatHref: string | null;
  clearing: boolean;
  compareHref: string | null;
  error: string | null;
  items: CandidateShortlistItem[];
  loading: boolean;
  pendingKeys: Set<string>;
  onClear: () => void;
  onClose: () => void;
  onExport: () => void;
  onOpenCv: (item: CandidateShortlistItem) => void;
  onRemove: (item: CandidateShortlistItem) => void;
};

export function ShortlistDrawer({
  chatHref,
  clearing,
  compareHref,
  error,
  items,
  loading,
  pendingKeys,
  onClear,
  onClose,
  onExport,
  onOpenCv,
  onRemove,
}: ShortlistDrawerProps) {
  return (
    <>
      <div className="shortlist-drawer-backdrop" onClick={onClose} />
      <aside className="shortlist-drawer" role="dialog" aria-modal="true" aria-labelledby="shortlist-drawer-title">
        <div className="shortlist-drawer__header">
          <div className="stack">
            <span className="eyebrow">Saved shortlist</span>
            <h2 id="shortlist-drawer-title">{items.length} candidates</h2>
            <p className="muted">Account-level selections for the active workspace scope.</p>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close shortlist drawer">
            <X size={18} />
          </button>
        </div>

        <div className="shortlist-drawer__body">
          {error ? <p className="shortlist-drawer__error">{error}</p> : null}
          {loading ? (
            <p className="muted">Loading saved candidates...</p>
          ) : !items.length ? (
            <p className="muted">No candidates saved yet.</p>
          ) : (
            <div className="shortlist-drawer__list">
              {items.map((item) => {
                const key = shortlistKey(item.tenantId, item.candidateId);
                const removing = pendingKeys.has(key);
                const openingCv = pendingKeys.has(`cv:${key}`);
                return (
                  <article key={key} className="shortlist-drawer-card">
                    <div className="shortlist-drawer-card__header">
                      <div className="candidate-card__identity">
                        <Avatar name={item.candidateName} hue={item.candidateName.length * 17} size="sm" />
                        <div className="stack">
                          <strong>{item.candidateName}</strong>
                          <p>{item.currentTitle}</p>
                        </div>
                      </div>
                      {item.matchRate !== null ? <ScorePill score={item.matchRate} label="Match" /> : null}
                    </div>

                    <div className="meta-list shortlist-drawer-card__meta">
                      <span className="tag">
                        <MapPin size={14} />
                        {item.location}
                      </span>
                      {item.yearsExperience !== null ? (
                        <span className="tag">
                          <BriefcaseBusiness size={14} />
                          {formatYearsExperience(item.yearsExperience)}
                        </span>
                      ) : null}
                    </div>

                    {item.topSkills.length ? (
                      <div className="skill-list">
                        {item.topSkills.slice(0, 4).map((skill) => (
                          <Tag key={skill} tone="primary">
                            {skill}
                          </Tag>
                        ))}
                      </div>
                    ) : null}

                    <div className="shortlist-drawer-card__actions">
                      <Link className="button button--secondary button--compact" to={`/dossier/${item.candidateId}`} onClick={onClose}>
                        View
                      </Link>
                      {item.cvUrl ? (
                        <button className="button button--secondary button--compact" type="button" onClick={() => onOpenCv(item)} disabled={openingCv}>
                          <FileText size={14} />
                          {openingCv ? "Opening..." : "CV"}
                        </button>
                      ) : null}
                      <button className="button button--secondary button--compact" type="button" onClick={() => onRemove(item)} disabled={removing}>
                        <Trash2 size={14} />
                        {removing ? "Removing..." : "Remove"}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>

        <div className="shortlist-drawer__footer">
          {chatHref ? (
            <Link className="button button--secondary" to={chatHref}>
              Ask Agent
              <MessageSquareText size={16} />
            </Link>
          ) : null}
          {compareHref ? (
            <Link className="button button--primary" to={compareHref}>
              Compare
              <ArrowRight size={16} />
            </Link>
          ) : null}
          <button className="button button--secondary" type="button" onClick={onExport} disabled={!items.length}>
            <Download size={16} />
            Export CSV
          </button>
          <button className="button button--secondary" type="button" onClick={onClear} disabled={!items.length || clearing}>
            <Trash2 size={16} />
            {clearing ? "Clearing..." : "Clear"}
          </button>
        </div>
      </aside>
    </>
  );
}
