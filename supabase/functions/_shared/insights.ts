import { asStringArray } from "./utils.ts";

export type InsightsCandidateSearchCacheRow = {
  tenant_id: string;
  candidate_id: string;
  current_title: string | null;
  headline: string | null;
  location: string | null;
  years_experience: number | null;
  seniority: string | null;
  primary_role: string | null;
  role_tags: string[] | null;
  skills: string[] | null;
  created_at: string | null;
  updated_at: string | null;
};

export type InsightsDistributionItem = {
  label: string;
  value: number;
  percent?: number | null;
};

export type InsightsGapAnalysis = {
  targetRole: string | null;
  targetSkills: string[];
  fullyMatchingCandidates: number;
  partiallyMatchingCandidates: number;
  zeroMatchCandidates: number;
  missingSkills: Array<{ skill: string; missingFromPartialCandidates: number }>;
};

export const INSIGHTS_JOB_FAMILY_RULES = [
  {
    label: "Full-Stack Engineering",
    roleTags: ["full-stack"],
    titleSignals: ["full stack", "full-stack"],
    skillSignals: [
      "react",
      "angular",
      "vue",
      "node.js",
      "express",
      "django",
      "laravel",
      "postgresql",
      "mongodb",
      "sql",
      "apis",
    ],
  },
  {
    label: "Backend Engineering",
    roleTags: ["backend"],
    titleSignals: ["backend", "back-end", "api", "server", "platform"],
    skillSignals: [
      "node.js",
      "nestjs",
      "express",
      "java",
      "spring",
      "python",
      "django",
      "fastapi",
      "laravel",
      "php",
      "asp.net",
      ".net",
      "postgresql",
      "mysql",
      "mongodb",
      "redis",
      "graphql",
      "rest apis",
    ],
  },
  {
    label: "Frontend Engineering",
    roleTags: ["frontend"],
    titleSignals: ["frontend", "front-end", "ui engineer", "web developer"],
    skillSignals: [
      "react",
      "next.js",
      "angular",
      "vue",
      "javascript",
      "typescript",
      "html",
      "css",
      "tailwind",
      "bootstrap",
      "redux",
    ],
  },
  {
    label: "Mobile Engineering",
    roleTags: ["mobile"],
    titleSignals: ["mobile", "android", "ios", "flutter", "react native"],
    skillSignals: [
      "flutter",
      "dart",
      "android",
      "ios",
      "swift",
      "kotlin",
      "react native",
      "firebase",
    ],
  },
  {
    label: "AI & Machine Learning",
    roleTags: ["ml"],
    titleSignals: [
      "machine learning",
      "ml engineer",
      "ai engineer",
      "data scientist",
      "llm",
    ],
    skillSignals: [
      "machine learning",
      "deep learning",
      "tensorflow",
      "pytorch",
      "scikit",
      "keras",
      "opencv",
      "nlp",
      "llm",
      "computer vision",
    ],
  },
  {
    label: "Data & Analytics",
    roleTags: ["data"],
    titleSignals: [
      "data analyst",
      "data engineer",
      "business intelligence",
      "bi developer",
      "analytics",
    ],
    skillSignals: [
      "sql",
      "power bi",
      "tableau",
      "excel",
      "pandas",
      "numpy",
      "etl",
      "data analysis",
      "data visualization",
    ],
  },
  {
    label: "Cloud, DevOps & SRE",
    roleTags: ["devops"],
    titleSignals: [
      "devops",
      "sre",
      "site reliability",
      "cloud",
      "infrastructure",
    ],
    skillSignals: [
      "docker",
      "kubernetes",
      "terraform",
      "aws",
      "azure",
      "google cloud",
      "gcp",
      "ci/cd",
      "linux",
      "jenkins",
      "ansible",
      "helm",
    ],
  },
  {
    label: "Cybersecurity",
    roleTags: ["security"],
    titleSignals: ["security", "cyber", "soc", "penetration", "threat", "siem"],
    skillSignals: [
      "cybersecurity",
      "security",
      "soc operations",
      "siem",
      "penetration testing",
      "vulnerability",
      "threat detection",
      "incident response",
    ],
  },
  {
    label: "QA & Test Automation",
    roleTags: ["qa"],
    titleSignals: ["qa", "quality assurance", "test automation", "tester"],
    skillSignals: [
      "selenium",
      "playwright",
      "cypress",
      "jest",
      "testing",
      "test automation",
      "quality assurance",
    ],
  },
  {
    label: "Product & Design",
    roleTags: ["product", "design"],
    titleSignals: [
      "product designer",
      "ui/ux",
      "ux designer",
      "product manager",
    ],
    skillSignals: [
      "figma",
      "ui/ux",
      "wireframing",
      "prototyping",
      "user research",
      "product management",
    ],
  },
  {
    label: "Software Engineering",
    roleTags: ["generalist"],
    titleSignals: ["software", "developer", "engineer", "programmer"],
    skillSignals: [
      "git",
      "github",
      "apis",
      "javascript",
      "python",
      "java",
      "sql",
      "problem solving",
    ],
  },
];

