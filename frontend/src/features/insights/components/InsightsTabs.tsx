import { INSIGHTS_TABS, type InsightsTab } from "@/features/insights/insightsDashboard.helpers";
import { cn } from "@/lib/cn";

type InsightsTabsProps = {
  activeTab: InsightsTab;
  onSelectTab: (tab: InsightsTab) => void;
};

export function InsightsTabs({ activeTab, onSelectTab }: InsightsTabsProps) {
  return (
    <div className="insights-tabs" role="tablist" aria-label="Insights dashboard tabs">
      {INSIGHTS_TABS.map((tab) => (
        <button
          key={tab.id}
          id={`insights-${tab.id}`}
          className={cn("insights-tab", activeTab === tab.id && "insights-tab--active")}
          type="button"
          role="tab"
          aria-controls={`insights-panel-${tab.id}`}
          aria-selected={activeTab === tab.id}
          onClick={() => onSelectTab(tab.id)}
        >
          <strong>{tab.label}</strong>
          <span>{tab.detail}</span>
        </button>
      ))}
    </div>
  );
}
