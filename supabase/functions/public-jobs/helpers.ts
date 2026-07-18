import { corsHeaders } from "../_shared/cors.ts";
import { asRecord, asString } from "../_shared/utils.ts";
import { type JsonRecord } from "./types.ts";
import { ALLOWED_RESUME_TYPES } from "./constants.ts";

export function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

export function asStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => typeof item === "string" ? item.trim() : "").filter(
      Boolean,
    ).slice(0, 24)
    : [];
}

export function splitList(value: unknown) {
  if (Array.isArray(value)) {
    return asStringArray(value);
  }
  const text = asString(value);
  if (!text) {
    return [];
  }
  return text
    .split(/[,;\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 24);
}

export function skillSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9+#.]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
}

export function boundedYears(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return 0;
  }
  return Math.min(80, Math.round(numeric * 10) / 10);
}

export function isDeadlineOpen(value: unknown) {
  const deadline = asString(value);
  return !deadline || deadline >= new Date().toISOString().slice(0, 10);
}

export function publicJob(row: JsonRecord) {
  const locationInfo = asRecord(row.location_info);
  return {
    id: String(row.public_slug ?? ""),
    slug: String(row.public_slug ?? ""),
    title: String(row.public_title ?? row.title ?? ""),
    summary: String(row.public_summary ?? ""),
    description: String(row.public_description ?? ""),
    location: String(
      row.public_location ?? locationInfo.city ?? locationInfo.country ?? "",
    ),
    remotePolicy: String(
      locationInfo.remotePolicy ?? locationInfo.remote_policy ?? "Unspecified",
    ),
    seniorityLevel: String(row.seniority_level ?? ""),
    employmentType: String(row.employment_type ?? ""),
    requiredSkills: asStringArray(row.required_skills),
    preferredSkills: asStringArray(row.preferred_skills),
    keyResponsibilities: asStringArray(row.key_responsibilities),
    applicationDeadline: asString(row.application_deadline),
    applyEnabled: row.public_apply_enabled !== false &&
      isDeadlineOpen(row.application_deadline),
    publishedAt: asString(row.public_published_at),
  };
}

export function publicJobSelect() {
  return [
    "id",
    "title",
    "public_slug",
    "public_title",
    "public_summary",
    "public_description",
    "public_location",
    "public_apply_enabled",
    "public_published_at",
    "application_deadline",
    "seniority_level",
    "employment_type",
    "required_skills",
    "preferred_skills",
    "key_responsibilities",
    "location_info",
  ].join(", ");
}

export async function sha256Bytes(bytes: Uint8Array) {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const hash = await crypto.subtle.digest("SHA-256", copy.buffer);
  return Array.from(new Uint8Array(hash)).map((byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

export function safeFileName(value: string) {
  const normalized = value
    .trim()
    .replace(/[/\\]/g, "-")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return (normalized || "candidate-cv.pdf").slice(0, 160);
}

export function contentTypeForFile(
  fileName: string,
  contentType: string | null,
) {
  if (contentType && ALLOWED_RESUME_TYPES.has(contentType)) {
    return contentType;
  }
  const lowerName = fileName.toLowerCase();
  if (lowerName.endsWith(".pdf")) {
    return "application/pdf";
  }
  if (lowerName.endsWith(".docx")) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  if (lowerName.endsWith(".txt")) {
    return "text/plain";
  }
  return null;
}

export function decodeBase64(value: string) {
  const normalized = value.includes(",") ? value.split(",").pop() ?? "" : value;
  const binary = atob(normalized.replace(/\s/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}
