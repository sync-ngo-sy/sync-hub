// Degree-level and Computer-Science classification for the Education criterion.

import type { EducationFact } from "./types.ts";

function normalize(value: string | null | undefined): string {
  return (value ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

const CS_FIELD_KEYWORDS = [
  "computer science",
  "computer engineering",
  "software engineering",
  "software development",
  "information technology",
  "information systems",
  "informatics",
  "computing",
  "computer",
  "data science",
  "artificial intelligence",
  "cybersecurity",
  "cyber security",
  "telecommunication",
  "telecommunications",
  "it ",
  " cs",
];

export function classifyDegreeLevel(
  degree: string,
  field: string,
): EducationFact["level"] {
  const text = `${normalize(degree)} ${normalize(field)}`;
  if (/\b(ph\.?d|doctor|doctorate|dphil)\b/.test(text)) {
    return "phd";
  }
  if (
    /\b(master|m\.?sc|m\.?s|m\.?a|m\.?eng|mba|msc|postgraduate|post-graduate)\b/
      .test(text)
  ) {
    return "master";
  }
  if (
    /\b(bachelor|b\.?sc|b\.?s|b\.?a|b\.?eng|b\.?tech|bsc|undergraduate|licen[cs]e|license|diploma of higher)\b/
      .test(text)
  ) {
    return "bachelor";
  }
  if (/\b(associate|diploma|foundation|technician|two-year)\b/.test(text)) {
    return "associate";
  }
  return "unknown";
}

export function classifyDegreeField(
  degree: string,
  field: string,
): EducationFact["fieldCategory"] {
  const text = ` ${normalize(field)} ${normalize(degree)} `;
  for (const keyword of CS_FIELD_KEYWORDS) {
    if (text.includes(keyword)) {
      return "cs";
    }
  }
  // We saw a field but it does not look like CS.
  if (normalize(field)) {
    return "non-cs";
  }
  return "unknown";
}

export function buildEducationFacts(
  rawEducation: Array<Record<string, unknown>>,
): EducationFact[] {
  return rawEducation
    .map((entry) => {
      const degree = typeof entry.degree === "string" ? entry.degree : "";
      const field = typeof entry.field === "string" ? entry.field : "";
      const institution = typeof entry.institution === "string"
        ? entry.institution
        : "";
      if (!degree && !field && !institution) {
        return null;
      }
      return {
        level: classifyDegreeLevel(degree, field),
        fieldCategory: classifyDegreeField(degree, field),
        institution,
        degree,
        field,
      } satisfies EducationFact;
    })
    .filter((entry): entry is EducationFact => entry !== null);
}

// Convenience predicates over the parsed education facts (mirrors SCRUM rules).
export function hasCsBachelor(facts: EducationFact[]): boolean {
  return facts.some(
    (entry) => entry.level === "bachelor" && entry.fieldCategory === "cs",
  );
}

export function hasCsMaster(facts: EducationFact[]): boolean {
  return facts.some(
    (entry) =>
      (entry.level === "master" || entry.level === "phd") &&
      entry.fieldCategory === "cs",
  );
}

export function hasNonCsMaster(facts: EducationFact[]): boolean {
  return facts.some(
    (entry) =>
      (entry.level === "master" || entry.level === "phd") &&
      entry.fieldCategory === "non-cs",
  );
}

export function hasNonCsMajorOrCsAssociate(facts: EducationFact[]): boolean {
  return facts.some(
    (entry) =>
      (entry.level === "bachelor" && entry.fieldCategory === "non-cs") ||
      (entry.level === "associate" && entry.fieldCategory === "cs"),
  );
}
