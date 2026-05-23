import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Cloud, Database, FileText, RefreshCw, Rows3, TimerReset } from "lucide-react";
import { EmptyState, PageIntro, Panel, StatCard, Tag } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import type { ManatalSyncStatus } from "@/lib/contracts";
import { platformApi } from "@/lib/platformApi";

function formatDateTime(value: string | null) {
  if (!value) {
    return "None";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function statusTone(status: string) {
  if (status === "synced") {
    return "success" as const;
  }
  if (status === "failed") {
    return "warning" as const;
  }
  if (status === "pending") {
    return "primary" as const;
  }
  return "neutral" as const;
}

function ProgressBar({ label, value }: { label: string; value: number }) {
  const bounded = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className="sync-progress">
      <div className="sync-progress__header">
        <span>{label}</span>
        <strong>{bounded}%</strong>
      </div>
      <div className="sync-progress__track" aria-hidden="true">
        <span style={{ width: `${bounded}%` }} />
      </div>
    </div>
  );
}

export function ManatalSyncStatusPage() {
  const { adminMemberships, enabled, isAdmin, loading } = useAuth();
  const [status, setStatus] = useState<ManatalSyncStatus | null>(null);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const adminTenantIds = useMemo(() => adminMemberships.map((membership) => membership.id), [adminMemberships]);

  const loadStatus = useCallback(() => {
    if (enabled && loading) {
      return;
    }
    if (enabled && !isAdmin) {
      return;
    }
    setFetching(true);
    setError(null);
    platformApi
      .getManatalSyncStatus(adminTenantIds)
      .then(setStatus)
      .catch((statusError) => setError(statusError instanceof Error ? statusError.message : String(statusError)))
      .finally(() => setFetching(false));
  }, [adminTenantIds, enabled, isAdmin, loading]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  if (enabled && !loading && !isAdmin) {
    return (
      <div className="page-stack">
        <EmptyState title="Admin only" detail="Manatal sync status is restricted to platform admins." />
      </div>
    );
  }

  const totals = status?.totals;

  return (
    <div className="page-stack">
      <PageIntro
        eyebrow="Operations"
        title="Manatal Sync Status"
        description="Queue state, GCS original coverage, and recent sync activity for the Manatal ingestion path."
        actions={
          <button className="button button--secondary" type="button" onClick={loadStatus} disabled={fetching}>
            <RefreshCw size={16} />
            Refresh
          </button>
        }
      />

      {error ? <EmptyState title="Unable to load sync status" detail={error} /> : null}

      <div className="stats-grid">
        <StatCard label="Protected originals" value={(totals?.gcsOriginals ?? 0).toLocaleString()} delta={`${status?.coverage.gcsOriginalsPercent ?? 0}% of source docs`} icon={<Cloud size={16} />} />
        <StatCard label="Pending Manatal" value={(totals?.pendingRows ?? 0).toLocaleString()} delta="queued candidates" tone="secondary" icon={<Rows3 size={16} />} />
        <StatCard label="Synced Manatal" value={(totals?.syncedRows ?? 0).toLocaleString()} delta={`${status?.coverage.manatalSyncedPercent ?? 0}% of rows`} tone="tertiary" icon={<CheckCircle2 size={16} />} />
        <StatCard label="Last sync" value={formatDateTime(status?.lastSyncedAt ?? null)} delta={status ? `loaded ${formatDateTime(status.generatedAt)}` : "loading"} icon={<TimerReset size={16} />} />
      </div>

      <div className="admin-grid">
        <Panel className="table-card">
          <div className="stack">
            <div className="signal-row">
              <h3>Coverage</h3>
              <Tag tone={(status?.coverage.gcsOriginalsPercent ?? 0) >= 90 ? "success" : "primary"}>{fetching ? "refreshing" : "current"}</Tag>
            </div>
            <ProgressBar label="Source documents with private GCS originals" value={status?.coverage.gcsOriginalsPercent ?? 0} />
            <ProgressBar label="Manatal rows synced" value={status?.coverage.manatalSyncedPercent ?? 0} />
            <ProgressBar label="Manatal rows mapped to source documents" value={status?.coverage.mappedRowsPercent ?? 0} />
            <div className="sync-metric-grid">
              <span><FileText size={14} /> {(totals?.sourceDocuments ?? 0).toLocaleString()} source docs</span>
              <span><Cloud size={14} /> {(totals?.gcsOriginals ?? 0).toLocaleString()} GCS originals</span>
              <span><Database size={14} /> {(totals?.mappedManatalRows ?? 0).toLocaleString()} mapped rows</span>
              <span><AlertTriangle size={14} /> {(totals?.failedRows ?? 0).toLocaleString()} failed</span>
            </div>
          </div>
        </Panel>

        <Panel className="table-card">
          <div className="stack">
            <div className="signal-row">
              <h3>Last failure</h3>
              <Tag tone={status?.lastFailure ? "warning" : "success"}>{status?.lastFailure ? "needs review" : "clear"}</Tag>
            </div>
            {status?.lastFailure ? (
              <div className="evidence-card">
                <div className="signal-row">
                  <strong>{status.lastFailure.candidateName}</strong>
                  <span>{status.lastFailure.manatalCandidateId}</span>
                </div>
                <p>{status.lastFailure.errorMessage}</p>
                <span className="muted-text">{formatDateTime(status.lastFailure.updatedAt)}</span>
              </div>
            ) : (
              <p className="muted-text">No failed Manatal rows in the current admin scope.</p>
            )}
          </div>
        </Panel>
      </div>

      <Panel className="table-card">
        <div className="parsing-table-controls">
          <div>
            <h3>Recent Manatal rows</h3>
            <p>{status ? `${status.recentRows.length} latest queue updates.` : "Loading latest queue updates."}</p>
          </div>
          <Tag tone="neutral">{(totals?.driveOriginals ?? 0).toLocaleString()} drive-era originals remain</Tag>
        </div>
        <div className="parsing-table">
          <table>
            <thead>
              <tr>
                <th>Candidate</th>
                <th>Status</th>
                <th>Document</th>
                <th>Last synced</th>
              </tr>
            </thead>
            <tbody>
              {(status?.recentRows ?? []).map((row) => (
                <tr key={`${row.manatalCandidateId}-${row.updatedAt ?? ""}`}>
                  <td>
                    <div className="parsing-table__file">
                      <strong>{row.candidateName}</strong>
                      <span>{row.email ?? row.manatalCandidateId}</span>
                    </div>
                  </td>
                  <td>
                    <Tag tone={statusTone(row.syncStatus)}>{row.syncStatus}</Tag>
                  </td>
                  <td>
                    <div className="parsing-table__score">
                      <strong>{row.sourceDocumentId ? "linked" : "not linked"}</strong>
                      <span>{row.sourceDocumentId ?? row.errorMessage ?? "waiting"}</span>
                    </div>
                  </td>
                  <td>{formatDateTime(row.lastSyncedAt ?? row.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
