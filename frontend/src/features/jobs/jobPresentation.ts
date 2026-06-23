import type { JobPosting, JobPostingStatus } from "@/lib/contracts";

export function formatDate(value?: string | null) {
  if (!value) {
    return "Not set";
  }
  return new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function statusTone(status: JobPostingStatus) {
  if (status === "active") {
    return "success" as const;
  }
  if (status === "closed") {
    return "warning" as const;
  }
  return "neutral" as const;
}

export function ingestionTone(status: string | null | undefined) {
  if (status === "parsed") {
    return "success" as const;
  }
  if (status === "failed") {
    return "warning" as const;
  }
  return "neutral" as const;
}

export function publicJobHref(job: JobPosting) {
  return job.publicSlug ? `#/careers/${job.publicSlug}` : null;
}

export function locationLabel(job: JobPosting) {
  return [job.locationInfo.city, job.locationInfo.country || job.employerCountry].filter(Boolean).join(", ") || "Location not set";
}
