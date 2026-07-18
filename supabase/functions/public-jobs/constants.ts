export const RESUME_BUCKET = Deno.env.get("SUPABASE_STORAGE_BUCKET") ??
  "cv-originals";
export const MAX_RESUME_BYTES = 10 * 1024 * 1024;
export const ALLOWED_RESUME_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
]);
