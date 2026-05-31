import { useEffect, useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, Cpu, Server } from "lucide-react";
import type { SystemHealth } from "@/lib/contracts";
import { platformApi } from "@/lib/platformApi";
import { PageIntro, Panel, StatCard, Tag } from "@/components/ui";

export function SystemHealthPage() {
  const [health, setHealth] = useState<SystemHealth | null>(null);

  useEffect(() => {
    let active = true;
    platformApi.getSystemHealth().then((nextHealth) => {
      if (active) {
        setHealth(nextHealth);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  if (!health) {
    return (
      <div className="page-stack">
        <PageIntro
          eyebrow="Operations"
          title="System health & monitoring"
          description="Track the online read path and the offline worker fleet in one operational view. This is the control plane for shared-hosting constraints and offline-heavy processing."
        />
        <Panel className="table-card">
          <p className="muted">Loading system health...</p>
        </Panel>
      </div>
    );
  }

  return (
    <div className="page-stack">
      <PageIntro
        eyebrow="Operations"
        title="System health & monitoring"
        description="Track the online read path and the offline worker fleet in one operational view. This is the control plane for shared-hosting constraints and offline-heavy processing."
      />

      <div className="stats-grid">
        <StatCard label="Overall status" value={health.overallStatus} delta={health.uptime} />
        <StatCard label="API latency" value={`${health.latencyMs} ms`} delta="p95" tone="secondary" />
        <StatCard label="Memory usage" value={`${health.memory}%`} delta="steady" tone="tertiary" />
        <StatCard label="Worker uptime" value={health.uptime} delta="30d" />
      </div>

      <div className="admin-grid">
        <Panel className="table-card">
          <div className="stack">
            <h3>Service posture</h3>
            {health.services.map((service) => (
              <div key={service.name} className="evidence-card">
                <div className="signal-row">
                  <strong>{service.name}</strong>
                  <span>{service.latency}</span>
                </div>
                <div className="skill-list">
                  <Tag tone={service.status === "healthy" ? "success" : "warning"}>{service.status}</Tag>
                </div>
                <p>{service.detail}</p>
              </div>
            ))}
          </div>
        </Panel>

        <Panel className="table-card">
          <div className="stack">
            <h3>Fleet summary</h3>
            {health.workerFleet.map((worker) => (
              <div key={worker.name} className="evidence-card">
                <div className="signal-row">
                  <strong>{worker.name}</strong>
                  <span>{worker.region}</span>
                </div>
                <div className="meta-list">
                  <span className="tag">
                    <Server size={14} />
                    Queue {worker.queueDepth}
                  </span>
                  <span className="tag">
                    <Cpu size={14} />
                    {worker.throughput}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div className="two-column-grid">
        <Panel className="table-card">
          <div className="stack">
            <div className="skill-list">
              <Activity size={16} />
              <h3>Live events</h3>
            </div>
            <div className="logs">
              {health.logs.map((log) => (
                <div key={`${log.timestamp}-${log.message}`} className="log-line">
                  <span className={`log-line__level log-line__level--${log.level}`}>{log.level}</span>
                  <span>{log.timestamp}</span>
                  <span>{log.message}</span>
                </div>
              ))}
            </div>
          </div>
        </Panel>

        <Panel className="table-card">
          <div className="stack">
            <h3>Operator checklist</h3>
            <div className="evidence-card">
              <div className="skill-list">
                <CheckCircle2 size={16} />
                <strong>Supabase search path healthy</strong>
              </div>
              <p>Read APIs are within expected latency and no tenant leakage alerts are active.</p>
            </div>
            <div className="evidence-card">
              <div className="skill-list">
                <AlertTriangle size={16} />
                <strong>Parser backlog needs attention</strong>
              </div>
              <p>Image-heavy CVs still need OCR fallback tuning before you run the full 6,000-CV import.</p>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}
