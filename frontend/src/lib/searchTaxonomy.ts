type TaxonomyEntry<T extends string> = {
  value: T;
  label?: string;
  aliases: readonly string[];
};

export const SEARCH_SENIORITY_TABLE = [
  {
    value: "staff-plus",
    label: "Staff+",
    aliases: ["staff", "staff+", "principal", "lead", "architect", "technical lead", "tech lead", "head of engineering", "head of"],
  },
  {
    value: "senior",
    label: "Senior",
    aliases: ["senior", "sr", "sr."],
  },
  {
    value: "mid",
    label: "Mid",
    aliases: ["mid", "mid-level", "mid level", "intermediate"],
  },
  {
    value: "junior",
    label: "Junior",
    aliases: ["junior", "jr", "jr.", "entry level", "entry-level", "intern", "graduate", "fresher", "trainee"],
  },
] as const satisfies readonly TaxonomyEntry<string>[];

export type SearchSeniorityValue = (typeof SEARCH_SENIORITY_TABLE)[number]["value"];

export const SEARCH_SKILL_TABLE = [
  { value: ".NET", aliases: [".net", "dotnet", "dot net"] },
  { value: "Angular", aliases: ["angular", "angularjs", "angular js"] },
  { value: "ASP.NET", aliases: ["asp.net", "asp net", "asp-net"] },
  { value: "ASP.NET Core", aliases: ["asp.net core", "asp net core", "asp-net-core"] },
  { value: "AWS", aliases: ["aws", "amazon web services"] },
  { value: "Azure", aliases: ["azure", "microsoft azure"] },
  { value: "C#", aliases: ["c#", "c sharp"] },
  { value: "C++", aliases: ["c++", "cpp"] },
  { value: "CSS", aliases: ["css", "css3"] },
  { value: "Dart", aliases: ["dart"] },
  { value: "Django", aliases: ["django"] },
  { value: "Docker", aliases: ["docker"] },
  { value: "Express", aliases: ["express", "expressjs", "express js"] },
  { value: "FastAPI", aliases: ["fastapi", "fast api"] },
  { value: "Firebase", aliases: ["firebase"] },
  { value: "Flask", aliases: ["flask"] },
  { value: "Flutter", aliases: ["flutter"] },
  { value: "Go", aliases: ["go", "golang"] },
  { value: "Google Cloud", aliases: ["google cloud", "gcp"] },
  { value: "GraphQL", aliases: ["graphql", "graph ql"] },
  { value: "HTML", aliases: ["html", "html5"] },
  { value: "Java", aliases: ["java"] },
  { value: "JavaScript", aliases: ["javascript", "js"] },
  { value: "Kafka", aliases: ["kafka"] },
  { value: "Kotlin", aliases: ["kotlin"] },
  { value: "Kubernetes", aliases: ["kubernetes", "k8s"] },
  { value: "Laravel", aliases: ["laravel"] },
  { value: "Linux", aliases: ["linux"] },
  { value: "MongoDB", aliases: ["mongodb", "mongo db"] },
  { value: "MySQL", aliases: ["mysql", "my sql"] },
  { value: "NestJS", aliases: ["nestjs", "nest js"] },
  { value: "Next.js", aliases: ["next.js", "nextjs", "next js"] },
  { value: "Node.js", aliases: ["node", "node.js", "nodejs", "node js", "node-js"] },
  { value: "NumPy", aliases: ["numpy", "num py"] },
  { value: "Pandas", aliases: ["pandas"] },
  { value: "PHP", aliases: ["php"] },
  { value: "PostgreSQL", aliases: ["postgres", "postgresql", "postgre sql"] },
  { value: "PyTorch", aliases: ["pytorch", "py torch"] },
  { value: "Python", aliases: ["python", "py"] },
  { value: "React", aliases: ["react", "reactjs", "react js"] },
  { value: "React Native", aliases: ["react native"] },
  { value: "Redis", aliases: ["redis"] },
  { value: "REST APIs", aliases: ["rest", "rest api", "rest apis", "restful api"] },
  { value: "Supabase", aliases: ["supabase"] },
  { value: "Swift", aliases: ["swift"] },
  { value: "Tailwind CSS", aliases: ["tailwind", "tailwindcss", "tailwind css"] },
  { value: "Terraform", aliases: ["terraform"] },
  { value: "TensorFlow", aliases: ["tensorflow", "tensor flow"] },
  { value: "TypeScript", aliases: ["typescript", "ts"] },
  { value: "Vue", aliases: ["vue", "vuejs", "vue js"] },
] as const satisfies readonly TaxonomyEntry<string>[];

function normalizeLookupToken(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9+#.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapePattern(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function dedupe(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function compileEntry<T extends string>(entry: TaxonomyEntry<T>) {
  const aliases = dedupe([entry.value, ...entry.aliases].map((alias) => normalizeLookupToken(alias)).filter(Boolean));
  return {
    ...entry,
    aliases,
    patterns: aliases.map((alias) => {
      const pattern = escapePattern(alias).replace(/\s+/g, "[-\\s]+");
      return new RegExp(`(^|[^a-z0-9+#.])${pattern}([^a-z0-9+#.]|$)`, "i");
    }),
  };
}

const COMPILED_SENIORITY = SEARCH_SENIORITY_TABLE.map(compileEntry);
const COMPILED_SKILLS = SEARCH_SKILL_TABLE
  .map(compileEntry)
  .sort((left, right) => Math.max(...right.aliases.map((alias) => alias.length)) - Math.max(...left.aliases.map((alias) => alias.length)));

const SENIORITY_ALIAS_MAP = new Map(COMPILED_SENIORITY.flatMap((entry) => entry.aliases.map((alias) => [alias, entry.value] as const)));
const SKILL_ALIAS_MAP = new Map(COMPILED_SKILLS.flatMap((entry) => entry.aliases.map((alias) => [alias, entry.value] as const)));

export function normalizeSeniorityValue(value: string | null | undefined): SearchSeniorityValue | undefined {
  const normalized = normalizeLookupToken(value ?? "");
  return normalized ? (SENIORITY_ALIAS_MAP.get(normalized) as SearchSeniorityValue | undefined) : undefined;
}

export function formatSeniorityValue(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  return COMPILED_SENIORITY.find((entry) => entry.value === value)?.label ?? value;
}

export function extractSeniorityFromText(query: string): SearchSeniorityValue | undefined {
  for (const entry of COMPILED_SENIORITY) {
    if (entry.patterns.some((pattern) => pattern.test(query))) {
      return entry.value;
    }
  }

  return undefined;
}

export function normalizeSkillValue(value: string | null | undefined) {
  const normalized = normalizeLookupToken(value ?? "");
  return normalized ? SKILL_ALIAS_MAP.get(normalized) ?? value?.trim() : undefined;
}

export function normalizeSkillList(values: Array<string | null | undefined>) {
  return dedupe(values.map((value) => normalizeSkillValue(value)).filter((value): value is string => Boolean(value)));
}

export function parseSkillInput(input: string) {
  return normalizeSkillList(input.split(/[,;\n]+/));
}

export function extractSkillsFromText(query: string) {
  const matches: string[] = [];

  for (const entry of COMPILED_SKILLS) {
    if (entry.patterns.some((pattern) => pattern.test(query))) {
      matches.push(entry.value);
    }
  }

  return dedupe(matches);
}