export const INSIGHTS_SKILL_ALIAS_GROUPS = [
  {
    skill: "React Native",
    aliases: ["react native", "react-native", "reactnative", "rn"],
  },
  { skill: "React", aliases: ["react", "react.js", "reactjs"] },
  { skill: "Next.js", aliases: ["next.js", "nextjs", "next"] },
  { skill: "Node.js", aliases: ["node.js", "nodejs", "node js", "node"] },
  { skill: "TypeScript", aliases: ["typescript", "ts"] },
  { skill: "JavaScript", aliases: ["javascript", "js"] },
  { skill: "Kubernetes", aliases: ["kubernetes", "k8s"] },
  { skill: "Terraform", aliases: ["terraform"] },
  { skill: "Docker", aliases: ["docker"] },
  { skill: "AWS", aliases: ["aws", "amazon web services"] },
  { skill: "Azure", aliases: ["azure", "microsoft azure"] },
  {
    skill: "Google Cloud",
    aliases: ["google cloud", "gcp", "google cloud platform"],
  },
  {
    skill: "CI/CD",
    aliases: [
      "ci/cd",
      "cicd",
      "ci cd",
      "continuous integration",
      "continuous deployment",
    ],
  },
  { skill: "Python", aliases: ["python"] },
  { skill: "Java", aliases: ["java"] },
  { skill: "SQL", aliases: ["sql"] },
  { skill: "PostgreSQL", aliases: ["postgresql", "postgres", "postgre sql"] },
  { skill: "MySQL", aliases: ["mysql"] },
  { skill: "MongoDB", aliases: ["mongodb", "mongo db", "mongo"] },
  {
    skill: "REST APIs",
    aliases: ["rest api", "rest apis", "restful api", "restful apis"],
  },
  { skill: "APIs", aliases: ["api", "apis"] },
  { skill: "GraphQL", aliases: ["graphql", "graph ql"] },
  { skill: "HTML", aliases: ["html"] },
  { skill: "CSS", aliases: ["css"] },
  { skill: "Redux", aliases: ["redux", "redux toolkit"] },
  { skill: "Flutter", aliases: ["flutter"] },
  { skill: "Dart", aliases: ["dart"] },
  { skill: "Android", aliases: ["android"] },
  { skill: "iOS", aliases: ["ios", "i os"] },
  { skill: "Swift", aliases: ["swift"] },
  { skill: "Kotlin", aliases: ["kotlin"] },
  { skill: "Firebase", aliases: ["firebase"] },
  { skill: "Machine Learning", aliases: ["machine learning", "ml"] },
  { skill: "Power BI", aliases: ["power bi", "powerbi"] },
  { skill: "Tableau", aliases: ["tableau"] },
  { skill: "Excel", aliases: ["excel"] },
  { skill: "Pandas", aliases: ["pandas"] },
  { skill: "NumPy", aliases: ["numpy"] },
  { skill: "Cybersecurity", aliases: ["cybersecurity", "cyber security"] },
  { skill: "Git", aliases: ["git", "github", "git/github", "gitlab"] },
  { skill: "Problem Solving", aliases: ["problem solving", "problem-solving"] },
];

