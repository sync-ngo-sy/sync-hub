import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { EmptyState, Panel, Tag } from "@/components/ui";
import type { JobPosting } from "@/lib/contracts";
import { platformApi } from "@/lib/platformApi";
import { formatPercent } from "@/features/jobs/jobPresentation";

type JobPostingPerformancePanelProps = {
  job: JobPosting;
};

function defaultStartDate() {
  const date = new Date();
  date.setDate(date.getDate() - 30);
  return date.toISOString().slice(0, 10);
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

export function JobPostingPerformancePanel({ job }: JobPostingPerformancePanelProps) {
  const [startDate, setStartDate] = useState(defaultStartDate);
  const [endDate, setEndDate] = useState(todayDate);

  const performanceQuery = useQuery({
    queryKey: ["job-posting-performance", job.id, startDate, endDate],
    queryFn: () => platformApi.getJobPostingPerformance({
      jobId: job.id,
      startDate,
      endDate,
    }),
    enabled: Boolean(job.id),
  });

  const performance = performanceQuery.data;
  const hasSourceBreakdown = (performance?.bySource.length ?? 0) > 0;

  const summaryCards = useMemo(() => {
    if (!performance) {
      return [];
    }
    return [
      { label: "Views", value: String(performance.views) },
      { label: "Applications", value: String(performance.applications) },
      { label: "Conversion rate", value: formatPercent(performance.conversionRate) },
    ];
  }, [performance]);

  if (!job.isPublic || !job.publicSlug) {
    return (
      <Panel className="!border-none relative overflow-hidden rounded-[var(--radius,22px)]">
        <div className="p-6">
          <EmptyState
            title="Public posting required"
            detail="Publish this job publicly to start tracking views, applications, and conversion."
          />
        </div>
      </Panel>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Panel className="!border-none relative overflow-hidden rounded-[var(--radius,22px)]">
        <div className="p-6 flex flex-col gap-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-lg font-bold text-[var(--text)] m-0">Posting performance</h2>
              <p className="text-sm text-[var(--text-muted)] mt-1 m-0">
                Deduplicated public job-detail views, applications, and conversion by source.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="parser-field">
                <span>Start date</span>
                <input
                  className="form-input"
                  type="date"
                  value={startDate}
                  max={endDate}
                  onChange={(event) => setStartDate(event.target.value)}
                />
              </label>
              <label className="parser-field">
                <span>End date</span>
                <input
                  className="form-input"
                  type="date"
                  value={endDate}
                  min={startDate}
                  max={todayDate()}
                  onChange={(event) => setEndDate(event.target.value)}
                />
              </label>
            </div>
          </div>

          {performanceQuery.error ? (
            <div className="status-banner">{String(performanceQuery.error)}</div>
          ) : null}

          {performanceQuery.isLoading ? (
            <p className="text-sm text-[var(--text-muted)] m-0">Loading performance metrics...</p>
          ) : performance ? (
            <>
              <div className="grid gap-3 md:grid-cols-3">
                {summaryCards.map((card) => (
                  <div key={card.label} className="p-4 bg-[var(--border)] rounded-2xl">
                    <p className="text-xs text-[var(--text-muted)] m-0">{card.label}</p>
                    <strong className="text-2xl text-[var(--text)]">{card.value}</strong>
                  </div>
                ))}
              </div>

              {hasSourceBreakdown ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-[var(--text-muted)]">
                        <th className="pb-3 pr-4 font-normal">Source</th>
                        <th className="pb-3 pr-4 font-normal">Views</th>
                        <th className="pb-3 pr-4 font-normal">Applications</th>
                        <th className="pb-3 font-normal">Conversion</th>
                      </tr>
                    </thead>
                    <tbody>
                      {performance.bySource.map((row) => (
                        <tr key={row.sourceLabel} className="border-t border-[var(--border-strong)]">
                          <td className="py-3 pr-4">
                            <Tag>{row.sourceLabel}</Tag>
                          </td>
                          <td className="py-3 pr-4 text-[var(--text)]">{row.views}</td>
                          <td className="py-3 pr-4 text-[var(--text)]">{row.applications}</td>
                          <td className="py-3 text-[var(--text)]">{formatPercent(row.conversionRate)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-[var(--text-muted)] m-0">
                  No views or applications recorded for this date range yet.
                </p>
              )}
            </>
          ) : null}
        </div>
      </Panel>
    </div>
  );
}
