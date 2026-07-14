// The SCRUM-20 ranking rubric encoded as a data-driven, admin-editable formula,
// plus the catalog of signals an admin can reference when authoring rules.

import type { RankingFormula, SignalDefinition } from "./types.ts";

// Every signal the engine can compute for a candidate. The admin formula editor
// uses this list to populate the "signal" dropdown when building custom rules.
export const SIGNAL_CATALOG: SignalDefinition[] = [
  {
    key: "education_cs_bachelor",
    label: "Has Bachelor (major) in Computer Science",
    kind: "flag",
    description: "Candidate holds a CS/SE/IT bachelor's degree.",
  },
  {
    key: "education_cs_master",
    label: "Has Master in Computer Science",
    kind: "flag",
    description: "Candidate holds a CS master's (or PhD).",
  },
  {
    key: "education_noncs_master",
    label: "Has Master in a non-CS field",
    kind: "flag",
    description: "Candidate holds a master's (or PhD) outside CS.",
  },
  {
    key: "education_noncs_major_or_cs_associate",
    label: "Has non-CS bachelor or Associate in CS",
    kind: "flag",
    description: "Non-CS bachelor major, or an associate degree in CS.",
  },
  {
    key: "has_international_company",
    label: "Worked at ≥1 non-Syrian company",
    kind: "flag",
    description: "At least one work experience at a non-Syrian employer.",
  },
  {
    key: "international_company_count",
    label: "Number of non-Syrian companies",
    kind: "count",
    description: "Count of distinct non-Syrian employers.",
  },
  {
    key: "same_target_position",
    label: "Worked the same position applied for",
    kind: "flag",
    description: "Held at least one role in the target job family.",
  },
  {
    key: "extra_same_position_count",
    label: "Extra same-position roles",
    kind: "count",
    description: "Additional roles in the target job family beyond the first.",
  },
  {
    key: "neighbour_position_count",
    label: "Neighbouring-family roles",
    kind: "count",
    description: "Roles in a job family adjacent to the target.",
  },
  {
    key: "has_any_experience",
    label: "Has at least one work experience",
    kind: "flag",
    description: "Candidate lists one or more roles.",
  },
  {
    key: "extra_experience_count",
    label: "Extra roles mentioned",
    kind: "count",
    description: "Additional roles beyond the first.",
  },
  {
    key: "nonformal_skill_count",
    label: "Non-formal skill keywords",
    kind: "count",
    description: 'Skills that are disciplines/buzzwords (e.g. "Machine Learning").',
  },
  {
    key: "offfamily_skill_overflow_count",
    label: "Off-family skills (only when > 5)",
    kind: "count",
    description: "Skills unrelated to the target family, counted only past 5.",
  },
  {
    key: "target_family_skill_count",
    label: "Skills matching the target family",
    kind: "count",
    description:
      "Formal skills that belong to the target job family itself (neighbours excluded).",
  },
  {
    key: "years_experience_count",
    label: "Years of experience",
    kind: "count",
    description: "Total years of work experience (rounded).",
  },
  {
    key: "recognition_sync_volunteer",
    label: "Volunteered with SYNC",
    kind: "flag",
    description: "Evidence of volunteering with SYNC.",
  },
  {
    key: "recognition_university_top_rank",
    label: "High university rank / honours",
    kind: "flag",
    description: "Top of class, honours, valedictorian, dean's list, etc.",
  },
];

export const SIGNAL_KIND_BY_KEY = new Map(
  SIGNAL_CATALOG.map((signal) => [signal.key, signal.kind]),
);

// Strict scoring: every point must be EARNED. No criterion starts with free
// points, breadth alone earns little, and only evidence tied to the target
// family moves the big criteria. A candidate from another family should land
// well below 50%, a true specialist near the top.
export const DEFAULT_RANKING_FORMULA: RankingFormula = {
  version: "scrum-20-strict-v1",
  criteria: [
    {
      key: "education",
      label: "Education",
      description: "Degree level and Computer-Science alignment.",
      base: 0,
      cap: 5,
      floor: 0,
      rules: [
        {
          id: "edu-cs-bachelor",
          label: "Major in Computer Science",
          signal: "education_cs_bachelor",
          points: 3,
          aggregation: "flag",
        },
        {
          id: "edu-cs-master",
          label: "Master in Computer Science",
          signal: "education_cs_master",
          points: 2,
          aggregation: "flag",
        },
        {
          id: "edu-noncs-master",
          label: "Master in non-CS major",
          signal: "education_noncs_master",
          points: 1,
          aggregation: "flag",
        },
        {
          id: "edu-noncs-major-or-cs-associate",
          label: "Non-CS major or Associate degree in CS",
          signal: "education_noncs_major_or_cs_associate",
          points: 2,
          aggregation: "flag",
        },
      ],
    },
    {
      key: "international_experience",
      label: "Experience with international companies",
      description: "Exposure to non-Syrian employers.",
      base: 0,
      cap: 10,
      floor: 0,
      rules: [
        {
          id: "intl-has-one",
          label: "Worked at ≥1 non-Syrian company",
          signal: "has_international_company",
          points: 3,
          aggregation: "flag",
        },
        {
          id: "intl-per-company",
          label: "Per non-Syrian company",
          signal: "international_company_count",
          points: 2,
          aggregation: "perUnit",
        },
      ],
    },
    {
      key: "related_family_experience",
      label: "Experience with related job families",
      description: "Roles matching, or adjacent to, the position applied for.",
      base: 0,
      cap: 45,
      floor: 0,
      rules: [
        {
          id: "fam-same-position",
          label: "Worked the same position applied for",
          signal: "same_target_position",
          points: 20,
          aggregation: "flag",
        },
        {
          id: "fam-extra-same",
          label: "Per extra same role/position",
          signal: "extra_same_position_count",
          points: 10,
          aggregation: "perUnit",
        },
        {
          id: "fam-neighbour",
          label: "Per neighbouring position",
          signal: "neighbour_position_count",
          points: 3,
          aggregation: "perUnit",
        },
      ],
    },
    {
      key: "experience",
      label: "Experience",
      description: "Depth of work history — one point per year.",
      base: 0,
      cap: 10,
      floor: 0,
      rules: [
        {
          id: "exp-per-year",
          label: "Per year of experience",
          signal: "years_experience_count",
          points: 1,
          aggregation: "perUnit",
        },
      ],
    },
    {
      key: "consistency",
      label: "Consistency: skills match experience",
      description:
        "Earned, not granted: points only for formal skills that belong to the target family, minus buzzword/off-family penalties.",
      base: 0,
      cap: 30,
      floor: 0,
      rules: [
        {
          id: "cons-family-skill",
          label: "Per skill matching the target family",
          signal: "target_family_skill_count",
          points: 5,
          aggregation: "perUnit",
        },
        {
          id: "cons-nonformal",
          label: "Per non-formal skill keyword",
          signal: "nonformal_skill_count",
          points: -2,
          aggregation: "perUnit",
        },
        {
          id: "cons-offfamily",
          label: "Per off-family skill (when > 5)",
          signal: "offfamily_skill_overflow_count",
          points: -1,
          aggregation: "perUnit",
        },
      ],
    },
  ],
};