export function normalizeInsightsText(value: string) {
  return value
    .toLowerCase()
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[^a-z0-9+#./]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function incrementCount(map: Map<string, number>, key: string, amount = 1) {
  map.set(key, (map.get(key) ?? 0) + amount);
}

function distributionFromCounts(
  counts: Map<string, number>,
  total: number,
  limit?: number,
): InsightsDistributionItem[] {
  return Array.from(counts.entries())
    .map(([label, value]) => ({
      label,
      value,
      percent: total ? Number(((value / total) * 100).toFixed(1)) : 0,
    }))
    .sort(
      (left, right) =>
        right.value - left.value || left.label.localeCompare(right.label),
    )
    .slice(0, limit ?? counts.size);
}

export function inferInsightsJobFamily(row: InsightsCandidateSearchCacheRow) {
  const roleTags = asStringArray(row.role_tags).map((tag) => tag.toLowerCase());
  const roleText = [
    ...roleTags,
    row.primary_role ?? "",
    row.current_title ?? "",
    row.headline ?? "",
  ]
    .join(" ")
    .toLowerCase();
  const titleText = [row.current_title ?? "", row.headline ?? ""]
    .join(" ")
    .toLowerCase();
  const skillText = asStringArray(row.skills).join(" ").toLowerCase();
  let bestFamily = "Unclassified";
  let bestScore = 0;

  for (const rule of INSIGHTS_JOB_FAMILY_RULES) {
    let score = 0;
    if (
      rule.roleTags.some(
        (tag) => roleTags.includes(tag) || roleText.includes(tag),
      )
    ) {
      score += 90;
    }
    if (rule.titleSignals.some((signal) => titleText.includes(signal))) {
      score += 55;
    }
    score += Math.min(
      60,
      rule.skillSignals.filter((signal) => skillText.includes(signal)).length *
        12,
    );
    if (score > bestScore) {
      bestScore = score;
      bestFamily = rule.label;
    }
  }

  if (
    roleTags.includes("backend") &&
    roleTags.includes("frontend") &&
    bestScore < 120
  ) {
    return "Full-Stack Engineering";
  }
  return bestScore >= 40 ? bestFamily : "Unclassified";
}

function normalizeInsightsSeniority(value: string | null | undefined) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  return normalized || "unclassified";
}

function normalizePyramidSeniority(value: string | null | undefined) {
  const normalized = normalizeInsightsSeniority(value);
  if (
    normalized === "staff-plus" ||
    normalized === "principal" ||
    normalized === "manager"
  ) {
    return "lead";
  }
  if (
    normalized === "junior" ||
    normalized === "mid" ||
    normalized === "senior" ||
    normalized === "lead" ||
    normalized === "executive"
  ) {
    return normalized;
  }
  return "junior";
}

function buildInsightsSparkline(
  rows: InsightsCandidateSearchCacheRow[],
  now = new Date(),
) {
  const bucketCount = 6;
  const bucketMs = 5 * 24 * 60 * 60 * 1000;
  const startMs = now.getTime() - bucketCount * bucketMs;
  const buckets = Array.from({ length: bucketCount }, () => 0);
  for (const row of rows) {
    const createdMs = Date.parse(row.created_at ?? "");
    if (!Number.isFinite(createdMs) || createdMs < startMs) {
      continue;
    }
    const bucketIndex = Math.min(
      bucketCount - 1,
      Math.max(0, Math.floor((createdMs - startMs) / bucketMs)),
    );
    buckets[bucketIndex] += 1;
  }
  return buckets;
}

