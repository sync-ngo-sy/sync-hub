import type {
  ParsingCandidateRow,
  ParsingProcessingRunRow,
  ParsingProfileRow,
  ParsingSourceDocumentRow,
} from "@/lib/parsingQuality";

export type {
  ParsingCandidateRow,
  ParsingProcessingRunRow,
  ParsingProfileRow,
  ParsingSourceDocumentRow,
} from "@/lib/parsingQuality";

export type CandidateDossierRow = {
  candidate_id: string;
  source_document_id?: string | null;
  name: string;
  headline: string | null;
  current_title: string | null;
  location: string | null;
  years_experience: number | null;
  seniority: string | null;
  primary_role: string | null;
  top_skills: string[] | null;
  email: string | null;
  phone: string | null;
  links: string[] | null;
  summary_short: string | null;
  short_summary: string | null;
  long_summary: string | null;
  strengths: unknown;
  risks: unknown;
  recommended_roles: unknown;
  timeline_json: unknown;
  profile_json: unknown;
  original_filename: string | null;
  mime_type: string | null;
  storage_path: string | null;
  source_uri: string | null;
  manatal_candidate_id?: string | null;
  confidence: number | null;
};

export type CandidateChunkRow = {
  id: string;
  chunk_type: string;
  text: string;
};

export type CandidateSearchFacetRow = {
  seniority: string | null;
  skills: string[] | null;
  companies: string[] | null;
  location: string | null;
};

export type CandidateSearchRow = CandidateSearchFacetRow & {
  tenant_id: string;
  candidate_id: string;
  name: string | null;
  headline: string | null;
  current_title: string | null;
  years_experience: number | null;
  primary_role: string | null;
  summary_short: string | null;
  stored_short_summary: string | null;
};

export type CandidateTimelineRow = {
  timeline_json: unknown;
};

export type ParsingRemoteSnapshot = {
  documents: ParsingSourceDocumentRow[];
  candidates: ParsingCandidateRow[];
  profiles: ParsingProfileRow[];
  runs: ParsingProcessingRunRow[];
};

export type ParserProfileRow = {
  id: string;
  tenant_id: string;
  name: string;
  slug: string;
  description: string | null;
  status: string;
  extraction_provider: string;
  extraction_model: string;
  parser_version: string;
  model_version: string;
  prompt_version: string;
  chunk_version: string;
  embedding_provider: string;
  embedding_model: string;
  embedding_version: string;
  chunking_profile: string;
  ocr_enabled: boolean;
  allow_heuristic_fallback: boolean;
  prompt_template: string;
  notes: string | null;
  last_evaluated_at: string | null;
  avg_parse_percentage: number | null;
  avg_confidence: number | null;
  documents_evaluated: number | null;
  created_at: string;
  updated_at: string;
};

export type CandidateShortlistRow = {
  user_id: string;
  tenant_id: string;
  candidate_id: string;
  candidate_name: string | null;
  current_title: string | null;
  location: string | null;
  years_experience: number | null;
  seniority: string | null;
  primary_role: string | null;
  top_skills: string[] | null;
  match_rate: number | null;
  cv_url: string | null;
  original_filename: string | null;
  source_query: string | null;
  search_snapshot: unknown;
  notes: string | null;
  created_at: string;
  updated_at: string;
};
