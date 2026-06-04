import { CheckCircle2 } from "lucide-react";
import { Panel, Tag } from "@/components/ui";
import type { ParsingDocumentDetail } from "@/lib/contracts";

type ParsedContentPanelProps = {
  detail: ParsingDocumentDetail;
};

export function ParsedContentPanel({ detail }: ParsedContentPanelProps) {
  return (
    <Panel className="table-card">
      <div className="stack">
        <div className="skill-list">
          <CheckCircle2 size={16} />
          <h3>Parsed content</h3>
        </div>

        <div className="parsing-content-grid">
          <div className="evidence-card">
            <span className="parsing-profile-grid__label">Skills</span>
            <div className="skill-list">
              {detail.skills.length ? detail.skills.map((skill) => <Tag key={skill}>{skill}</Tag>) : <p>No skills parsed.</p>}
            </div>
          </div>

          <ParsedList title="Links" items={detail.links} emptyText="No links parsed." />
          <ParsedList title="Education" items={detail.education} emptyText="No education parsed." />
          <ParsedList title="Projects" items={detail.projects} emptyText="No projects parsed." />
        </div>

        <div className="timeline">
          {detail.timeline.length ? (
            detail.timeline.map((entry) => (
              <div key={`${entry.employer}-${entry.role}-${entry.start}`} className="timeline-entry">
                <div className="signal-row">
                  <strong>{entry.role}</strong>
                  <span>
                    {entry.start} - {entry.end}
                  </span>
                </div>
                <p>{entry.employer}</p>
                {entry.scope ? <p>{entry.scope}</p> : null}
              </div>
            ))
          ) : (
            <div className="evidence-card">
              <p>No experience timeline was segmented from this CV.</p>
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}

type ParsedListProps = {
  emptyText: string;
  items: string[];
  title: string;
};

function ParsedList({ emptyText, items, title }: ParsedListProps) {
  return (
    <div className="evidence-card">
      <span className="parsing-profile-grid__label">{title}</span>
      {items.length ? (
        <ul className="bullet-list">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <p>{emptyText}</p>
      )}
    </div>
  );
}