function buildSkillCatalog(rows: InsightsCandidateSearchCacheRow[]) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    for (const skill of asStringArray(row.skills)) {
      incrementCount(counts, skill.trim());
    }
  }
  return Array.from(counts.entries())
    .map(([skill, count]) => ({ skill, count }))
    .sort(
      (left, right) =>
        right.count - left.count || left.skill.localeCompare(right.skill),
    );
}

function aliasGroupForSkill(skill: string) {
  const key = normalizeInsightsText(skill);
  return INSIGHTS_SKILL_ALIAS_GROUPS.find((group) =>
    [group.skill, ...group.aliases].some(
      (alias) => normalizeInsightsText(alias) === key,
    )
  );
}

function resolveFallbackGapSkills(
  targetRole: string | null,
  explicitSkills: string[],
  skillCatalog: Array<{ skill: string; count: number }>,
) {
  const catalogByNorm = new Map(
    skillCatalog.map((item) => [normalizeInsightsText(item.skill), item.skill]),
  );
  const normalizedInput = normalizeInsightsText(targetRole ?? "");
  const segments = new Set(
    normalizedInput
      .replace(
        /\b(?:and|with|plus|including|using|requires?|need|needed|for|or)\b/g,
        ",",
      )
      .split(/[,;&|/]+/)
      .map((segment) => segment.trim())
      .filter(Boolean),
  );
  const resolved: string[] = [];
  const seen = new Set<string>();

  function addSkill(skill: string) {
    const group = aliasGroupForSkill(skill);
    const label =
      catalogByNorm.get(normalizeInsightsText(group?.skill ?? skill)) ??
        group?.skill ??
        skill.trim();
    const key = normalizeInsightsText(label);
    if (key && !seen.has(key)) {
      seen.add(key);
      resolved.push(label);
    }
  }

  const aliasCandidates = [
    ...INSIGHTS_SKILL_ALIAS_GROUPS.flatMap((group) =>
      [group.skill, ...group.aliases].map((alias) => ({
        skill: group.skill,
        alias,
      }))
    ),
    ...skillCatalog.map((item) => ({ skill: item.skill, alias: item.skill })),
  ].sort(
    (left, right) =>
      normalizeInsightsText(right.alias).length -
      normalizeInsightsText(left.alias).length,
  );

  for (const candidate of aliasCandidates) {
    const alias = normalizeInsightsText(candidate.alias);
    if (!alias) {
      continue;
    }
    const isReactInsideReactNative = alias === "react" &&
      normalizedInput.includes("react native") &&
      !segments.has("react");
    if (
      !isReactInsideReactNative &&
      normalizedInput &&
      ` ${normalizedInput} `.includes(` ${alias} `)
    ) {
      addSkill(candidate.skill);
    }
  }

  for (const skill of explicitSkills) {
    addSkill(skill);
  }

  if (!resolved.length && !targetRole && !explicitSkills.length) {
    return ["Kubernetes", "Terraform"];
  }
  return resolved.slice(0, 12);
}

function candidateHasFallbackSkill(
  candidateSkills: string[],
  targetSkill: string,
) {
  const group = aliasGroupForSkill(targetSkill);
  const aliases = group ? [group.skill, ...group.aliases] : [targetSkill];
  const candidateKeys = new Set<string>();
  for (const skill of candidateSkills) {
    const candidateGroup = aliasGroupForSkill(skill);
    for (
      const alias of candidateGroup
        ? [candidateGroup.skill, ...candidateGroup.aliases]
        : [skill]
    ) {
      candidateKeys.add(normalizeInsightsText(alias));
    }
  }
  return aliases.some((alias) =>
    candidateKeys.has(normalizeInsightsText(alias))
  );
}

