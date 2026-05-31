import { FileText } from "lucide-react";
import { Panel } from "@/components/ui";
import type { ParsingDocumentDetail } from "@/lib/contracts";
import { formatParsingDateTime } from "@/features/parsing/utils/parsingDocument";

type ProcessingMetadataPanelProps = {
  detail: ParsingDocumentDetail;
  workspaceName: string;
};

export function ProcessingMetadataPanel({ detail, workspaceName }: ProcessingMetadataPanelProps) {
  const metadata = [
    { label: "Workspace", value: workspaceName },
    { label: "Uploaded", value: formatParsingDateTime(detail.uploadedAt) },
    { label: "Updated", value: formatParsingDateTime(detail.updatedAt) },
    { label: "Parser", value: detail.parserVersion },
    { label: "Model", value: detail.modelVersion },
    { label: "Prompt", value: detail.promptVersion },
    { label: "Embeddings", value: detail.embeddingVersion },
  ];

  return (
    <Panel className="table-card">
      <div className="stack">
        <div className="skill-list">
          <FileText size={16} />
          <h3>Processing metadata</h3>
        </div>
        <div className="parsing-meta-list">
          {metadata.map((item) => (
            <div key={item.label} className="signal-row">
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </div>
          ))}
        </div>
        <div className="evidence-card">
          <span className="parsing-profile-grid__label">Source URI</span>
          <p>{detail.sourceUri}</p>
          {detail.storagePath ? <p>{detail.storagePath}</p> : null}
        </div>
      </div>
    </Panel>
  );
}
