import { AlertTriangle } from "lucide-react";
import { Panel } from "@/components/ui";
import type { ParsingDocumentDetail } from "@/lib/contracts";

type OptimizationHintsPanelProps = {
  detail: ParsingDocumentDetail;
};

export function OptimizationHintsPanel({ detail }: OptimizationHintsPanelProps) {
  return (
    <Panel className="table-card">
      <div className="stack">
        <div className="skill-list">
          <AlertTriangle size={16} />
          <h3>Optimization hints</h3>
        </div>
        {detail.optimizationHints.length ? (
          <ul className="bullet-list">
            {detail.optimizationHints.map((hint) => (
              <li key={hint}>{hint}</li>
            ))}
          </ul>
        ) : (
          <p>No immediate parser optimization suggestions were generated for this document.</p>
        )}
      </div>
    </Panel>
  );
}
