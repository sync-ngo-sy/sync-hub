import { ArrowRight, Lightbulb, Search, Sparkles, Target } from "lucide-react";
import { Panel, Tag } from "@/components/ui";
import { formatNumber, formatPercent, getGapVerdict } from "@/features/insights/insightsDashboard.helpers";
import type { InsightsGapAnalysis, InsightsGapUseCase } from "@/lib/contracts";

type InsightsGapTabProps = {
  canExploreMatches: boolean;
  displayedGapSkills: string[];
  gapAnalysis: InsightsGapAnalysis;
  gapDraft: string;
  gapUseCases: InsightsGapUseCase[];
  hasUnresolvedDraftSkills: boolean;
  isFetching: boolean;
  onApplyGapAnalysis: () => void;
  onExploreMatches: () => void;
  onGapDraftChange: (value: string) => void;
  onGenerateAiBrief: () => void;
  onRunGapUseCase: (query: string) => void;
};

export function InsightsGapTab({
  canExploreMatches,
  displayedGapSkills,
  gapAnalysis,
  gapDraft,
  gapUseCases,
  hasUnresolvedDraftSkills,
  isFetching,
  onApplyGapAnalysis,
  onExploreMatches,
  onGapDraftChange,
  onGenerateAiBrief,
  onRunGapUseCase,
}: InsightsGapTabProps) {
  const totalGapCandidates = gapAnalysis.fullyMatchingCandidates + gapAnalysis.partiallyMatchingCandidates + gapAnalysis.zeroMatchCandidates;
  const fullCoveragePercent = totalGapCandidates ? (gapAnalysis.fullyMatchingCandidates / totalGapCandidates) * 100 : 0;
  const partialCoveragePercent = totalGapCandidates ? (gapAnalysis.partiallyMatchingCandidates / totalGapCandidates) * 100 : 0;
  const zeroCoveragePercent = Math.max(0, 100 - fullCoveragePercent - partialCoveragePercent);
  const reachableCoveragePercent = fullCoveragePercent + partialCoveragePercent;
  const gapVerdict = getGapVerdict(gapAnalysis);

  return (
    <div id="insights-panel-tab3" className="insights-tab-panel" role="tabpanel" aria-labelledby="insights-tab3">
      <Panel className="table-card">
        <div className="panel-heading-row">
          <div>
            <Tag tone="warning">Gap engine</Tag>
            <h3>Skills gap analysis</h3>
          </div>
          {isFetching ? <Tag tone="primary">Analyzing</Tag> : null}
        </div>
        {gapUseCases.length ? (
          <div className="gap-use-cases" aria-label="Gap analysis use cases">
            {gapUseCases.map((useCase) => (
              <button key={useCase.id} className="gap-use-case" type="button" onClick={() => onRunGapUseCase(useCase.query)}>
                <span className="gap-use-case__icon">
                  {useCase.id === "training-cohort" || useCase.id === "funding-evidence" ? <Lightbulb size={17} /> : <Target size={17} />}
                </span>
                <strong>{useCase.title}</strong>
                <span>{useCase.detail}</span>
                <em>{useCase.skills.slice(0, 3).join(" + ")}</em>
              </button>
            ))}
          </div>
        ) : null}
        <form
          className="gap-form"
          onSubmit={(event) => {
            event.preventDefault();
            onApplyGapAnalysis();
          }}
        >
          <div className="gap-form__controls">
            <input
              value={gapDraft}
              onChange={(event) => onGapDraftChange(event.target.value)}
              aria-label="Target role or skill requirement"
              placeholder="e.g. React and React Native"
            />
            <button className="button button--secondary" type="submit" disabled={isFetching}>
              Analyze
            </button>
          </div>
          <div className="gap-requirements">
            <span>Detected requirements</span>
            {displayedGapSkills.length ? (
              <div className="skill-list">
                {displayedGapSkills.map((skill) => (
                  <Tag key={skill}>{skill}</Tag>
                ))}
              </div>
            ) : (
              <p className="gap-requirements__empty">
                {hasUnresolvedDraftSkills ? "Will resolve against the full Supabase skill catalog on analyze." : "No skills detected yet."}
              </p>
            )}
          </div>
        </form>
        <div className="gap-verdict">
          <div>
            <Tag tone={gapVerdict.tone}>Decision signal</Tag>
            <h4>{gapVerdict.title}</h4>
            <p>{gapVerdict.detail}</p>
          </div>
          <div className="gap-verdict__actions">
            <button className="button button--secondary" type="button" onClick={onExploreMatches} disabled={!canExploreMatches}>
              <Search size={16} />
              Explore matches
              <ArrowRight size={15} />
            </button>
            <button className="button button--secondary gap-ai-brief" type="button" onClick={onGenerateAiBrief}>
              <Sparkles size={16} />
              Generate AI brief
            </button>
          </div>
        </div>
        <div className="gap-coverage" aria-label="Candidate requirement coverage">
          <div className="gap-coverage__header">
            <span>Reachable supply</span>
            <strong>{formatPercent(reachableCoveragePercent)}</strong>
          </div>
          <div className="gap-coverage__bar">
            <span className="gap-coverage__full" style={{ width: `${fullCoveragePercent}%` }} />
            <span className="gap-coverage__partial" style={{ width: `${partialCoveragePercent}%` }} />
            <span className="gap-coverage__zero" style={{ width: `${zeroCoveragePercent}%` }} />
          </div>
          <div className="gap-coverage__legend">
            <span>
              <i className="gap-coverage__dot gap-coverage__dot--full" /> Full
            </span>
            <span>
              <i className="gap-coverage__dot gap-coverage__dot--partial" /> Partial
            </span>
            <span>
              <i className="gap-coverage__dot gap-coverage__dot--zero" /> Zero
            </span>
          </div>
        </div>
        <div className="gap-grid">
          <div>
            <strong>{formatNumber(gapAnalysis.fullyMatchingCandidates)}</strong>
            <span>Full matches</span>
          </div>
          <div>
            <strong>{formatNumber(gapAnalysis.partiallyMatchingCandidates)}</strong>
            <span>Partial matches</span>
          </div>
          <div>
            <strong>{formatNumber(gapAnalysis.zeroMatchCandidates)}</strong>
            <span>Zero matches</span>
          </div>
        </div>
        <div className="missing-skills">
          <div className="gap-section-heading">
            <strong>Upskilling opportunities</strong>
            <span>Most absent skills among partial profiles</span>
          </div>
          {gapAnalysis.missingSkills.length ? (
            gapAnalysis.missingSkills.map((item) => (
              <div key={item.skill} className="signal-row missing-skill-row">
                <strong>{item.skill}</strong>
                <span>{formatNumber(item.missingFromPartialCandidates)} missing</span>
              </div>
            ))
          ) : (
            <p className="gap-requirements__empty">No missing-skill pattern yet.</p>
          )}
        </div>
      </Panel>
    </div>
  );
}
