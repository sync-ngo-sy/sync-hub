import { Panel, Tag } from "@/components/ui";
import type { ParsingDocumentDetail } from "@/lib/contracts";
import { formatYearsExperience } from "@/lib/experience";

type ExtractedProfilePanelProps = {
  detail: ParsingDocumentDetail;
};

export function ExtractedProfilePanel({ detail }: ExtractedProfilePanelProps) {
  return (
    <Panel className="table-card">
      <div className="stack">
        <div className="signal-row">
          <div>
            <h3>Extracted profile</h3>
            <p>This is the recruiter-facing structure derived from the source CV.</p>
          </div>
          <div className="skill-list">
            <Tag tone="primary">{detail.seniority}</Tag>
            <Tag>{detail.primaryRole}</Tag>
            <Tag>{formatYearsExperience(detail.yearsExperience, "yrs")}</Tag>
          </div>
        </div>

        <div className="parsing-profile-grid">
          <div className="evidence-card">
            <span className="parsing-profile-grid__label">Candidate</span>
            <strong>{detail.candidateName}</strong>
            <p>{detail.currentTitle}</p>
          </div>
          <div className="evidence-card">
            <span className="parsing-profile-grid__label">Location</span>
            <strong>{detail.location || "Not parsed"}</strong>
            <p>{detail.headline || "No headline parsed"}</p>
          </div>
          <div className="evidence-card">
            <span className="parsing-profile-grid__label">Email</span>
            <strong>{detail.email || "Not parsed"}</strong>
            <p>{detail.phone || "No phone parsed"}</p>
          </div>
          <div className="evidence-card">
            <span className="parsing-profile-grid__label">Sections</span>
            <div className="skill-list">
              {detail.parsedSections.map((section) => (
                <Tag key={section}>{section}</Tag>
              ))}
            </div>
          </div>
        </div>

        {detail.summary ? (
          <div className="evidence-card">
            <span className="parsing-profile-grid__label">Summary</span>
            <p>{detail.summary}</p>
          </div>
        ) : null}
      </div>
    </Panel>
  );
}
