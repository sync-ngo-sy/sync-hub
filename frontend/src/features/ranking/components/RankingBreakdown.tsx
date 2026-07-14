import { ProgressBar } from "@/components/ui";
import type { CriterionBreakdown } from "@/features/ranking/types";

function formatContribution(value: number) {
  const rounded = Math.round(value * 100) / 100;
  return rounded > 0 ? `+${rounded}` : `${rounded}`;
}

export function RankingBreakdown({ criteria }: { criteria: CriterionBreakdown[] }) {
  return (
    <div className="ranking-breakdown">
      {criteria.map((criterion) => {
        const pct = criterion.cap > 0 ? (criterion.score / criterion.cap) * 100 : 0;
        return (
          <div key={criterion.key} className="ranking-breakdown__criterion">
            <div className="ranking-breakdown__head">
              <span className="ranking-breakdown__label">{criterion.label}</span>
              <span className="ranking-breakdown__score">
                {criterion.score} / {criterion.cap}
              </span>
            </div>
            <ProgressBar value={pct} tone={pct >= 60 ? "primary" : pct > 0 ? "secondary" : "tertiary"} />
            <ul className="ranking-breakdown__rules">
              {criterion.rules.map((rule, index) => (
                <li
                  key={`${criterion.key}-${rule.signal}-${index}`}
                  className={rule.contribution === 0 ? "ranking-rule ranking-rule--muted" : "ranking-rule"}
                >
                  <span className="ranking-rule__label">{rule.label}</span>
                  <span className="ranking-rule__value">
                    {rule.aggregation === "perUnit" ? `${rule.units}×${rule.points}` : null}
                    <strong>{formatContribution(rule.contribution)}</strong>
                  </span>
                  {rule.evidence ? <span className="ranking-rule__evidence">{rule.evidence}</span> : null}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
