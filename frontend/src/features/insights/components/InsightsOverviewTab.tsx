import { BarChart3, Download, Grid2X2, PieChart, Search, Table2, TrendingDown, TrendingUp } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Panel, Tag } from "@/components/ui";
import {
  CHART_COLORS,
  exportJobFamilies,
  formatNumber,
  type JobFamilyView,
} from "@/features/insights/insightsDashboard.helpers";
import { cn } from "@/lib/cn";
import type { InsightsDashboardSnapshot, InsightsDistributionItem, InsightsMetric } from "@/lib/contracts";

const JOB_FAMILY_VIEW_OPTIONS: Array<{ view: JobFamilyView; icon: LucideIcon }> = [
  { view: "donut", icon: PieChart },
  { view: "treemap", icon: Grid2X2 },
  { view: "table", icon: Table2 },
];

type InsightsOverviewTabProps = {
  snapshot: InsightsDashboardSnapshot;
  jobFamilyView: JobFamilyView;
  onChangeJobFamilyView: (view: JobFamilyView) => void;
  onDrilldownJobFamily: (family: string) => void;
};

export function InsightsOverviewTab({
  snapshot,
  jobFamilyView,
  onChangeJobFamilyView,
  onDrilldownJobFamily,
}: InsightsOverviewTabProps) {
  return (
    <div id="insights-panel-tab1" className="insights-tab-panel" role="tabpanel" aria-labelledby="insights-tab1">
      <div className="stats-grid">
        {snapshot.metrics.map((metric) => (
          <MetricCard key={metric.key} metric={metric} />
        ))}
      </div>

      <div className="two-column-grid">
        <Panel className="table-card">
          <div className="panel-heading-row">
            <div>
              <Tag tone="primary">Corpus mix</Tag>
              <h3>Profiles by seniority</h3>
            </div>
            <BarChart3 size={18} />
          </div>
          <DistributionBars items={snapshot.profilesBySeniority} />
        </Panel>

        <Panel className="table-card">
          <div className="panel-heading-row">
            <div>
              <Tag tone="primary">Geo coverage</Tag>
              <h3>Profiles by location</h3>
            </div>
            <Search size={18} />
          </div>
          <DistributionBars items={snapshot.profilesByLocation} />
        </Panel>
      </div>

      <Panel className="table-card">
        <div className="panel-heading-row">
          <div>
            <Tag tone="success">Production taxonomy</Tag>
            <h3>Job family distribution</h3>
          </div>
          <div className="segmented-control" role="tablist" aria-label="Job family visualization">
            {JOB_FAMILY_VIEW_OPTIONS.map(({ view, icon: Icon }) => (
              <button
                key={view}
                className={cn(jobFamilyView === view && "segmented-control__item--active")}
                type="button"
                onClick={() => onChangeJobFamilyView(view)}
                aria-label={`${view} view`}
              >
                <Icon size={16} />
              </button>
            ))}
          </div>
        </div>

        {jobFamilyView === "donut" ? <JobFamilyDonut items={snapshot.jobFamilies} onDrilldown={onDrilldownJobFamily} /> : null}
        {jobFamilyView === "treemap" ? <JobFamilyTreemap items={snapshot.jobFamilies} onDrilldown={onDrilldownJobFamily} /> : null}
        {jobFamilyView === "table" ? <JobFamilyTable items={snapshot.jobFamilies} onDrilldown={onDrilldownJobFamily} /> : null}
      </Panel>

      <Panel className="table-card">
        <div className="panel-heading-row">
          <div>
            <Tag tone="primary">Seniority pyramid</Tag>
            <h3>Job family by seniority</h3>
          </div>
        </div>
        <div className="pyramid-table">
          {snapshot.seniorityPyramid.map((row) => {
            const total = Math.max(1, row.junior + row.mid + row.senior + row.lead + row.executive);
            return (
              <div className="pyramid-row" key={row.jobFamily}>
                <strong>{row.jobFamily}</strong>
                <div className="pyramid-stack" aria-label={`${row.jobFamily} seniority split`}>
                  <span style={{ width: `${(row.junior / total) * 100}%` }}>Junior</span>
                  <span style={{ width: `${(row.mid / total) * 100}%` }}>Mid</span>
                  <span style={{ width: `${(row.senior / total) * 100}%` }}>Senior</span>
                  <span style={{ width: `${(row.lead / total) * 100}%` }}>Lead</span>
                  <span style={{ width: `${(row.executive / total) * 100}%` }}>Exec</span>
                </div>
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}

function MetricCard({ metric }: { metric: InsightsMetric }) {
  const max = Math.max(...metric.sparkline, 1);
  const points = metric.sparkline
    .map((value, index) => {
      const x = metric.sparkline.length <= 1 ? 0 : (index / (metric.sparkline.length - 1)) * 100;
      const y = 36 - (value / max) * 32;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <Panel className="insight-stat">
      <div className="insight-stat__top">
        <span>{metric.label}</span>
        {metric.trend === "down" ? <TrendingDown size={16} /> : <TrendingUp size={16} />}
      </div>
      <strong>{formatNumber(metric.value)}</strong>
      <span className={cn("insight-stat__delta", metric.trend === "down" && "insight-stat__delta--down")}>
        {metric.deltaValue >= 0 ? "+" : ""}
        {formatNumber(metric.deltaValue)} vs previous 30 days
      </span>
      <svg className="sparkline" viewBox="0 0 100 40" role="img" aria-label={`${metric.label} trend`}>
        <polyline points={points} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </Panel>
  );
}

function DistributionBars({ items }: { items: InsightsDistributionItem[] }) {
  const max = Math.max(...items.map((item) => item.value), 1);
  return (
    <div className="insight-bars">
      {items.map((item) => (
        <div className="insight-bars__row" key={item.label}>
          <div className="signal-row">
            <strong>{item.label}</strong>
            <span>{formatNumber(item.value)}</span>
          </div>
          <div className="progress-bar">
            <span className="progress-bar__value progress-bar__value--primary" style={{ width: `${(item.value / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function JobFamilyDonut({ items, onDrilldown }: { items: InsightsDistributionItem[]; onDrilldown: (family: string) => void }) {
  const total = items.reduce((sum, item) => sum + item.value, 0) || 1;
  let cursor = 0;
  const stops = items
    .map((item, index) => {
      const start = cursor;
      const end = cursor + (item.value / total) * 100;
      cursor = end;
      return `${CHART_COLORS[index % CHART_COLORS.length]} ${start}% ${end}%`;
    })
    .join(", ");

  return (
    <div className="job-family-donut">
      <button
        className="job-family-donut__chart"
        style={{ background: `conic-gradient(${stops})` }}
        type="button"
        aria-label="Job family distribution donut"
        onClick={() => onDrilldown(items[0]?.label ?? "")}
      />
      <div className="job-family-legend">
        {items.map((item, index) => (
          <button key={item.label} className="job-family-legend__item" type="button" onClick={() => onDrilldown(item.label)}>
            <span style={{ background: CHART_COLORS[index % CHART_COLORS.length] }} />
            <strong>{item.label}</strong>
            <em>{item.percent ?? Math.round((item.value / total) * 100)}%</em>
          </button>
        ))}
      </div>
    </div>
  );
}

function JobFamilyTreemap({ items, onDrilldown }: { items: InsightsDistributionItem[]; onDrilldown: (family: string) => void }) {
  const total = items.reduce((sum, item) => sum + item.value, 0) || 1;
  return (
    <div className="job-family-treemap">
      {items.map((item, index) => (
        <button
          key={item.label}
          className="job-family-tile"
          style={{ flexGrow: Math.max(1, (item.value / total) * 100), background: CHART_COLORS[index % CHART_COLORS.length] }}
          type="button"
          onClick={() => onDrilldown(item.label)}
        >
          <strong>{item.label}</strong>
          <span>{formatNumber(item.value)}</span>
        </button>
      ))}
    </div>
  );
}

function JobFamilyTable({ items, onDrilldown }: { items: InsightsDistributionItem[]; onDrilldown: (family: string) => void }) {
  return (
    <div className="responsive-table">
      <button className="button button--secondary table-export" type="button" onClick={() => exportJobFamilies(items)}>
        <Download size={16} />
        CSV
      </button>
      <table>
        <thead>
          <tr>
            <th>Job family</th>
            <th>Profiles</th>
            <th>Share</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.label}>
              <td>
                <button className="table-link-button" type="button" onClick={() => onDrilldown(item.label)}>
                  {item.label}
                </button>
              </td>
              <td>{formatNumber(item.value)}</td>
              <td>{item.percent ?? 0}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
