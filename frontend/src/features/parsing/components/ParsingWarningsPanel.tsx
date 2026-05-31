import { FileWarning } from "lucide-react";
import { Panel, Tag } from "@/components/ui";
import type { ParsingDocumentDetail } from "@/lib/contracts";

type ParsingWarningsPanelProps = {
  detail: ParsingDocumentDetail;
};

export function ParsingWarningsPanel({ detail }: ParsingWarningsPanelProps) {
  return (
    <Panel className="table-card">
      <div className="stack">
        <div className="skill-list">
          <FileWarning size={16} />
          <h3>Warnings and missing fields</h3>
        </div>

        <div className="evidence-card">
          <span className="parsing-profile-grid__label">Missing fields</span>
          {detail.missingFields.length ? (
            <div className="skill-list">
              {detail.missingFields.map((field) => (
                <Tag key={field} tone="warning">
                  {field}
                </Tag>
              ))}
            </div>
          ) : (
            <p>No required fields are currently flagged as missing.</p>
          )}
        </div>

        <WarningList title="Parse warnings" items={detail.parseWarnings} emptyText="No parse warnings were recorded." />
        <WarningList title="Processing warnings" items={detail.processingWarnings} emptyText="No processing warnings were recorded." />

        {detail.errorCode || detail.errorMessage ? (
          <div className="evidence-card">
            <span className="parsing-profile-grid__label">Run error</span>
            <p>{detail.errorCode ?? "Unknown error"}</p>
            {detail.errorMessage ? <p>{detail.errorMessage}</p> : null}
          </div>
        ) : null}
      </div>
    </Panel>
  );
}

type WarningListProps = {
  emptyText: string;
  items: string[];
  title: string;
};

function WarningList({ emptyText, items, title }: WarningListProps) {
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
