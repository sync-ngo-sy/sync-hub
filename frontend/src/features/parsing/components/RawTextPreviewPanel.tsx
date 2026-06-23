import { ScanText } from "lucide-react";
import { Panel } from "@/components/ui";
import type { ParsingDocumentDetail } from "@/lib/contracts";

type RawTextPreviewPanelProps = {
  detail: ParsingDocumentDetail;
};

export function RawTextPreviewPanel({ detail }: RawTextPreviewPanelProps) {
  return (
    <Panel className="table-card">
      <div className="stack">
        <div className="skill-list">
          <ScanText size={16} />
          <h3>Raw text preview</h3>
        </div>
        <p>This is the parsed document body that downstream extraction and embeddings were built from.</p>
        <pre className="parsing-raw-text">{detail.rawTextPreview || "No raw text preview available."}</pre>
      </div>
    </Panel>
  );
}
