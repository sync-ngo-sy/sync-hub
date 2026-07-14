// "Formal skill" detection for the consistency criterion.
//
// SCRUM-20 penalises listing a broad discipline or umbrella term as if it were a
// concrete skill (its examples: "Machine Learning", "Testing"). A formal skill
// is a concrete, nameable tool/technology/language; a non-formal "skill" is a
// discipline, buzzword, or soft skill. The list is intentionally conservative so
// real tools are never penalised.

export function normalizeSkillToken(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/[‐-―]/g, "-")
    .replace(/[^a-z0-9+#./ -]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Disciplines / umbrella areas / soft skills — listing these as a "skill" is what
// SCRUM flags as inconsistent.
export const NON_FORMAL_TERMS = new Set<string>(
  [
    "machine learning",
    "deep learning",
    "artificial intelligence",
    "ai",
    "data science",
    "data analysis",
    "data analytics",
    "analytics",
    "big data",
    "testing",
    "software testing",
    "manual testing",
    "automation",
    "test automation",
    "programming",
    "coding",
    "software development",
    "web development",
    "mobile development",
    "development",
    "computer science",
    "algorithms",
    "data structures",
    "object oriented programming",
    "oop",
    "design patterns",
    "debugging",
    "problem solving",
    "critical thinking",
    "communication",
    "teamwork",
    "team work",
    "leadership",
    "management",
    "project management",
    "time management",
    "collaboration",
    "creativity",
    "adaptability",
    "agile",
    "scrum",
    "devops",
    "cloud",
    "cloud computing",
    "cybersecurity",
    "security",
    "microservices",
    "databases",
    "frontend",
    "backend",
    "full stack",
    "fullstack",
    "ui/ux",
    "design",
    "research",
    "computer skills",
    "ms office",
    "microsoft office",
    "internet",
  ].map((term) => normalizeSkillToken(term)),
);

export function isNonFormalSkill(skill: string): boolean {
  return NON_FORMAL_TERMS.has(normalizeSkillToken(skill));
}
