import { createAuthedClient } from "../_shared/client.ts";
import {
  createGcsSignedUrl,
  type OriginalDocumentRow,
  resolveGcsLocation,
} from "../_shared/gcs.ts";
import {
  asInteger,
  asRecord,
  asString,
  isBrowserOpenableSource,
  type JsonRecord,
} from "../_shared/utils.ts";
import { getCurrentUserId } from "../_shared/auth.ts";

export async function getCandidateDetail(
  supabase: ReturnType<typeof createAuthedClient>,
  candidateId: string,
) {
  const [dossier, chunks] = await Promise.all([
    supabase
      .from("candidate_dossier_v1")
      .select(
        "profile_json, timeline_json, skill_matrix_json, profile_attributes, raw_text, confidence, missing_fields, parse_warnings",
      )
      .eq("candidate_id", candidateId)
      .maybeSingle(),
    supabase
      .from("candidate_chunks")
      .select("id, chunk_type, text")
      .eq("candidate_id", candidateId)
      .eq("is_active", true)
      .order("chunk_index", { ascending: true })
      .limit(6),
  ]);
  const candidateProfileResult = await supabase
    .from("candidate_profiles")
    .select(
      `
    profile_json,
    timeline_json,
    skill_matrix_json,
    raw_text,
    confidence,
    missing_fields,
    parse_warnings,
    status,
    job_readiness_level,
    preferred_work_mode,
    years_of_experience,
    primary_skills,
    notice_period,
    english_proficiency,
    expected_salary,
    is_pre_screened,
    sync_affiliation,
    internal_vetting_notes,
    current_location_city,
    willingness_to_relocate,
    external_profiles,
    ai_profile_summary,
    employment_type_preference,
    last_interaction_date
    `,
    )
    .eq("candidate_id", candidateId)
    .maybeSingle();

  if (candidateProfileResult.error) {
    throw candidateProfileResult.error;
  }

  const profile = candidateProfileResult.data;
  if (dossier.error) {
    throw dossier.error;
  }
  if (!dossier.data) {
    throw new Error(`Candidate ${candidateId} was not found.`);
  }
  if (chunks.error) {
    throw chunks.error;
  }

  const dossierRow = asRecord(dossier.data);
  const sourceDocumentId = asString(dossierRow.source_document_id);
  const tenantId = asString(dossierRow.tenant_id);
  let manatalCandidateId: string | null = null;
  if (sourceDocumentId) {
    let syncQuery = supabase
      .from("manatal_candidate_sync")
      .select("manatal_candidate_id")
      .eq("source_document_id", sourceDocumentId)
      .limit(1);
    if (tenantId) {
      syncQuery = syncQuery.eq("tenant_id", tenantId);
    }
    const syncResult = await syncQuery;
    if (!syncResult.error) {
      manatalCandidateId = asString(
        (syncResult.data ?? [])[0]?.manatal_candidate_id,
      );
    }
  }

  return {
    candidate: dossier.data,
    chunks: chunks.data ?? [],
    profile: profile ?? null,
    profileAttributes: profile?.profile_attributes ?? null,
    manatalCandidateId,
  };
}

export async function getParsingOverview(
  supabase: ReturnType<typeof createAuthedClient>,
  tenantIds: string[],
  body: JsonRecord,
) {
  const limit = asInteger(body.limit, 100, 0, 500);
  const offset = asInteger(body.offset, 0, 0, 100000);
  const needsReviewOnly = body.needs_review_only === true;
  const query = asString(body.query);
  const { data, error } = await supabase.rpc("parsing_overview_page_v1", {
    p_tenant_ids: tenantIds.length ? tenantIds : null,
    p_limit: limit,
    p_offset: offset,
    p_needs_review_only: needsReviewOnly,
    p_query: query,
  });
  if (error) {
    throw error;
  }
  return data;
}

export async function getCandidatesList(
  supabase: ReturnType<typeof createAuthedClient>,
  tenantIds: string[],
  body: JsonRecord,
) {
  const limit = asInteger(body.limit, 50, 1, 200);
  const offset = asInteger(body.offset, 0, 0, 100000);
  const updatedFrom = asString(body.updated_from);
  const updatedTo = asString(body.updated_to);
  const { data, error } = await supabase.rpc("candidates_list_page_v1", {
    p_tenant_ids: tenantIds.length ? tenantIds : null,
    p_limit: limit,
    p_offset: offset,
    p_query: asString(body.query),
    p_status: asString(body.status),
    p_role: asString(body.role),
    p_source: asString(body.source),
    p_location: asString(body.location),
    p_updated_from: updatedFrom || null,
    p_updated_to: updatedTo || null,
    p_group_by: asString(body.group_by),
  });
  if (error) {
    throw error;
  }
  return data;
}

