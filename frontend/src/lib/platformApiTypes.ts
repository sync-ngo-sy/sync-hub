import type {
  AccessRoster,
  AccountProvisionResult,
  AgentResponse,
  AnalyticsSnapshot,
  AskResponse,
  CandidateDetail,
  CandidateShortlistInput,
  CandidateShortlistItem,
  ComparisonResponse,
  DataConnector,
  IndexingWorkbench,
  ManatalSyncStatus,
  MembershipRole,
  OpsAlert,
  ParserProfile,
  ParserProfileInput,
  ParsingDocumentDetail,
  ParsingOverview,
  PlatformRuntimeConfig,
  SearchDebugResponse,
  SearchFilterOptions,
  SearchFilters,
  SearchQueryOptions,
  SearchResponse,
  SystemHealth,
  TenantAdminSummary,
  WorkspaceStats,
} from "@/lib/contracts";
import type {
  ParsingCandidateRow,
  ParsingProcessingRunRow,
  ParsingProfileRow,
  ParsingSourceDocumentRow,
} from "@/lib/parsingQuality";

export type JsonRecord = Record<string, unknown>;

export type OriginalDocumentUrlContext = {
  candidateId?: string | null;
  documentId?: string | null;
  tenantId?: string | null;
  tenantIds?: string[];
};

export type ParsingOverviewOptions = {
  pageSize?: number;
  pageIndex?: number;
  reviewFilter?: "all" | "needsReview";
  searchQuery?: string;
};

export type PlatformApi = {
  search: (query: string, filters: SearchFilters, options?: SearchQueryOptions, tenantIds?: string[]) => Promise<SearchResponse>;
  searchDebug: (query: string, filters: SearchFilters, options?: SearchQueryOptions, tenantIds?: string[]) => Promise<SearchDebugResponse>;
  getSearchFilterOptions: (tenantIds?: string[]) => Promise<SearchFilterOptions>;
  getWorkspaceStats: (tenantIds?: string[]) => Promise<WorkspaceStats>;
  getManatalSyncStatus: (tenantIds?: string[]) => Promise<ManatalSyncStatus>;
  getManatalCandidateId: (candidateId: string) => Promise<string | null>;
  getCandidate: (candidateId: string) => Promise<CandidateDetail>;
  compare: (candidateIds: string[], requiredSkills?: string[]) => Promise<ComparisonResponse>;
  ask: (question: string, candidateIds: string[]) => Promise<AskResponse>;
  agent: (
    question: string,
    candidateIds?: string[],
    messages?: Array<{ role: "user" | "assistant"; content: string }>,
    tenantIds?: string[],
  ) => Promise<AgentResponse>;
  getOriginalDocumentUrl: (storagePath?: string | null, sourceUri?: string | null, context?: OriginalDocumentUrlContext) => Promise<string | null>;
  getShortlist: (tenantIds?: string[]) => Promise<CandidateShortlistItem[]>;
  saveShortlistItem: (item: CandidateShortlistInput) => Promise<CandidateShortlistItem>;
  removeShortlistItem: (candidateId: string, tenantId?: string | null) => Promise<void>;
  clearShortlist: (tenantIds?: string[]) => Promise<void>;
  getParsingOverview: (tenantIds?: string[], options?: ParsingOverviewOptions) => Promise<ParsingOverview>;
  getParsingDocument: (documentId: string, tenantIds?: string[]) => Promise<ParsingDocumentDetail>;
  getParserProfiles: (tenantIds?: string[]) => Promise<ParserProfile[]>;
  saveParserProfile: (profile: ParserProfileInput, tenantId?: string) => Promise<ParserProfile>;
  publishParserProfile: (profileId: string, tenantId?: string) => Promise<ParserProfile>;
  getAnalytics: () => Promise<AnalyticsSnapshot>;
  getSystemHealth: () => Promise<SystemHealth>;
  getOpsAlerts: (tenantIds?: string[]) => Promise<OpsAlert[]>;
  acknowledgeOpsAlert: (dedupeKey: string) => Promise<OpsAlert | null>;
  getDataConnectors: () => Promise<DataConnector[]>;
  getIndexingWorkbench: () => Promise<IndexingWorkbench>;
  getAccessRoster: () => Promise<AccessRoster>;
  listAdminTenants: () => Promise<TenantAdminSummary[]>;
  createTenantAccount: (input: {
    email: string;
    password: string;
    tenantName: string;
    tenantSlug?: string;
    tenantIcon?: string;
    fullName?: string;
    role?: MembershipRole;
  }) => Promise<AccountProvisionResult>;
  addUserToTenant: (input: {
    email: string;
    password: string;
    tenantSlug: string;
    fullName?: string;
    role?: MembershipRole;
  }) => Promise<AccountProvisionResult>;
  getPlatformRuntimeConfig: () => Promise<PlatformRuntimeConfig>;
  savePlatformRuntimeConfig: (settings: Record<string, string | null>) => Promise<PlatformRuntimeConfig>;
};

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
