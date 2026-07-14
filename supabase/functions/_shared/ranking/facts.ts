// Builds the structured, signal-level facts the ranking engine scores against.
// All heuristics live here so the engine itself stays a pure formula evaluator.

import type {
  CandidateFacts,
  CandidateSignals,
  ExperienceFact,
  RankingTarget,
} from "./types.ts";
import {
  buildEducationFacts,
  hasCsBachelor,
  hasCsMaster,
  hasNonCsMajorOrCsAssociate,
  hasNonCsMaster,
} from "./education.ts";
import {
  classifyFamily,
  familyRelatedSkills,
  type JobFamilyKey,
  neighbourFamilies,
} from "./families.ts";
import { classifyCompanyOrigin } from "./companyOrigin.ts";
import { isNonFormalSkill, normalizeSkillToken } from "./formalSkills.ts";

export type RankCandidateRow = {
  tenant_id: string;
  candidate_id: string;
  name: string | null;
  current_title: string | null;
  location: string | null;
  years_experience: number | null;
  seniority: string | null;
  primary_role: string | null;
  top_skills: string[] | null;
  profile_json: Record<string, unknown> | null;
  timeline_json: unknown;
  summary_short: string | null;
};

function asArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter(
      (item): item is Record<string, unknown> =>
        Boolean(item) && typeof item === "object" && !Array.isArray(item),
    )
    : [];
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function dedupeNormalized(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const key = value.toLowerCase().trim();
    if (key && !seen.has(key)) {
      seen.add(key);
      out.push(value.trim());
    }
  }
  return out;
}