export async function getParsingDocument(
  supabase: ReturnType<typeof createAuthedClient>,
  documentId: string,
  tenantIds: string[],
) {
  let documentQuery = supabase
    .from("source_documents")
    .select(
      "id, tenant_id, candidate_id, source_type, original_filename, mime_type, source_uri, storage_path, created_at, updated_at",
    )
    .eq("id", documentId);

  if (tenantIds.length) {
    documentQuery = documentQuery.in("tenant_id", tenantIds);
  }

  const documentResult = await documentQuery.maybeSingle();
  if (documentResult.error) {
    throw documentResult.error;
  }
  if (!documentResult.data) {
    return { documents: [], candidates: [], profiles: [], runs: [] };
  }

  const document = documentResult.data as JsonRecord;
  const [candidateResult, profileByDocumentResult, runsResult] = await Promise
    .all([
      document.candidate_id
        ? supabase
          .from("candidates")
          .select(
            "id, tenant_id, name, headline, current_title, location, years_experience, seniority, primary_role, top_skills, email, phone, links, summary_short, status",
          )
          .eq("id", document.candidate_id)
          .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      supabase
        .from("candidate_profiles")
        .select(
          "tenant_id, candidate_id, source_document_id, profile_json, timeline_json, skill_matrix_json, raw_text, confidence, missing_fields, parse_warnings, created_at, updated_at",
        )
        .eq("source_document_id", documentId)
        .maybeSingle(),
      supabase
        .from("processing_runs")
        .select(
          "tenant_id, source_document_id, status, parser_version, model_version, prompt_version, chunk_version, embedding_version, warnings, error_code, error_message, created_at, updated_at, metadata_json",
        )
        .eq("source_document_id", documentId)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

  if (candidateResult.error) {
    throw candidateResult.error;
  }
  if (profileByDocumentResult.error) {
    throw profileByDocumentResult.error;
  }
  if (runsResult.error) {
    throw runsResult.error;
  }

  let profile = profileByDocumentResult.data;
  if (!profile && document.candidate_id) {
    const profileByCandidateResult = await supabase
      .from("candidate_profiles")
      .select(
        "tenant_id, candidate_id, source_document_id, profile_json, timeline_json, skill_matrix_json, raw_text, confidence, missing_fields, parse_warnings, created_at, updated_at",
      )
      .eq("candidate_id", document.candidate_id)
      .maybeSingle();
    if (profileByCandidateResult.error) {
      throw profileByCandidateResult.error;
    }
    profile = profileByCandidateResult.data;
  }

  return {
    documents: [document],
    candidates: candidateResult.data ? [candidateResult.data] : [],
    profiles: profile ? [profile] : [],
    runs: runsResult.data ?? [],
  };
}

export async function getOriginalDocumentUrl(
  supabase: ReturnType<typeof createAuthedClient>,
  body: JsonRecord,
  _tenantIds: string[],
) {
  await getCurrentUserId(supabase);

  const documentId = asString(body.document_id);
  const candidateId = asString(body.candidate_id);

  if (!documentId && !candidateId) {
    throw new Error("document_id or candidate_id is required.");
  }

  let query = supabase
    .from("source_documents")
    .select(
      "id, tenant_id, candidate_id, source_uri, storage_path, original_filename",
    );

  if (documentId) {
    query = query.eq("id", documentId);
  } else if (candidateId) {
    query = query.eq("candidate_id", candidateId);
  }

  const { data, error } = await query
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }
  if (!data) {
    throw new Error(
      "Original CV was not found or is not available to this user.",
    );
  }

  const document = data as OriginalDocumentRow;
  const gcsLocation = resolveGcsLocation(document);
  if (gcsLocation) {
    try {
      const signedUrl = await createGcsSignedUrl(
        gcsLocation.bucket,
        gcsLocation.objectName,
      );
      return {
        url: signedUrl.url,
        source: "gcs_signed_url",
        expires_at: signedUrl.expiresAt,
        original_filename: document.original_filename,
      };
    } catch (signError) {
      const fallbackSourceUri = asString(document.source_uri);
      if (!isBrowserOpenableSource(fallbackSourceUri)) {
        throw signError;
      }
    }
  }

  const browserSourceUri = asString(document.source_uri);
  if (isBrowserOpenableSource(browserSourceUri)) {
    return {
      url: browserSourceUri,
      source: "source_uri",
      expires_at: null,
      original_filename: document.original_filename,
    };
  }

  throw new Error("Original CV does not have a browser-openable source yet.");
}
