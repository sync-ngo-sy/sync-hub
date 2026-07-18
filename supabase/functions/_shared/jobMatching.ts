import {
  asNumber,
  asRecord,
  asString,
  asStringArray,
  type JsonRecord,
} from "./utils.ts";
import {
  normalizeLocationValue,
  normalizeSeniorityValue,
  normalizeSkillList,
} from "./searchTaxonomy.ts";

export type JobExtractionPayload = {
  requiredSkills: Array<{ name: string; confidence: number; evidence: string }>;
  preferredSkills: Array<
    { name: string; confidence: number; evidence: string }
  >;
  seniorityLevel: { value: string; confidence: number; evidence: string };
  employmentType: { value: string; confidence: number; evidence: string };
  location: {
    country: string | null;
    city: string | null;
    region: string | null;
    remotePolicy: string;
    confidence: number;
  };
  keyResponsibilities: string[];
  warnings: Array<{ type: string; message: string }>;
};

export function normalizeStatus(value: unknown): string {
  const normalized = String(value ?? "draft").trim().toLowerCase();
  return normalized === "active" || normalized === "closed"
    ? normalized
    : "draft";
}

export function normalizePublicSlug(value: unknown): string | null {
  const raw = asString(value);
  if (!raw) return null;
  const slug = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || null;
}

export function normalizeRegion(value: unknown): string | null {
  const normalized = String(value ?? "").trim().toUpperCase();
  return normalized === "GCC" || normalized === "EU" || normalized === "USA"
    ? normalized
    : null;
}

export function normalizeEmploymentType(value: unknown): string {
  const normalized = String(value ?? "").trim();
  if (!normalized) return "";
  const compact = normalized.toLowerCase().replace(/[_\s]+/g, "-");
  const map: Record<string, string> = {
    fulltime: "Full-time",
    "full-time": "Full-time",
    parttime: "Part-time",
    "part-time": "Part-time",
    contract: "Contract",
    temporary: "Temporary",
    internship: "Internship",
    freelance: "Freelance",
    permanent: "Full-time",
  };
  return map[compact] ?? `${normalized[0].toUpperCase()}${normalized.slice(1)}`;
}

export function normalizeJobSeniority(value: unknown): string {
  const raw = asString(value);
  if (!raw) return "";
  const normalized = normalizeSeniorityValue(raw);
  if (normalized === "staff-plus") return "Lead";
  if (normalized === "senior") return "Senior";
  if (normalized === "mid") return "Mid";
  if (normalized === "junior") return /intern/i.test(raw) ? "Intern" : "Junior";
  return raw;
}

export function seniorityRank(value: unknown): number {
  const normalized = normalizeJobSeniority(value).toLowerCase();
  if (normalized.includes("executive")) return 7;
  if (normalized.includes("principal")) return 6;
  if (
    normalized.includes("lead") || normalized.includes("architect") ||
    normalized.includes("staff")
  ) return 5;
  if (normalized.includes("senior")) return 4;
  if (normalized.includes("mid") || normalized.includes("intermediate")) {
    return 3;
  }
  if (normalized.includes("junior")) return 2;
  if (normalized.includes("intern")) return 1;
  return 0;
}

export function seniorityAlignment(
  candidate: unknown,
  required: unknown,
): string {
  const candidateRank = seniorityRank(candidate);
  const requiredRank = seniorityRank(required);
  if (!candidateRank || !requiredRank) return "Partial Match";
  if (candidateRank === requiredRank) return "Exact Match";
  if (
    Math.abs(candidateRank - requiredRank) === 1 || candidateRank > requiredRank
  ) return "Partial Match";
  return "Mismatch";
}

export function normalizeSkillSet(value: unknown): string[] {
  return normalizeSkillList(asStringArray(value)).slice(0, 40);
}

