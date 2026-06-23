import { useEffect, useState } from "react";
import type { AnalyticsSnapshot } from "@/lib/contracts";
import { platformApi } from "@/lib/platformApi";
import { MetricBars, PageIntro, Panel, StatCard, Tag } from "@/components/ui";

export function AnalyticsInsightsPage() {
  const [snapshot, setSnapshot] = useState<AnalyticsSnapshot | null>(null);

  useEffect(() => {
    let active = true;
    platformApi.getAnalytics().then((nextSnapshot) => {
      if (active) {
        setSnapshot(nextSnapshot);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  if (!snapshot) {
    return (
      <div className="page-stack">
        <PageIntro
          eyebrow="Operational analytics"
          title="Analytics & insights"
          description="Measure recruiter adoption, pipeline efficiency, and how well the retrieval system is serving real hiring workflows."
        />
        <Panel className="table-card">
          <p className="muted">Loading analytics...</p>
        </Panel>
      </div>
    );
  }

  return (
    <div className="page-stack">
      <PageIntro
        eyebrow="Operational analytics"
        title="Analytics & insights"
        description="Measure recruiter adoption, pipeline efficiency, and how well the retrieval system is serving real hiring workflows."
      />

      <div className="stats-grid">
        {snapshot.headline.map((metric, index) => (
          <StatCard
            key={metric.label}
            label={metric.label}
            value={metric.value}
            delta={metric.delta}
            tone={index === 0 ? "primary" : index === 1 ? "secondary" : "tertiary"}
          />
        ))}
      </div>

      <div className="hero-grid">
        <Panel className="hero-panel">
          <div className="stack">
            <Tag tone="primary">Funnel velocity</Tag>
            <h2>Recruitment flow stays visible alongside retrieval performance.</h2>
            <p>The intent is to give recruiters and operators one place to understand both candidate quality and how the search product is actually being used.</p>
          </div>
          <MetricBars values={snapshot.funnelVelocity.map((item) => item.value)} />
          <div className="skill-list">
            {snapshot.funnelVelocity.map((item) => (
              <Tag key={item.stage}>{item.stage}</Tag>
            ))}
          </div>
        </Panel>

        <Panel className="table-card">
          <div className="stack">
            <h3>Source mix</h3>
            {snapshot.sourceMix.map((item) => (
              <div key={item.label} className="signal-list">
                <div className="signal-row">
                  <strong>{item.label}</strong>
                  <span>{item.value}%</span>
                </div>
                <div className="progress-bar">
                  <span className="progress-bar__value progress-bar__value--primary" style={{ width: `${item.value}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div className="two-column-grid">
        <Panel className="table-card">
          <div className="stack">
            <h3>AI insights</h3>
            <ul className="bullet-list">
              {snapshot.aiInsights.map((insight) => (
                <li key={insight}>{insight}</li>
              ))}
            </ul>
          </div>
        </Panel>

        <Panel className="table-card">
          <div className="stack">
            <h3>Search patterns</h3>
            {snapshot.searchPatterns.map((pattern) => (
              <div key={pattern.label} className="evidence-card">
                <div className="signal-row">
                  <strong>{pattern.label}</strong>
                  <span>{pattern.value}</span>
                </div>
                <p>{pattern.detail}</p>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}
