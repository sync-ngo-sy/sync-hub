import { useState } from "react";
import { Link } from "react-router-dom";
import { indexingWorkbench } from "@/data/mockData";
import { InlineCta, PageIntro, Panel, ProgressBar, Tag } from "@/components/ui";

export function SearchConfigurationPage() {
  const [mode, setMode] = useState<"balanced" | "precision" | "coverage">("balanced");

  return (
    <div className="page-stack">
      <PageIntro
        eyebrow="Sync style configuration"
        title="Search configuration"
        description="Design the recruiter prompt, tuning posture, and deterministic filters before traffic hits the ranking RPC. This screen is optimized for operators who want explicit control, not a chat-first workflow."
        actions={
          <Link className="button button--primary" to="/search">
            Launch Search
          </Link>
        }
      />

      <div className="hero-grid">
        <Panel className="hero-panel">
          <div className="stack">
            <Tag tone="primary">Intent brief</Tag>
            <h2>Shape the search before retrieval runs.</h2>
            <p>Use a concise job brief and let the system convert it into structured filters, ranking posture, and explainable recruiter-facing outputs.</p>
          </div>
          <div className="panel__section" style={{ marginTop: 24 }}>
            <textarea
              className="form-textarea"
              defaultValue="Find a senior backend engineer who can own Node.js APIs, GraphQL federation, and platform reliability for a multi-tenant recruiter product."
            />
          </div>
          <div className="skill-list">
            <Tag tone="primary">Node.js</Tag>
            <Tag tone="primary">GraphQL</Tag>
            <Tag tone="primary">Platform</Tag>
            <Tag>Hybrid retrieval</Tag>
            <Tag>Multi-tenant</Tag>
          </div>
        </Panel>

        <Panel className="filters-panel">
          <div className="panel__section">
            <span>Retrieval posture</span>
            <div className="pill-toggle">
              {(["balanced", "precision", "coverage"] as const).map((item) => (
                <button key={item} data-active={mode === item} onClick={() => setMode(item)} type="button">
                  {item}
                </button>
              ))}
            </div>
          </div>

          <label className="panel__section">
            <span>Geography</span>
            <select className="form-select" defaultValue="remote">
              <option value="remote">Global / Remote</option>
              <option value="emea">EMEA</option>
              <option value="uk">United Kingdom</option>
            </select>
          </label>

          <label className="panel__section">
            <span>Minimum experience</span>
            <input className="form-input" type="number" defaultValue={6} />
          </label>

          <label className="panel__section">
            <span>Required stack</span>
            <input className="form-input" defaultValue="Node.js, GraphQL, PostgreSQL, Kubernetes" />
          </label>
        </Panel>
      </div>

      <div className="two-column-grid">
        <Panel className="table-card">
          <div className="stack">
            <h3>Ranking composition</h3>
            <p>Keep retrieval and reasoning separate. These weights should be versioned and exposed in the search metadata returned to the frontend.</p>
          </div>
          <div className="stack" style={{ marginTop: 20 }}>
            {indexingWorkbench.rankingWeights.map((weight) => (
              <div key={weight.label} className="signal-list">
                <div className="signal-row">
                  <strong>{weight.label}</strong>
                  <span>{weight.value}%</span>
                </div>
                <ProgressBar value={weight.value} />
              </div>
            ))}
          </div>
        </Panel>

        <Panel className="table-card">
          <div className="stack">
            <h3>Search run output</h3>
            <p>The frontend expects ranked candidates, score breakdowns, and short summaries. That output is already compatible with the current Supabase search function.</p>
            <InlineCta title="API-ready contract" detail="`POST /search` returns ranked candidates, score breakdowns, evidence, and rank metadata." />
            <InlineCta
              title="Explainability guardrail"
              detail="Any reasoning happens after retrieval and cites stored evidence. The UI never depends on live hallucinated summaries."
            />
          </div>
        </Panel>
      </div>
    </div>
  );
}