function extractSkillsFromText(text: string): string[] {
  return normalizeSkillList(
    [
      ...text.matchAll(
        /\b(?:React|TypeScript|JavaScript|Node(?:\.js)?|Python|Java|C#|\.NET|Angular|Vue|Next(?:\.js)?|SQL|PostgreSQL|MySQL|MongoDB|AWS|Azure|Google Cloud|GCP|Docker|Kubernetes|Terraform|GraphQL|REST(?: APIs?)?|PHP|Laravel|Django|FastAPI|Flask|Flutter|React Native|Swift|Kotlin|Linux|Redis|Kafka|TensorFlow|PyTorch|Pandas|NumPy)\b/gi,
      ),
    ].map((match) => match[0]),
  );
}

export function heuristicJobExtraction(input: {
  title: string | null;
  jobDescription: string;
  employerRegion: string | null;
}): JobExtractionPayload {
  const text = input.jobDescription;
  const lower = text.toLowerCase();
  const allSkills = extractSkillsFromText(text);
  const preferred = allSkills.filter((skill) => {
    const index = lower.indexOf(skill.toLowerCase());
    const window = index >= 0
      ? lower.slice(Math.max(0, index - 80), index + 120)
      : "";
    return /preferred|nice to have|plus|bonus|advantage/.test(window);
  });
  const required = allSkills.filter((skill) => !preferred.includes(skill));
  const seniority = normalizeJobSeniority(input.title ?? text) ||
    (/\blead|architect|principal\b/i.test(text)
      ? "Lead"
      : /\bsenior|sr\b/i.test(text)
      ? "Senior"
      : /\bjunior|entry|graduate\b/i.test(text)
      ? "Junior"
      : "Mid");
  const employmentType = /contract|contractor/i.test(text)
    ? "Contract"
    : /part[-\s]?time/i.test(text)
    ? "Part-time"
    : /intern/i.test(text)
    ? "Internship"
    : /freelance/i.test(text)
    ? "Freelance"
    : "Full-time";
  const locationCountry =
    normalizeLocationValue(text, { allowFallback: false }) ??
      (input.employerRegion === "GCC"
        ? "United Arab Emirates"
        : input.employerRegion === "USA"
        ? "United States"
        : null);
  const remotePolicy = /remote/i.test(text)
    ? "Remote"
    : /hybrid/i.test(text)
    ? "Hybrid"
    : /onsite|on-site/i.test(text)
    ? "Onsite"
    : "Unspecified";
  const responsibilities = text
    .split(/\n|(?:^|\s)[*-]\s+/)
    .map((line) => line.trim().replace(/^[-*]\s*/, ""))
    .filter(
      (line) =>
        line.length >= 24 &&
        /\b(?:build|develop|design|lead|manage|deliver|collaborate|implement|maintain|support|create|drive)\b/i
          .test(line),
    )
    .slice(0, 6);

  return {
    requiredSkills: required.map((name) => ({
      name,
      confidence: 0.72,
      evidence: name,
    })),
    preferredSkills: preferred.map((name) => ({
      name,
      confidence: 0.66,
      evidence: name,
    })),
    seniorityLevel: {
      value: seniority,
      confidence: 0.64,
      evidence: input.title ?? "Job description seniority signals",
    },
    employmentType: {
      value: employmentType,
      confidence: 0.7,
      evidence: "Employment type inferred from job description",
    },
    location: {
      country: locationCountry,
      city: null,
      region: input.employerRegion,
      remotePolicy,
      confidence: locationCountry ? 0.62 : 0.38,
    },
    keyResponsibilities: responsibilities,
    warnings: required.length ? [] : [{
      type: "MISSING",
      message:
        "No explicit known technical skills were detected; review required skills manually.",
    }],
  };
}

export function extractionToJobFields(payload: JobExtractionPayload) {
  const requiredSkills = normalizeSkillList(
    payload.requiredSkills.map((skill) => skill.name),
  ).slice(0, 32);
  const preferredSkills = normalizeSkillList(
    payload.preferredSkills.map((skill) => skill.name),
  )
    .filter((skill) => !requiredSkills.includes(skill))
    .slice(0, 32);
  return {
    requiredSkills,
    preferredSkills,
    seniorityLevel: normalizeJobSeniority(payload.seniorityLevel.value),
    employmentType: normalizeEmploymentType(payload.employmentType.value),
    locationInfo: asRecord(payload.location),
    keyResponsibilities: payload.keyResponsibilities.map((item) => item.trim())
      .filter(Boolean).slice(0, 10),
    aiConfidence: {
      requiredSkills: payload.requiredSkills.map((skill) => ({
        name: skill.name,
        confidence: skill.confidence,
      })),
      preferredSkills: payload.preferredSkills.map((skill) => ({
        name: skill.name,
        confidence: skill.confidence,
      })),
      seniorityLevel: payload.seniorityLevel.confidence,
      employmentType: payload.employmentType.confidence,
      location: payload.location.confidence,
    },
  };
}

export function buildJobProfile(job: JsonRecord): string {
  const location = asRecord(job.location_info);
  const lines = [
    `Title: ${asString(job.title) ?? ""}`,
    `Required Skills: ${asStringArray(job.required_skills).join(", ")}`,
    `Preferred Skills: ${asStringArray(job.preferred_skills).join(", ")}`,
    `Seniority: ${asString(job.seniority_level) ?? ""}`,
    `Employment Type: ${asString(job.employment_type) ?? ""}`,
    `Location: ${
      asString(location.country) ?? asString(job.employer_country) ?? ""
    } ${asString(location.remotePolicy) ?? ""}`,
    `Responsibilities: ${asStringArray(job.key_responsibilities).join("; ")}`,
    `Description: ${asString(job.job_description) ?? ""}`,
  ];
  return lines.filter((line) => line.replace(/^[^:]+:\s*/, "").trim()).join(
    "\n",
  );
}

function textIncludesSkill(
  candidateSkills: string[],
  requiredSkill: string,
): boolean {
  const normalized = requiredSkill.toLowerCase();
  return candidateSkills.some((skill) => skill.toLowerCase() === normalized);
}

export function scoreCandidateForJob(candidate: JsonRecord, job: JsonRecord) {
  const requiredSkills = asStringArray(job.required_skills);
  const preferredSkills = asStringArray(job.preferred_skills);
  const matchedFilters = asRecord(candidate.matched_filters);
  const candidateSkills = normalizeSkillList([
    ...asStringArray(matchedFilters.matched_skills),
    ...asStringArray(asRecord(candidate.candidate_snapshot).top_skills),
  ]);

  const matchedSkills = requiredSkills.filter((skill) =>
    textIncludesSkill(candidateSkills, skill)
  );
  const missingSkills = requiredSkills.filter((skill) =>
    !textIncludesSkill(candidateSkills, skill)
  );

  const preferredCoverage =
    preferredSkills.filter((skill) => textIncludesSkill(candidateSkills, skill))
      .length / Math.max(1, preferredSkills.length);
  const requiredCoverage = matchedSkills.length /
    Math.max(1, requiredSkills.length);

  const semanticScore = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        (asNumber(candidate.match_rate) ?? asNumber(candidate.score) ?? 0) *
          (asNumber(candidate.match_rate) === null ? 100 : 1),
      ),
    ),
  );

  const alignment = seniorityAlignment(
    candidate.seniority,
    job.seniority_level,
  );
  const seniorityScore = alignment === "Exact Match"
    ? 100
    : alignment === "Partial Match"
    ? 74
    : 35;

  const experienceYears = asNumber(candidate.years_experience) ?? 0;
  const requiredYears = seniorityRank(job.seniority_level) >= 4
    ? 5
    : seniorityRank(job.seniority_level) >= 3
    ? 3
    : 1;
  const experienceScore = Math.min(
    100,
    Math.round((experienceYears / Math.max(1, requiredYears)) * 100),
  );

  const aiScore = Math.round(
    0.3 * requiredCoverage * 100 +
      0.25 * Math.min(100, experienceScore) +
      0.15 * seniorityScore +
      0.1 * semanticScore +
      0.1 * preferredCoverage * 100 +
      7,
  );

  const finalScore = Math.max(
    0,
    Math.min(100, Math.round(0.2 * semanticScore + 0.8 * aiScore)),
  );

  return {
    semanticScore,
    aiScore,
    finalScore,
    matchedSkills,
    missingSkills,
    seniorityAlignment: alignment,
    experienceSummary: `${String(candidate.name ?? "Candidate")} has ${
      experienceYears || "unspecified"
    } years of experience and is indexed as ${
      String(candidate.seniority ?? "unknown")
    } seniority.`,
    matchExplanation: matchedSkills.length
      ? `Matches ${matchedSkills.length} required skill${
        matchedSkills.length === 1 ? "" : "s"
      } for ${String(job.title ?? "this role")}; ${
        missingSkills.length
          ? `missing ${missingSkills.join(", ")}.`
          : "no required skill gaps detected."
      }`
      : `Semantic match found for ${
        String(job.title ?? "this role")
      }, but required skill coverage needs recruiter review.`,
    scoringBreakdown: {
      requiredSkillAlignment: Math.round(requiredCoverage * 30),
      relevantWorkExperience: Math.round(Math.min(25, experienceScore * 0.25)),
      seniorityFit: Math.round(seniorityScore * 0.15),
      domainRelevance: Math.round(semanticScore * 0.1),
      preferredSkillCoverage: Math.round(preferredCoverage * 10),
      employmentHistoryQuality: 7,
    },
  };
}

