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

export function trackedApplicationLinkHref(job: JobPosting, token: string) {
  return job.publicSlug ? `#/careers/${job.publicSlug}?ref=${encodeURIComponent(token)}` : null;
}

export function applicationSourceLabel(application: {
  source: string;
  metadata?: Record<string, unknown>;
}) {
  const attribution = asRecord(application.metadata?.sourceAttribution);
  const categoryName = typeof attribution.categoryName === "string" ? attribution.categoryName : "";
  const sourceDetail = typeof attribution.sourceDetail === "string" ? attribution.sourceDetail : "";
  if (categoryName && sourceDetail) {
    return `${categoryName} · ${sourceDetail}`;
  }
  if (categoryName) {
    return categoryName;
  }
  if (application.source && application.source !== "public_job_board") {
    return application.source;
  }
  return "Direct / untracked";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function locationLabel(job: JobPosting) {
  return [job.locationInfo.city, job.locationInfo.country || job.employerCountry].filter(Boolean).join(", ") || "Location not set";
}
