import { Panel, Tag } from "@/components/ui";
import { SIMULATOR_STAGES } from "@/features/search-configuration/searchSimulator.constants";
import { stageStatus } from "@/features/search-configuration/searchSimulator.helpers";

type SearchSimulatorTimelineProps = {
  activeStage: number;
  completedCount: number;
  loading: boolean;
  stageNarrative: string[];
};

export function SearchSimulatorTimeline({ activeStage, completedCount, loading, stageNarrative }: SearchSimulatorTimelineProps) {
  return (
    <Panel className="simulator-panel simulator-panel--timeline">
      <div className="simulator-panel__header">
        <div>
          <Tag tone="primary">Execution trace</Tag>
          <h2>Watch the request move through the search engine.</h2>
        </div>
      </div>

      <div className="simulator-timeline">
        {SIMULATOR_STAGES.map((stage, index) => {
          const status = stageStatus(index, activeStage, completedCount, loading);
          const Icon = stage.icon;

          return (
            <div key={stage.id} className={`simulator-step simulator-step--${status}`}>
              <div className="simulator-step__icon">
                <Icon size={16} />
              </div>
              <div className="simulator-step__body">
                <div className="simulator-step__title-row">
                  <strong>{stage.label}</strong>
                  <Tag tone={status === "complete" ? "success" : status === "active" ? "primary" : "neutral"}>
                    {status === "complete" ? "Done" : status === "active" ? "Running" : "Pending"}
                  </Tag>
                </div>
                <p>{stageNarrative[index]}</p>
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
