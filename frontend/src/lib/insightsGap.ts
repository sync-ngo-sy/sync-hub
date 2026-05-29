export type GapRequirementInput = {
  targetRole?: string | null;
  targetSkills?: string[];
};

type SkillAliasGroup = {
  skill: string;
  aliases: string[];
};

const SKILL_ALIAS_GROUPS: SkillAliasGroup[] = [
  { skill: "React Native", aliases: ["react native", "react-native", "reactnative", "rn"] },
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
  { skill: "Google Cloud", aliases: ["google cloud", "gcp", "google cloud platform"] },
  { skill: "CI/CD", aliases: ["ci/cd", "cicd", "ci cd", "continuous integration", "continuous deployment"] },
  { skill: "Python", aliases: ["python"] },
  { skill: "Java", aliases: ["java"] },
  { skill: "SQL", aliases: ["sql"] },
  { skill: "PostgreSQL", aliases: ["postgresql", "postgres", "postgre sql"] },
  { skill: "MySQL", aliases: ["mysql"] },
  { skill: "MongoDB", aliases: ["mongodb", "mongo db", "mongo"] },
  { skill: "REST APIs", aliases: ["rest api", "rest apis", "restful api", "restful apis"] },
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

const CONNECTOR_PATTERN = /\b(?:and|with|plus|including|using|requires?|requirement|needed|need|for|or)\b/g;
const DEFAULT_GAP_REQUIREMENTS = ["Kubernetes", "Terraform"];

function normalizeGapText(value: string) {
  return value
    .toLowerCase()
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[^a-z0-9+#./]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsPhrase(normalizedText: string, normalizedPhrase: string) {
  if (!normalizedPhrase) {
    return false;
  }
  return new RegExp(`(^|\\s)${escapeRegExp(normalizedPhrase)}(?=\\s|$)`).test(normalizedText);
}

function splitRequirementSegments(value: string) {
  return normalizeGapText(value)
    .replace(CONNECTOR_PATTERN, ",")
    .split(/[,;&|/]+/)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function canonicalSkillKey(value: string) {
  return normalizeGapText(value).replace(/\s+/g, " ");
}

function mergeSkillCatalog(corpusSkills: string[] = []) {
  const catalog = new Map<string, SkillAliasGroup>();

  for (const group of SKILL_ALIAS_GROUPS) {
    catalog.set(canonicalSkillKey(group.skill), {
      skill: group.skill,
      aliases: Array.from(new Set([group.skill, ...group.aliases])),
    });
  }

  for (const skill of corpusSkills) {
    const cleaned = skill.trim();
    if (!cleaned) {
      continue;
    }
    const key = canonicalSkillKey(cleaned);
    const existing = catalog.get(key);
    if (existing) {
      existing.aliases = Array.from(new Set([cleaned, ...existing.aliases]));
    } else {
      catalog.set(key, { skill: cleaned, aliases: [cleaned] });
    }
  }

  return Array.from(catalog.values()).sort((left, right) => {
    const leftLength = Math.max(...left.aliases.map((alias) => normalizeGapText(alias).length));
    const rightLength = Math.max(...right.aliases.map((alias) => normalizeGapText(alias).length));
    return rightLength - leftLength || left.skill.localeCompare(right.skill);
  });
}

function findAliasGroup(skill: string, corpusSkills: string[] = []) {
  const targetKey = canonicalSkillKey(skill);
  return mergeSkillCatalog(corpusSkills).find((group) => {
    const keys = [group.skill, ...group.aliases].map(canonicalSkillKey);
    return keys.includes(targetKey);
  });
}

function canonicalizeGapSkillLabel(skill: string, corpusSkills: string[] = []) {
  const cleaned = skill.trim();
  if (!cleaned) {
    return "";
  }
  return findAliasGroup(cleaned, corpusSkills)?.skill ?? cleaned;
}

function shouldMatchAlias(alias: string, normalizedInput: string, segments: string[]) {
  const normalizedAlias = normalizeGapText(alias);
  if (!normalizedAlias) {
    return false;
  }
  const isCompound = /[\s./+#]/.test(normalizedAlias);
  if (isCompound) {
    return containsPhrase(normalizedInput, normalizedAlias);
  }

  if (segments.some((segment) => segment === normalizedAlias)) {
    return true;
  }

  if (normalizedAlias === "react" && containsPhrase(normalizedInput, "react native")) {
    return false;
  }

  return containsPhrase(normalizedInput, normalizedAlias);
}

export function extractGapSkillRequirements(value: string, corpusSkills: string[] = []) {
  const normalizedInput = normalizeGapText(value);
  const segments = splitRequirementSegments(value);
  const requirements: string[] = [];
  const seen = new Set<string>();

  for (const group of mergeSkillCatalog(corpusSkills)) {
    if (!group.aliases.some((alias) => shouldMatchAlias(alias, normalizedInput, segments))) {
      continue;
    }
    const key = canonicalSkillKey(group.skill);
    if (!seen.has(key)) {
      seen.add(key);
      requirements.push(group.skill);
    }
  }

  return requirements.slice(0, 12);
}

export function resolveGapRequirements(input: GapRequirementInput, corpusSkills: string[] = []) {
  const explicitSkills = input.targetSkills?.map((skill) => canonicalizeGapSkillLabel(skill, corpusSkills)).filter(Boolean) ?? [];
  const textSkills = input.targetRole ? extractGapSkillRequirements(input.targetRole, corpusSkills) : [];
  const merged: string[] = [];
  const seen = new Set<string>();

  for (const skill of [...textSkills, ...explicitSkills]) {
    const key = canonicalSkillKey(skill);
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(skill.trim());
    }
  }

  if (!merged.length && !input.targetRole) {
    return DEFAULT_GAP_REQUIREMENTS;
  }

  return merged;
}

export function candidateHasGapSkill(candidateSkills: string[], targetSkill: string) {
  const candidateKeys = new Set<string>();

  for (const skill of candidateSkills) {
    const group = findAliasGroup(skill, [skill]);
    for (const alias of group ? [group.skill, ...group.aliases] : [skill]) {
      candidateKeys.add(canonicalSkillKey(alias));
    }
  }

  const targetGroup = findAliasGroup(targetSkill, [targetSkill]);
  const aliases = targetGroup?.aliases ?? [targetSkill];
  return aliases.some((alias) => candidateKeys.has(canonicalSkillKey(alias)));
}
