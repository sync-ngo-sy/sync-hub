import { useEffect, useState } from "react";
import { Database, FolderSync, RefreshCw } from "lucide-react";
import type { DataConnector, IndexingJob } from "@/lib/contracts";
import { platformApi } from "@/lib/platformApi";
import { PageIntro, Panel, ProgressBar, Tag } from "@/components/ui";

export function DataManagementPage() {
  const [connectors, setConnectors] = useState<DataConnector[]>([]);
  const [indexingJobs, setIndexingJobs] = useState<IndexingJob[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    Promise.all([platformApi.getDataConnectors(), platformApi.getIndexingWorkbench()])
      .then(([nextConnectors, workbench]) => {
        if (active) {
          setConnectors(nextConnectors);
          setIndexingJobs(workbench.queues);
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="page-stack">
      <PageIntro
        eyebrow="Offline ingestion"
        title="Data management & indexing"
        description="Track the raw CV corpus, external source connectors, and indexing jobs that feed the search plane. This screen reflects the offline-first operating model."
      />

      <div className="admin-grid">
        <Panel className="table-card">
          <div className="stack">
            <div className="skill-list">
              <Database size={16} />
              <h3>Connected sources</h3>
            </div>
            {loading && !connectors.length ? <p className="muted">Loading connected sources...</p> : null}
            {connectors.map((connector) => (
              <div key={connector.name} className="evidence-card">
                <div className="signal-row">
                  <strong>{connector.name}</strong>
                  <span>{connector.records}</span>
                </div>
                <div className="skill-list">
                  <Tag tone={connector.status === "active" ? "success" : connector.status === "warning" ? "warning" : "neutral"}>
                    {connector.status}
                  </Tag>
                  <Tag>{connector.freshness}</Tag>
                </div>
                <p>Owner: {connector.owner}</p>
              </div>
            ))}
          </div>
        </Panel>

        <Panel className="table-card">
          <div className="stack">
            <div className="skill-list">
              <FolderSync size={16} />
              <h3>Active jobs</h3>
            </div>
            {loading && !indexingJobs.length ? <p className="muted">Loading indexing jobs...</p> : null}
            {!loading && !indexingJobs.length ? <p className="muted">No active indexing jobs.</p> : null}
            {indexingJobs.map((job) => (
              <div key={job.name} className="evidence-card">
                <div className="signal-row">
                  <strong>{job.name}</strong>
                  <span>{job.eta}</span>
                </div>
                <ProgressBar value={job.progress} />
                <div className="signal-row">
                  <span>{job.progress}% complete</span>
                  <span>{job.throughput}</span>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div className="two-column-grid">
        <Panel className="table-card">
          <div className="stack">
            <h3>Operational notes</h3>
            <ul className="bullet-list">
              <li>Keep document parsing, extraction, chunking, embeddings, and summaries offline and resumable.</li>
              <li>Sync only finalized artifacts into Supabase so the shared-hosted frontend remains thin.</li>
              <li>Store run metadata and failure reasons so reprocessing is idempotent across the 6,000-CV corpus.</li>
            </ul>
          </div>
        </Panel>

        <Panel className="table-card">
          <div className="stack">
            <div className="skill-list">
              <RefreshCw size={16} />
              <h3>Refresh policy</h3>
            </div>
            <p>Connectors are designed for offline sync windows. The UI surfaces freshness and queue pressure so operators can delay heavy rebuilds during recruiter traffic peaks.</p>
          </div>
        </Panel>
      </div>
    </div>
  );
}
