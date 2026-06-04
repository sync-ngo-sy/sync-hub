import { Panel, Tag } from "@/components/ui";
import { formatNumber } from "@/features/insights/insightsDashboard.helpers";
import type { InsightsSkillFrequency } from "@/lib/contracts";

type InsightsSkillsTabProps = {
  topSkillsDraft: string;
  visibleSkills: InsightsSkillFrequency[];
  onApplyTopSkills: () => void;
  onTopSkillsDraftChange: (value: string) => void;
};

export function InsightsSkillsTab({
  topSkillsDraft,
  visibleSkills,
  onApplyTopSkills,
  onTopSkillsDraftChange,
}: InsightsSkillsTabProps) {
  return (
    <div id="insights-panel-tab2" className="insights-tab-panel" role="tabpanel" aria-labelledby="insights-tab2">
      <Panel className="table-card">
        <div className="panel-heading-row">
          <div>
            <Tag tone="warning">Skills</Tag>
            <h3>Top skills frequency</h3>
          </div>
          <div className="insights-control-row">
            <label className="compact-field">
              Top N
              <input
                min={10}
                max={200}
                type="number"
                value={topSkillsDraft}
                onChange={(event) => onTopSkillsDraftChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    onApplyTopSkills();
                  }
                }}
              />
            </label>
            <button className="button button--secondary button--compact" type="button" onClick={onApplyTopSkills}>
              Apply
            </button>
          </div>
        </div>
        <SkillsBars items={visibleSkills} />
      </Panel>
    </div>
  );
}

function SkillsBars({ items }: { items: InsightsSkillFrequency[] }) {
  const visible = items.slice(0, 15);
  const max = Math.max(...visible.map((item) => item.count), 1);
  return (
    <div className="ranked-bars">
      {visible.map((item, index) => (
        <div className="ranked-bars__row" key={item.skill}>
          <span>{index + 1}</span>
          <strong>{item.skill}</strong>
          <div className="progress-bar">
            <span className="progress-bar__value progress-bar__value--secondary" style={{ width: `${(item.count / max) * 100}%` }} />
          </div>
          <em>{formatNumber(item.count)}</em>
        </div>
      ))}
    </div>
  );
}
