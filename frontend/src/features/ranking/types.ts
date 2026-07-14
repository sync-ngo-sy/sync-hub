// Types mirroring the `rank` edge function payloads (SCRUM-20 Profiles Ranking).

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
  criteria: RankingCriterion[];
};

export type SignalDefinition = {
  key: string;
  label: string;
  kind: "flag" | "count";
  description: string;
};

export type FamilyOption = { key: string; label: string };

export type StoredRankingProfile = {
  id: string;
  name: string;
  description: string;
  status: string;
  version: string;
  formula: RankingFormula;
  syrianCompanies: string[];
  updatedAt: string | null;
};

export type FormulaGetResponse = {
  profiles: StoredRankingProfile[];
  active: StoredRankingProfile | null;
  usingDefault: boolean;
  default: RankingFormula;
  signals: SignalDefinition[];
  families: FamilyOption[];
};

export type TargetOptionsResponse = {
  families: FamilyOption[];
  jobs: Array<{ id: string; title: string; seniority: string | null }>;
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

export type RankedCandidate = {
  rank: number;
  relevant: boolean;
  candidateId: string;
  tenantId: string;
  name: string;
  currentTitle: string | null;
  location: string | null;
  yearsExperience: number | null;
  seniority: string | null;
  jobFamily: string;
  jobFamilyLabel: string;
  skills: string[];
  recognitions: string[];
  total: number;
  maxTotal: number;
  percent: number;
  breakdown: CriterionBreakdown[];
};

export type RankProfilesResponse = {
  items: RankedCandidate[];
  total: number;
  poolSize: number;
  limit: number;
  offset: number;
  target: {
    jobFamily: string | null;
    jobFamilyLabel: string | null;
    positionTitle: string | null;
    label: string;
  };
  formula: {
    version: string;
    usingDefault: boolean;
    maxTotal: number;
    criteria: Array<{ key: string; label: string; cap: number }>;
  };
};

export type RankTargetInput = {
  job_family?: string | null;
  position_title?: string | null;
  job_posting_id?: string | null;
};

export type RecomputeScoresResponse = {
  updated: number;
  poolSize: number;
  formulaVersion: string;
  usingDefault: boolean;
  computedAt: string;
  failures: string[];
};

export type RankFiltersInput = {
  query?: string;
  seniority?: string | null;
  job_family?: string | null;
  min_score?: number;
  relevant_only?: boolean;
};
