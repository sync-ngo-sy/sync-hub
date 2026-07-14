// Pure evaluator: applies a data-driven formula to a candidate's signals and
// returns the total plus a transparent per-criterion / per-rule breakdown.

import type {
  CandidateFacts,
  CriterionBreakdown,
  RankingCriterion,
  RankingFormula,
  RankingResult,
  RankingRule,
  RuleAggregation,
} from "./types.ts";
import { DEFAULT_RANKING_FORMULA, SIGNAL_KIND_BY_KEY } from "./defaults.ts";

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function evaluateFormula(
  facts: CandidateFacts,
  formula: RankingFormula,
): RankingResult {
  const criteria: CriterionBreakdown[] = formula.criteria.map((criterion) => {
    let score = criterion.base;
    const rules = criterion.rules.map((rule) => {
      const units = facts.signals[rule.signal] ?? 0;
      const contribution = rule.aggregation === "flag"
        ? (units > 0 ? rule.points : 0)
        : rule.points * units;
      score += contribution;
      return {
        label: rule.label,
        signal: rule.signal,
        aggregation: rule.aggregation,
        points: rule.points,
        units,
        contribution: round2(contribution),
        evidence: facts.evidence[rule.signal] ?? null,
      };
    });

    return {
      key: criterion.key,
      label: criterion.label,
      description: criterion.description,
      score: round2(clamp(score, criterion.floor, criterion.cap)),
      cap: criterion.cap,
      base: criterion.base,
      floor: criterion.floor,
      rules,
    } satisfies CriterionBreakdown;
  });

  const total = round2(
    criteria.reduce((sum, criterion) => sum + criterion.score, 0),
  );
  const maxTotal = criteria.reduce((sum, criterion) => sum + criterion.cap, 0);
  const percent = maxTotal > 0 ? Math.round((total / maxTotal) * 100) : 0;

  return { total, maxTotal, percent, criteria };
}

// Validate + sanitise an admin-supplied formula before persisting or scoring.
// Unknown signals are kept (so the catalog can grow) but coerced to safe shapes.
export function normalizeFormula(input: unknown): RankingFormula {
  const record = (input && typeof input === "object" && !Array.isArray(input))
    ? input as Record<string, unknown>
    : {};
  const rawCriteria = Array.isArray(record.criteria) ? record.criteria : [];

  const criteria: RankingCriterion[] = rawCriteria
    .map((value, index): RankingCriterion | null => {
      if (!value || typeof value !== "object") {
        return null;
      }
      const criterion = value as Record<string, unknown>;
      const cap = Number(criterion.cap);
      const base = Number(criterion.base);
      const floor = Number(criterion.floor);
      const rawRules = Array.isArray(criterion.rules) ? criterion.rules : [];
      const rules: RankingRule[] = rawRules
        .map((ruleValue, ruleIndex): RankingRule | null => {
          if (!ruleValue || typeof ruleValue !== "object") {
            return null;
          }
          const rule = ruleValue as Record<string, unknown>;
          const signal = typeof rule.signal === "string" ? rule.signal : "";
          if (!signal) {
            return null;
          }
          const aggregation: RuleAggregation = rule.aggregation === "perUnit"
            ? "perUnit"
            : rule.aggregation === "flag"
            ? "flag"
            : (SIGNAL_KIND_BY_KEY.get(signal) === "count" ? "perUnit" : "flag");
          const points = Number(rule.points);
          return {
            id: typeof rule.id === "string" && rule.id
              ? rule.id
              : `rule-${index}-${ruleIndex}`,
            label: typeof rule.label === "string" && rule.label
              ? rule.label
              : signal,
            signal,
            points: Number.isFinite(points) ? points : 0,
            aggregation,
          };
        })
        .filter((rule): rule is RankingRule => rule !== null);

      const key = typeof criterion.key === "string" && criterion.key
        ? criterion.key
        : `criterion-${index}`;
      return {
        key,
        label: typeof criterion.label === "string" && criterion.label
          ? criterion.label
          : key,
        description: typeof criterion.description === "string"
          ? criterion.description
          : undefined,
        base: Number.isFinite(base) ? base : 0,
        cap: Number.isFinite(cap) ? cap : 0,
        floor: Number.isFinite(floor) ? floor : 0,
        rules,
      };
    })
    .filter((criterion): criterion is RankingCriterion => criterion !== null);

  if (!criteria.length) {
    return DEFAULT_RANKING_FORMULA;
  }

  return {
    version: typeof record.version === "string" && record.version
      ? record.version
      : "custom-v1",
    criteria,
  };
}
