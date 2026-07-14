// Shared types for the SCRUM-20 profile ranking engine.
//
// The formula is fully data-driven so an admin can retune it without a redeploy:
// each criterion has a starting `base`, a `cap` (max points), a `floor`, and an
// ordered list of rules. Every rule references a named signal from the catalog
// (see facts.ts) and contributes points either once (a flag) or per unit (a
// count). The engine clamps each criterion to [floor, cap] and sums them.

export type RuleAggregation = "flag" | "perUnit";

export type RankingRule = {
  id: string;
  label: string;
  signal: string;
  points: number;
  aggregation: RuleAggregation;
};

export type RankingCriterion = {
  key: string;
  label: string;
  description?: string;
  base: number;
  cap: number;
  floor: number;
  rules: RankingRule[];
};

export type RankingFormula = {
  version: string;
  // Job family used to resolve "neighbour" positions and related skills when no
  // explicit target is selected. Usually left null; the request supplies one.
  criteria: RankingCriterion[];
};

// A computed signal value for a single candidate. Flags are 0/1, counts are >= 0.
export type CandidateSignals = Record<string, number>;

export type SignalKind = "flag" | "count";

export type SignalDefinition = {
  key: string;
  label: string;
  kind: SignalKind;
  description: string;
};

export type RankingTarget = {
  jobFamily: string | null;
  positionTitle: string | null;
};

export type EducationFact = {
  level: "phd" | "master" | "bachelor" | "associate" | "unknown";
  fieldCategory: "cs" | "non-cs" | "unknown";
  institution: string;
  degree: string;
  field: string;
};

export type ExperienceFact = {
  company: string;
  title: string;
  family: string;
  origin: "syrian" | "non-syrian" | "unknown";
  country: string | null;
};

export type CandidateFacts = {
  candidateId: string;
  tenantId: string;
  name: string;
  currentTitle: string | null;
  location: string | null;
  yearsExperience: number | null;
  seniority: string | null;
  primaryRole: string | null;
  jobFamily: string;
  skills: string[];
  education: EducationFact[];
  experience: ExperienceFact[];
  signals: CandidateSignals;
  recognitions: string[];
  // Human-readable evidence per signal, surfaced in the score breakdown.
  evidence: Record<string, string>;
};

export type RuleBreakdown = {
  label: string;
  signal: string;
  aggregation: RuleAggregation;
  points: number;
  units: number;
  contribution: number;
  evidence: string | null;
};

export type CriterionBreakdown = {
  key: string;
  label: string;
  description?: string;
  score: number;
  cap: number;
  base: number;
  floor: number;
  rules: RuleBreakdown[];
};

export type RankingResult = {
  total: number;
  maxTotal: number;
  percent: number;
  criteria: CriterionBreakdown[];
};
