import { useEffect, useState } from "react";
import { SlidersHorizontal, Sparkles } from "lucide-react";
import type { IndexingWorkbench } from "@/lib/contracts";
import { platformApi } from "@/lib/platformApi";
import { PageIntro, Panel, ProgressBar, Tag } from "@/components/ui";

export function IndexingWorkbenchPage() {
  const [workbench, setWorkbench] = useState<IndexingWorkbench | null>(null);

  useEffect(() => {
    let active = true;
    platformApi.getIndexingWorkbench().then((nextWorkbench) => {
      if (active) {
        setWorkbench(nextWorkbench);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  if (!workbench) {
    return (
      <div className="page-stack">
        <PageIntro
          eyebrow="Search configuration"
          title="Search configuration"
          description="Inspect the ranking blend, indexing queues, and quality diagnostics that shape retrieval behavior. This screen is the operator-facing control surface behind the sync-style prototype."
        />
        <Panel className="table-card">
          <p className="muted">Loading search configuration...</p>
        </Panel>
      </div>
    );
  }

  return (
    <div className="page-stack">
      <PageIntro
        eyebrow="Search configuration"
        title="Search configuration"
        description="Inspect the ranking blend, indexing queues, and quality diagnostics that shape retrieval behavior. This screen is the operator-facing control surface behind the sync-style prototype."
      />

      <div className="two-column-grid">
        <Panel className="table-card">
          <div className="skill-list">
            <SlidersHorizontal size={16} />
            <h3>Ranking weights</h3>
          </div>
          <div className="stack" style={{ marginTop: 20 }}>
            {workbench.rankingWeights.map((weight, index) => (
              <div key={weight.label} className="signal-list">
                <div className="signal-row">
                  <strong>{weight.label}</strong>
                  <span>{weight.value}%</span>
                </div>
                <ProgressBar value={weight.value} tone={index === 1 ? "secondary" : index === 2 ? "tertiary" : "primary"} />
              </div>
            ))}
          </div>
        </Panel>

        <Panel className="table-card">
          <div className="skill-list">
            <Sparkles size={16} />
            <h3>Quality diagnostics</h3>
          </div>
          <div className="stack" style={{ marginTop: 20 }}>
            {workbench.qualitySignals.map((signal) => (
              <div key={signal.label} className="evidence-card">
                <div className="signal-row">
                  <strong>{signal.label}</strong>
                  <Tag tone="primary">{signal.score}</Tag>
                </div>
                <p>{signal.detail}</p>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <Panel className="table-card">
        <div className="stack">
          <h3>Indexing queues</h3>
          <div className="three-column-grid">
            {workbench.queues.map((queue) => (
              <div key={queue.name} className="evidence-card">
                <div className="signal-row">
                  <strong>{queue.name}</strong>
                  <span>{queue.eta}</span>
                </div>
                <ProgressBar value={queue.progress} />
                <p>{queue.throughput}</p>
              </div>
            ))}
          </div>
        </div>
      </Panel>
    </div>
  );
}