export const jobExtractionSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    requiredSkills: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          confidence: { type: "number" },
          evidence: { type: "string" },
        },
        required: ["name", "confidence", "evidence"],
      },
    },
    preferredSkills: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          confidence: { type: "number" },
          evidence: { type: "string" },
        },
        required: ["name", "confidence", "evidence"],
      },
    },
    seniorityLevel: {
      type: "object",
      additionalProperties: false,
      properties: {
        value: { type: "string" },
        confidence: { type: "number" },
        evidence: { type: "string" },
      },
      required: ["value", "confidence", "evidence"],
    },
    employmentType: {
      type: "object",
      additionalProperties: false,
      properties: {
        value: { type: "string" },
        confidence: { type: "number" },
        evidence: { type: "string" },
      },
      required: ["value", "confidence", "evidence"],
    },
    location: {
      type: "object",
      additionalProperties: false,
      properties: {
        country: { type: ["string", "null"] },
        city: { type: ["string", "null"] },
        region: { type: ["string", "null"] },
        remotePolicy: { type: "string" },
        confidence: { type: "number" },
      },
      required: ["country", "city", "region", "remotePolicy", "confidence"],
    },
    keyResponsibilities: { type: "array", items: { type: "string" } },
    warnings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          type: { type: "string" },
          message: { type: "string" },
        },
        required: ["type", "message"],
      },
    },
  },
  required: [
    "requiredSkills",
    "preferredSkills",
    "seniorityLevel",
    "employmentType",
    "location",
    "keyResponsibilities",
    "warnings",
  ],
};
