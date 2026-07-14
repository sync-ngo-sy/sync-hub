// Job families exactly as defined in SCRUM-20, plus a neighbour graph used by
// the "experience with related job families" criterion (+5 per neighbour role).

export type JobFamilyKey =
  | "software-engineering"
  | "cloud-devops"
  | "ai-data"
  | "qa-automation"
  | "product-design"
  | "cybersecurity"
  | "tech-support"
  | "other";

export type JobFamilyDefinition = {
  key: JobFamilyKey;
  label: string;
  titleSignals: string[];
  skillSignals: string[];
  neighbours: JobFamilyKey[];
};

export const JOB_FAMILIES: JobFamilyDefinition[] = [
  {
    key: "software-engineering",
    label: "Software Engineering",
    titleSignals: [
      "software",
      "software engineer",
      "software developer",
      "developer",
      "programmer",
      "frontend",
      "front end",
      "front-end",
      "backend",
      "back end",
      "back-end",
      "full stack",
      "full-stack",
      "fullstack",
      "mobile",
      "android",
      "ios",
      "web developer",
    ],
    skillSignals: [
      "javascript",
      "typescript",
      "react",
      "angular",
      "vue",
      "next.js",
      "node.js",
      "java",
      "python",
      "c#",
      ".net",
      "php",
      "laravel",
      "django",
      "spring",
      "flutter",
      "kotlin",
      "swift",
      "html",
      "css",
      "rest apis",
      "graphql",
    ],
    neighbours: ["cloud-devops", "ai-data", "qa-automation"],
  },
  {
    key: "cloud-devops",
    label: "Cloud & DevOps",
    titleSignals: [
      "devops",
      "sre",
      "site reliability",
      "cloud",
      "platform engineer",
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
      "jenkins",
      "ansible",
      "helm",
      "linux",
    ],
    neighbours: ["software-engineering", "cybersecurity"],
  },
  {
    key: "ai-data",
    label: "AI & Data",
    titleSignals: [
      "data analyst",
      "data scientist",
      "data engineer",
      "ml engineer",
      "machine learning",
      "ai engineer",
      "prompt engineer",
      "analytics",
      "business intelligence",
    ],
    skillSignals: [
      "machine learning",
      "deep learning",
      "tensorflow",
      "pytorch",
      "scikit",
      "pandas",
      "numpy",
      "sql",
      "power bi",
      "tableau",
      "nlp",
      "llm",
    ],
    neighbours: ["software-engineering"],
  },
  {
    key: "qa-automation",
    label: "QA & Automation",
    titleSignals: [
      "qa",
      "quality assurance",
      "test engineer",
      "automation",
      "tester",
      "sdet",
    ],
    skillSignals: [
      "selenium",
      "playwright",
      "cypress",
      "jest",
      "test automation",
      "junit",
      "postman",
      "appium",
    ],
    neighbours: ["software-engineering"],
  },
  {
    key: "product-design",
    label: "Product & Design",
    titleSignals: [
      "product manager",
      "product owner",
      "ux",
      "ui designer",
      "ux/ui",
      "designer",
      "business analyst",
    ],
    skillSignals: [
      "figma",
      "sketch",
      "wireframing",
      "prototyping",
      "user research",
      "product management",
      "jira",
      "roadmap",
    ],
    neighbours: ["software-engineering"],
  },
  {
    key: "cybersecurity",
    label: "Cybersecurity",
    titleSignals: [
      "security",
      "cyber",
      "soc analyst",
      "grc",
      "penetration",
      "threat",
    ],
    skillSignals: [
      "siem",
      "penetration testing",
      "vulnerability",
      "threat detection",
      "incident response",
      "soc operations",
      "firewall",
    ],
    neighbours: ["cloud-devops"],
  },
  {
    key: "tech-support",
    label: "Tech Support",
    titleSignals: [
      "support",
      "customer support",
      "help desk",
      "service desk",
      "consultant",
      "technical support",
    ],
    skillSignals: ["troubleshooting", "ticketing", "zendesk", "itil", "crm"],
    neighbours: ["software-engineering"],
  },
  {
    key: "other",
    label: "Other",
    titleSignals: [],
    skillSignals: [],
    neighbours: [],
  },
];

export const JOB_FAMILY_BY_KEY = new Map<JobFamilyKey, JobFamilyDefinition>(
  JOB_FAMILIES.map((family) => [family.key, family]),
);

export function jobFamilyLabel(key: string): string {
  return JOB_FAMILY_BY_KEY.get(key as JobFamilyKey)?.label ?? "Other";
}

function normalize(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/[‐-―]/g, "-")
    .replace(/[^a-z0-9+#./ -]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Classify a single role into a job family from its title (+ optional skills).
// Returns "other" when nothing scores above the confidence floor.
export function classifyFamily(
  title: string | null | undefined,
  skills: string[] = [],
): JobFamilyKey {
  const titleText = ` ${normalize(title)} `;
  const skillText = ` ${normalize(skills.join(" "))} `;
  let best: JobFamilyKey = "other";
  let bestScore = 0;

  for (const family of JOB_FAMILIES) {
    if (family.key === "other") {
      continue;
    }
    let score = 0;
    for (const signal of family.titleSignals) {
      if (titleText.includes(` ${signal} `)) {
        score += 40;
      }
    }
    for (const signal of family.skillSignals) {
      if (skillText.includes(` ${signal} `)) {
        score += 8;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      best = family.key;
    }
  }

  return bestScore >= 8 ? best : "other";
}

export function neighbourFamilies(key: string): JobFamilyKey[] {
  return JOB_FAMILY_BY_KEY.get(key as JobFamilyKey)?.neighbours ?? [];
}

// Skills considered "related" to a family — used by the consistency criterion.
export function familyRelatedSkills(key: string): Set<string> {
  const family = JOB_FAMILY_BY_KEY.get(key as JobFamilyKey);
  return new Set((family?.skillSignals ?? []).map((skill) => normalize(skill)));
}

export function normalizeFamilyToken(value: string | null | undefined): string {
  return normalize(value);
}