export function buildFallbackGapAnalysis(
  rows: InsightsCandidateSearchCacheRow[],
  targetRole: string | null,
  explicitSkills: string[],
  skillCatalog = buildSkillCatalog(rows),
): InsightsGapAnalysis {
  const targetSkills = resolveFallbackGapSkills(
    targetRole,
    explicitSkills,
    skillCatalog,
  );
  let fullyMatchingCandidates = 0;
  let partiallyMatchingCandidates = 0;
  let zeroMatchCandidates = 0;
  const missingSkills = new Map<string, number>();

  for (const row of rows) {
    const skills = asStringArray(row.skills);
    if (!targetSkills.length) {
      continue;
    }
    const matchedSkills = targetSkills.filter((skill) =>
      candidateHasFallbackSkill(skills, skill)
    );
    if (matchedSkills.length === targetSkills.length) {
      fullyMatchingCandidates += 1;
    } else if (matchedSkills.length > 0) {
      partiallyMatchingCandidates += 1;
      for (const skill of targetSkills) {
        if (!candidateHasFallbackSkill(skills, skill)) {
          incrementCount(missingSkills, skill);
        }
      }
    } else {
      zeroMatchCandidates += 1;
    }
  }

  return {
    targetRole,
    targetSkills,
    fullyMatchingCandidates,
    partiallyMatchingCandidates,
    zeroMatchCandidates,
    missingSkills: Array.from(missingSkills.entries())
      .map(([skill, missingFromPartialCandidates]) => ({
        skill,
        missingFromPartialCandidates,
      }))
      .sort(
        (left, right) =>
          right.missingFromPartialCandidates -
            left.missingFromPartialCandidates ||
          left.skill.localeCompare(right.skill),
      ),
  };
}

function buildFallbackGapUseCases(
  skillCatalog: Array<{ skill: string; count: number }>,
) {
  const catalog = skillCatalog.map((item) => item.skill);
  const findSkill = (aliases: string[]) => {
    const keys = new Set(aliases.map(normalizeInsightsText));
    return catalog.find((skill) => keys.has(normalizeInsightsText(skill)));
  };
  const templates = [
    {
      id: "employer-brief",
      title: "Employer brief",
      detail: "Check whether the pool can satisfy a live role demand.",
      groups: [["React"], ["React Native"], ["TypeScript", "JavaScript"]],
    },
    {
      id: "training-cohort",
      title: "Training cohort",
      detail:
        "Find partial candidates that could convert with focused upskilling.",
      groups: [
        ["Kubernetes"],
        ["Terraform"],
        ["Docker"],
        ["AWS", "Azure", "Google Cloud"],
      ],
    },
    {
      id: "funding-evidence",
      title: "Funding evidence",
      detail: "Quantify scarce capabilities for program and grant narratives.",
      groups: [["SQL"], ["Power BI"], ["Tableau", "Excel"], ["Python"]],
    },
    {
      id: "delivery-risk",
      title: "Delivery risk",
      detail:
        "Spot backend/API supply depth before committing to delivery targets.",
      groups: [
        ["Node.js"],
        ["REST APIs", "APIs"],
        ["PostgreSQL", "SQL"],
        ["GraphQL"],
      ],
    },
  ];
  return templates
    .map((template) => {
      const skills = template.groups
        .map(findSkill)
        .filter((skill): skill is string => Boolean(skill));
      return {
        id: template.id,
        title: template.title,
        detail: template.detail,
        skills,
        query: skills.join(" and "),
      };
    })
    .filter((item) => item.skills.length >= 2);
}

