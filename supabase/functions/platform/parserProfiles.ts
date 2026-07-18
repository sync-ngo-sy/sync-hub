import { createAuthedClient } from "../_shared/client.ts";
import { asString, type JsonRecord } from "../_shared/utils.ts";

export const parserProfileSelect = [
  "id",
  "tenant_id",
  "name",
  "slug",
  "description",
  "status",
  "extraction_provider",
  "extraction_model",
  "parser_version",
  "model_version",
  "prompt_version",
  "chunk_version",
  "embedding_provider",
  "embedding_model",
  "embedding_version",
  "chunking_profile",
  "ocr_enabled",
  "allow_heuristic_fallback",
  "prompt_template",
  "notes",
  "last_evaluated_at",
  "avg_parse_percentage",
  "avg_confidence",
  "documents_evaluated",
  "created_at",
  "updated_at",
].join(", ");

export async function getParserProfiles(
  supabase: ReturnType<typeof createAuthedClient>,
  tenantIds: string[],
) {
  let query = supabase
    .from("parser_profiles")
    .select(parserProfileSelect)
    .order("status", { ascending: true })
    .order("updated_at", { ascending: false });

  if (tenantIds.length) {
    query = query.in("tenant_id", tenantIds);
  }

  const { data, error } = await query;
  if (error) {
    throw error;
  }
  return data ?? [];
}

export async function saveParserProfile(
  supabase: ReturnType<typeof createAuthedClient>,
  body: JsonRecord,
) {
  const profile = (body.profile ?? {}) as JsonRecord;
  const tenantId = asString(body.tenant_id);
  if (!tenantId) {
    throw new Error("tenant_id is required");
  }

  const payload = {
    tenant_id: tenantId,
    name: asString(profile.name) ?? "Parser profile",
    slug: (asString(profile.slug) ?? "parser-profile").toLowerCase(),
    description: asString(profile.description) ?? "",
    extraction_provider: asString(profile.extractionProvider) ?? "gemini",
    extraction_model: asString(profile.extractionModel) ?? "gemini-2.5-flash",
    parser_version: asString(profile.parserVersion) ?? "pdftotext-raw-v2",
    model_version: asString(profile.modelVersion) ?? "v1",
    prompt_version: asString(profile.promptVersion) ?? "v1",
    chunk_version: asString(profile.chunkVersion) ?? "v1",
    embedding_provider: asString(profile.embeddingProvider) ?? "gemini",
    embedding_model: asString(profile.embeddingModel) ?? "gemini-embedding-001",
    embedding_version: asString(profile.embeddingVersion) ??
      "gemini-embedding-001-768-v1",
    chunking_profile: asString(profile.chunkingProfile) ?? "default",
    ocr_enabled: Boolean(profile.ocrEnabled),
    allow_heuristic_fallback: false,
    prompt_template: asString(profile.promptTemplate) ?? "",
    notes: asString(profile.notes) ?? "",
  };

  const profileId = asString(profile.id);
  const mutation = profileId
    ? supabase
      .from("parser_profiles")
      .update(payload)
      .eq("id", profileId)
      .select(parserProfileSelect)
      .single()
    : supabase
      .from("parser_profiles")
      .insert(payload)
      .select(parserProfileSelect)
      .single();

  const { data, error } = await mutation;
  if (error) {
    throw error;
  }
  return data;
}

export async function publishParserProfile(
  supabase: ReturnType<typeof createAuthedClient>,
  profileId: string,
) {
  const { data, error } = await supabase.rpc("publish_parser_profile_v1", {
    p_profile_id: profileId,
  });
  if (error) {
    throw error;
  }
  return data;
}
