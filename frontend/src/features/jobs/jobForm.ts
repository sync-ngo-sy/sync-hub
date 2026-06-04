import type { EmployerRegion, JobApplicationStatus, JobExtractionResult, JobPosting, JobPostingInput, JobPostingStatus } from "@/lib/contracts";

export const regionOptions: EmployerRegion[] = ["GCC", "EU", "USA"];
export const seniorityOptions = ["Intern", "Junior", "Mid", "Senior", "Lead", "Principal", "Executive"];
export const employmentTypeOptions = ["Full-time", "Part-time", "Contract", "Temporary", "Internship", "Freelance"];
export const applicationStatusOptions: JobApplicationStatus[] = ["new", "reviewing", "shortlisted", "rejected", "withdrawn"];

export type JobFormState = {
  id?: string;
  tenantId: string;
  title: string;
  employerName: string;
  employerCountry: string;
  employerRegion: EmployerRegion;
  jobDescription: string;
  requiredSkills: string;
  preferredSkills: string;
  seniorityLevel: string;
  employmentType: string;
  applicationDeadline: string;
  locationCountry: string;
  locationCity: string;
  remotePolicy: string;
  keyResponsibilities: string;
  status: JobPostingStatus;
  isPublic: boolean;
  publicSlug: string;
  publicTitle: string;
  publicSummary: string;
  publicDescription: string;
  publicLocation: string;
  publicApplyEnabled: boolean;
  aiProfile: Record<string, unknown>;
  aiConfidence: Record<string, unknown>;
};

export function splitList(value: string) {
  return value
    .split(/[,;\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function joinList(values: string[]) {
  return values.join(", ");
}

export function emptyJobForm(tenantId: string): JobFormState {
  return {
    tenantId,
    title: "",
    employerName: "",
    employerCountry: "",
    employerRegion: "GCC",
    jobDescription: "",
    requiredSkills: "",
    preferredSkills: "",
    seniorityLevel: "",
    employmentType: "",
    applicationDeadline: "",
    locationCountry: "",
    locationCity: "",
    remotePolicy: "Unspecified",
    keyResponsibilities: "",
    status: "draft",
    isPublic: false,
    publicSlug: "",
    publicTitle: "",
    publicSummary: "",
    publicDescription: "",
    publicLocation: "",
    publicApplyEnabled: true,
    aiProfile: {},
    aiConfidence: {},
  };
}

export function formFromJob(job: JobPosting): JobFormState {
  return {
    id: job.id,
    tenantId: job.tenantId,
    title: job.title,
    employerName: job.employerName,
    employerCountry: job.employerCountry,
    employerRegion: job.employerRegion,
    jobDescription: job.jobDescription,
    requiredSkills: joinList(job.requiredSkills),
    preferredSkills: joinList(job.preferredSkills),
    seniorityLevel: job.seniorityLevel,
    employmentType: job.employmentType,
    applicationDeadline: job.applicationDeadline ?? "",
    locationCountry: job.locationInfo.country ?? "",
    locationCity: job.locationInfo.city ?? "",
    remotePolicy: job.locationInfo.remotePolicy ?? "Unspecified",
    keyResponsibilities: job.keyResponsibilities.join("\n"),
    status: job.status,
    isPublic: job.isPublic,
    publicSlug: job.publicSlug ?? "",
    publicTitle: job.publicTitle ?? "",
    publicSummary: job.publicSummary ?? "",
    publicDescription: job.publicDescription ?? "",
    publicLocation: job.publicLocation ?? "",
    publicApplyEnabled: job.publicApplyEnabled,
    aiProfile: job.aiProfile,
    aiConfidence: job.aiConfidence,
  };
}

export function jobInputFromForm(form: JobFormState, status: JobPostingStatus): JobPostingInput {
  const requiredSkills = splitList(form.requiredSkills);
  const preferredSkills = splitList(form.preferredSkills).filter((skill) => !requiredSkills.includes(skill));
  return {
    id: form.id,
    tenantId: form.tenantId,
    title: form.title.trim(),
    employerName: form.employerName.trim(),
    employerCountry: form.employerCountry.trim(),
    employerRegion: form.employerRegion,
    jobDescription: form.jobDescription.trim(),
    requiredSkills,
    preferredSkills,
    seniorityLevel: form.seniorityLevel,
    employmentType: form.employmentType,
    applicationDeadline: form.applicationDeadline || null,
    status,
    locationInfo: {
      country: form.locationCountry || form.employerCountry || null,
      city: form.locationCity || null,
      region: form.employerRegion,
      remotePolicy: form.remotePolicy || "Unspecified",
    },
    keyResponsibilities: splitList(form.keyResponsibilities),
    isPublic: form.isPublic,
    publicSlug: form.publicSlug,
    publicTitle: form.publicTitle,
    publicSummary: form.publicSummary,
    publicDescription: form.publicDescription,
    publicLocation: form.publicLocation,
    publicApplyEnabled: form.publicApplyEnabled,
    aiProfile: form.aiProfile,
    aiConfidence: form.aiConfidence,
  };
}

export function applyExtraction(form: JobFormState, extraction: JobExtractionResult): JobFormState {
  return {
    ...form,
    requiredSkills: joinList(extraction.requiredSkills.map((skill) => skill.name)),
    preferredSkills: joinList(extraction.preferredSkills.map((skill) => skill.name)),
    seniorityLevel: extraction.seniorityLevel.value || form.seniorityLevel,
    employmentType: extraction.employmentType.value || form.employmentType,
    locationCountry: extraction.location.country ?? form.locationCountry,
    locationCity: extraction.location.city ?? form.locationCity,
    remotePolicy: extraction.location.remotePolicy ?? form.remotePolicy,
    keyResponsibilities: extraction.keyResponsibilities.join("\n"),
    aiProfile: extraction as unknown as Record<string, unknown>,
    aiConfidence: {
      seniorityLevel: extraction.seniorityLevel.confidence,
      employmentType: extraction.employmentType.confidence,
      location: extraction.location.confidence,
      requiredSkills: extraction.requiredSkills.map((skill) => ({ name: skill.name, confidence: skill.confidence })),
      preferredSkills: extraction.preferredSkills.map((skill) => ({ name: skill.name, confidence: skill.confidence })),
    },
  };
}

export function validateJobForm(form: JobFormState, status: JobPostingStatus) {
  const missing: string[] = [];
  if (!form.title.trim()) missing.push("title");
  if (!form.employerName.trim()) missing.push("employer name");
  if (!form.employerCountry.trim()) missing.push("employer country");
  if (!form.jobDescription.trim()) missing.push("job description");
  if (status === "active") {
    if (!splitList(form.requiredSkills).length) missing.push("required skills");
    if (!form.seniorityLevel.trim()) missing.push("seniority level");
    if (!form.employmentType.trim()) missing.push("employment type");
    if (form.isPublic) {
      if (!form.publicSlug.trim()) missing.push("public slug");
      if (!form.publicDescription.trim()) missing.push("redacted public description");
    }
  }
  return missing;
}