export function buildFallbackInsightsDashboard(
  rows: InsightsCandidateSearchCacheRow[],
  topSkills: number,
  targetRole: string | null,
  targetSkills: string[],
) {
  const now = new Date();
  const currentWindowStart = now.getTime() - 30 * 24 * 60 * 60 * 1000;
  const previousWindowStart = now.getTime() - 60 * 24 * 60 * 60 * 1000;
  const total = rows.length;
  const added30 = rows.filter(
    (row) => Date.parse(row.created_at ?? "") >= currentWindowStart,
  ).length;
  const previousAdded30 = rows.filter((row) => {
    const createdMs = Date.parse(row.created_at ?? "");
    return createdMs >= previousWindowStart && createdMs < currentWindowStart;
  }).length;
  const seniorityCounts = new Map<string, number>();
  const locationCounts = new Map<string, number>();
  const jobFamilyCounts = new Map<string, number>();
  const pyramidCounts = new Map<
    string,
    {
      junior: number;
      mid: number;
      senior: number;
      lead: number;
      executive: number;
    }
  >();
  let classifiedCount = 0;
  let skillTotal = 0;

  for (const row of rows) {
    const skills = asStringArray(row.skills);
    const jobFamily = inferInsightsJobFamily(row);
    const seniority = normalizeInsightsSeniority(row.seniority);
    const location = String(row.location ?? "").trim() || "Unknown";
    incrementCount(seniorityCounts, seniority);
    incrementCount(locationCounts, location);
    incrementCount(jobFamilyCounts, jobFamily);
    if (jobFamily !== "Unclassified") {
      classifiedCount += 1;
    }
    skillTotal += skills.length;
    const pyramidSeniority = normalizePyramidSeniority(row.seniority);
    const pyramid = pyramidCounts.get(jobFamily) ?? {
      junior: 0,
      mid: 0,
      senior: 0,
      lead: 0,
      executive: 0,
    };
    pyramid[pyramidSeniority] += 1;
    pyramidCounts.set(jobFamily, pyramid);
  }

  const skillCatalog = buildSkillCatalog(rows);
  const deltaValue = added30 - previousAdded30;
  const trend = deltaValue > 0 ? "up" : deltaValue < 0 ? "down" : "flat";

  return {
    generatedAt: now.toISOString(),
    metrics: [
      {
        key: "total_cvs_indexed",
        label: "Total CVs Indexed",
        value: total,
        deltaValue,
        deltaPercent: previousAdded30
          ? Number(((deltaValue / previousAdded30) * 100).toFixed(1))
          : null,
        trend,
        sparkline: buildInsightsSparkline(rows, now),
      },
      {
        key: "cvs_added_30d",
        label: "CVs Added (Last 30 Days)",
        value: added30,
        deltaValue,
        deltaPercent: previousAdded30
          ? Number(((deltaValue / previousAdded30) * 100).toFixed(1))
          : null,
        trend,
        sparkline: buildInsightsSparkline(rows, now),
      },
      {
        key: "job_family_coverage",
        label: "Job Family Coverage",
        value: total ? Number(((classifiedCount / total) * 100).toFixed(1)) : 0,
        deltaValue: 0,
        deltaPercent: null,
        trend: "flat",
        sparkline: buildInsightsSparkline(rows, now),
      },
      {
        key: "avg_skills_per_profile",
        label: "Avg Skills per Profile",
        value: total ? Number((skillTotal / total).toFixed(1)) : 0,
        deltaValue: 0,
        deltaPercent: null,
        trend: "flat",
        sparkline: buildInsightsSparkline(rows, now),
      },
    ],
    profilesBySeniority: distributionFromCounts(seniorityCounts, total),
    profilesByLocation: distributionFromCounts(locationCounts, total, 12),
    jobFamilies: distributionFromCounts(jobFamilyCounts, total),
    skillsFrequency: skillCatalog.slice(0, topSkills),
    gapUseCases: buildFallbackGapUseCases(skillCatalog),
    seniorityPyramid: Array.from(pyramidCounts.entries())
      .map(([jobFamily, values]) => ({ jobFamily, ...values }))
      .sort((left, right) => {
        const leftTotal = left.junior + left.mid + left.senior + left.lead +
          left.executive;
        const rightTotal = right.junior +
          right.mid +
          right.senior +
          right.lead +
          right.executive;
        return (
          rightTotal - leftTotal ||
          left.jobFamily.localeCompare(right.jobFamily)
        );
      }),
    gapAnalysis: buildFallbackGapAnalysis(
      rows,
      targetRole,
      targetSkills,
      skillCatalog,
    ),
  };
}