const UNIVERSITY_RANK_PATTERN =
  /\b(valedictorian|top of (the )?(class|cohort|batch|year)|first in (the )?(class|cohort|batch|year)|ranked first|rank(ed)? ?1st|dean'?s list|with honou?rs|honou?rs degree|distinction|summa cum laude|magna cum laude|first class|top \d{1,2}%)\b/i;

export function buildCandidateFacts(
  row: RankCandidateRow,
  target: RankingTarget,
  syrianCompanyList: string[] = [],
): CandidateFacts {
  const profile = row.profile_json ?? {};
  const skills = dedupeNormalized([
    ...(Array.isArray(row.top_skills) ? row.top_skills.map(asString) : []),
    ...(Array.isArray(profile.skills)
      ? (profile.skills as unknown[]).map(asString)
      : []),
  ].filter(Boolean));

  const education = buildEducationFacts(asArray(profile.education));

  const candidateFamily = classifyFamily(row.current_title, skills);
  const targetFamily: JobFamilyKey =
    (target.jobFamily as JobFamilyKey | null) ??
      (target.positionTitle ? classifyFamily(target.positionTitle, []) : null) ??
      candidateFamily;

  // ----- Experience facts -----
  const experienceRows = asArray(row.timeline_json).length
    ? asArray(row.timeline_json)
    : asArray(profile.experience);

  const experience: ExperienceFact[] = experienceRows
    .map((entry) => {
      const company = asString(entry.company) || asString(entry.employer);
      const title = asString(entry.title) || asString(entry.role);
      if (!company && !title) {
        return null;
      }
      const location = asString(entry.location) || null;
      const description = asString(entry.description) || asString(entry.scope) ||
        null;
      const { origin, country } = classifyCompanyOrigin(
        company,
        location,
        description,
        syrianCompanyList,
      );
      return {
        company,
        title,
        family: classifyFamily(title, []),
        origin,
        country,
      } satisfies ExperienceFact;
    })
    .filter((entry): entry is ExperienceFact => entry !== null);

  // ----- Derived counts -----
  const nonSyrianCompanies = new Set(
    experience
      .filter((entry) => entry.origin === "non-syrian" && entry.company)
      .map((entry) => entry.company.toLowerCase()),
  );
  const unknownOriginCount =
    experience.filter((entry) => entry.origin === "unknown").length;

  const sameRoles = experience.filter((entry) => entry.family === targetFamily);
  const neighbours = new Set<string>(neighbourFamilies(targetFamily));
  const neighbourRoles = experience.filter((entry) =>
    neighbours.has(entry.family)
  );

  const relatedSkillSet = new Set<string>(familyRelatedSkills(targetFamily));
  for (const neighbour of neighbours) {
    for (const skill of familyRelatedSkills(neighbour)) {
      relatedSkillSet.add(skill);
    }
  }
  const nonFormalSkills = skills.filter((skill) => isNonFormalSkill(skill));
  const offFamilySkills = skills.filter(
    (skill) =>
      !isNonFormalSkill(skill) &&
      !relatedSkillSet.has(normalizeSkillToken(skill)),
  );
  const offFamilyOverflow = offFamilySkills.length > 5
    ? offFamilySkills.length
    : 0;

  // Formal skills that belong to the TARGET family itself (neighbours don't
  // count here — this is the strict "skills prove the profile" signal).
  const targetSkillSet = new Set<string>(familyRelatedSkills(targetFamily));
  const targetFamilySkills = skills.filter(
    (skill) =>
      !isNonFormalSkill(skill) &&
      targetSkillSet.has(normalizeSkillToken(skill)),
  );

  const yearsExperienceValue = typeof row.years_experience === "number"
    ? Math.max(0, row.years_experience)
    : 0;

  // ----- Recognitions -----
  const recognitionText = [
    asString(row.summary_short),
    asString(profile.summary),
    (asArray(profile.certifications).length
      ? ""
      : Array.isArray(profile.certifications)
      ? (profile.certifications as unknown[]).map(asString).join(" ")
      : ""),
    Array.isArray(profile.certifications)
      ? (profile.certifications as unknown[]).map(asString).join(" ")
      : "",
    experienceRows.map((entry) =>
      `${asString(entry.company) || asString(entry.employer)} ${
        asString(entry.title) || asString(entry.role)
      } ${asString(entry.description) || asString(entry.scope)}`
    ).join(" "),
    education.map((entry) => `${entry.institution} ${entry.field}`).join(" "),
  ].join(" \n ");

  const volunteeredWithSync = /volunteer/i.test(recognitionText) &&
    /\bsync\b/i.test(recognitionText);
  const universityTopRank = UNIVERSITY_RANK_PATTERN.test(recognitionText);

  const recognitions: string[] = [];
  if (volunteeredWithSync) {
    recognitions.push("Volunteered with SYNC");
  }
  if (universityTopRank) {
    recognitions.push("High university rank");
  }

  const signals: CandidateSignals = {
    education_cs_bachelor: hasCsBachelor(education) ? 1 : 0,
    education_cs_master: hasCsMaster(education) ? 1 : 0,
    education_noncs_master: hasNonCsMaster(education) ? 1 : 0,
    education_noncs_major_or_cs_associate: hasNonCsMajorOrCsAssociate(education)
      ? 1
      : 0,
    has_international_company: nonSyrianCompanies.size > 0 ? 1 : 0,
    international_company_count: nonSyrianCompanies.size,
    same_target_position: sameRoles.length > 0 ? 1 : 0,
    extra_same_position_count: Math.max(0, sameRoles.length - 1),
    neighbour_position_count: neighbourRoles.length,
    has_any_experience: experience.length > 0 ? 1 : 0,
    extra_experience_count: Math.max(0, experience.length - 1),
    nonformal_skill_count: nonFormalSkills.length,
    offfamily_skill_overflow_count: offFamilyOverflow,
    target_family_skill_count: targetFamilySkills.length,
    years_experience_count: Math.round(yearsExperienceValue),
    recognition_sync_volunteer: volunteeredWithSync ? 1 : 0,
    recognition_university_top_rank: universityTopRank ? 1 : 0,
  };

  const evidence: Record<string, string> = {
    education_cs_bachelor: education
      .filter((e) => e.level === "bachelor" && e.fieldCategory === "cs")
      .map((e) => `${e.degree} ${e.field}`.trim())
      .join("; ") || "No CS bachelor detected",
    education_cs_master: education
      .filter((e) =>
        (e.level === "master" || e.level === "phd") && e.fieldCategory === "cs"
      )
      .map((e) => `${e.degree} ${e.field}`.trim())
      .join("; ") || "No CS master detected",
    has_international_company: nonSyrianCompanies.size
      ? `Non-Syrian: ${Array.from(nonSyrianCompanies).join(", ")}`
      : unknownOriginCount
      ? `${unknownOriginCount} company origin(s) unknown`
      : "No non-Syrian companies detected",
    international_company_count: `${nonSyrianCompanies.size} non-Syrian, ${unknownOriginCount} unknown`,
    same_target_position: sameRoles.length
      ? `Matched: ${sameRoles.map((r) => r.title).filter(Boolean).join(", ")}`
      : "No role in the target family",
    extra_same_position_count: `${Math.max(0, sameRoles.length - 1)} extra target-family role(s)`,
    neighbour_position_count: neighbourRoles.length
      ? neighbourRoles.map((r) => r.title).filter(Boolean).join(", ")
      : "No neighbouring-family roles",
    has_any_experience: `${experience.length} role(s) on file`,
    extra_experience_count: `${Math.max(0, experience.length - 1)} extra role(s)`,
    nonformal_skill_count: nonFormalSkills.length
      ? nonFormalSkills.join(", ")
      : "All listed skills look concrete",
    offfamily_skill_overflow_count: offFamilyOverflow
      ? `${offFamilySkills.length} off-family skills: ${offFamilySkills.slice(0, 8).join(", ")}`
      : `${offFamilySkills.length} off-family skill(s) (≤ 5, no penalty)`,
    target_family_skill_count: targetFamilySkills.length
      ? `Target-family skills: ${targetFamilySkills.slice(0, 10).join(", ")}`
      : "No skills matching the target family",
    years_experience_count: `${yearsExperienceValue} year(s) of experience`,
  };

  return {
    candidateId: row.candidate_id,
    tenantId: row.tenant_id,
    name: asString(row.name) || "Unnamed candidate",
    currentTitle: row.current_title,
    location: row.location,
    yearsExperience: typeof row.years_experience === "number"
      ? row.years_experience
      : null,
    seniority: row.seniority,
    primaryRole: row.primary_role,
    jobFamily: candidateFamily,
    skills,
    education,
    experience,
    signals,
    recognitions,
    evidence,
  };
}
