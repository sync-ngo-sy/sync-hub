import { Panel, Tag } from "@/components/ui";
import type { ParsingDocumentDetail } from "@/lib/contracts";
import { parsingFieldTone } from "@/features/parsing/utils/parsingDocument";

type FieldCoveragePanelProps = {
  detail: ParsingDocumentDetail;
};

export function FieldCoveragePanel({ detail }: FieldCoveragePanelProps) {
  return (
    <Panel className="table-card">
      <div className="stack">
        <div className="signal-row">
          <div>
            <h3>Field coverage</h3>
            <p>Coverage is the basis for the parse percentage. Parsed means the field group is present and structurally usable; partial means it needs review.</p>
          </div>
          <div className="skill-list">
            <Tag tone={detail.qualityBand === "healthy" ? "success" : "warning"}>{detail.qualityBand}</Tag>
            <Tag>{detail.status}</Tag>
          </div>
        </div>

        <div className="parsing-field-grid">
          {detail.fieldCoverage.map((field) => (
            <div key={field.label} className={`parsing-field-card parsing-field-card--${field.state}`}>
              <div className="signal-row">
                <strong>{field.label}</strong>
                <Tag tone={parsingFieldTone(field.state)}>{field.state}</Tag>
              </div>
              <p>{field.detail}</p>
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
}
