import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { createAuthedClient } from "../_shared/client.ts";
import {
  addUserToTenant,
  assertPlatformAdmin,
  createServiceClient,
  createTenantAccount,
  listAdminTenants,
} from "../_shared/platformProvisioning.ts";
import {
  buildPlatformRuntimeConfigView,
  savePlatformRuntimeSettings,
} from "../_shared/platformRuntimeSettings.ts";
import {
  asRecord,
  asString,
  asStringArray,
  describeError,
  type JsonRecord,
} from "../_shared/utils.ts";
import { getAuthContext } from "../_shared/auth.ts";
import {
  acknowledgeOpsAlert,
  bootstrapTenant,
  getInsightReportRun,
  getInsightsDashboard,
  getInsightsGapAnalysis,
  getManatalSyncStatus,
  getOpsAlerts,
  getSearchFilterOptions,
  getSystemHealth,
  getWorkspaceStats,
  listInsightReportRuns,
  startInsightReportRun,
} from "../_shared/platformOps.ts";

import {
  getCandidateDetail,
  getCandidatesList,
  getOriginalDocumentUrl,
  getParsingDocument,
  getParsingOverview,
} from "./candidates.ts";

import {
  getParserProfiles,
  publishParserProfile,
  saveParserProfile,
} from "./parserProfiles.ts";

import {
  clearShortlistItems,
  deleteShortlistItem,
  getShortlistItems,
  saveShortlistItem,
} from "./shortlist.ts";

import {
  extractJobPosting,
  getJobPosting,
  getJobShortlist,
  getMatchingRun,
  listJobApplications,
  listJobPostings,
  listJobShortlists,
  listMatchingRuns,
  saveJobPosting,
  saveJobShortlist,
  startJobMatchingRun,
  updateJobApplicationStatus,
} from "./jobs.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { error: "method_not_allowed" });
  }

  try {
    const body = (await req.json()) as JsonRecord;
    const action = asString(body.action);
    const tenantIds = asStringArray(body.tenant_ids);
    const supabase = createAuthedClient(req);

    switch (action) {
      case "auth_context":
        return jsonResponse(200, await getAuthContext(supabase));
      case "bootstrap_tenant":
        return jsonResponse(200, await bootstrapTenant(supabase, body));
      case "search_filter_options":
        return jsonResponse(
          200,
          await getSearchFilterOptions(supabase, tenantIds),
        );
      case "workspace_stats":
        return jsonResponse(200, await getWorkspaceStats(supabase, tenantIds));
      case "manatal_sync_status":
        return jsonResponse(
          200,
          await getManatalSyncStatus(supabase, tenantIds),
        );
      case "system_health":
        return jsonResponse(200, await getSystemHealth(supabase, tenantIds));
      case "ops_alerts":
        return jsonResponse(200, await getOpsAlerts(supabase, tenantIds));
      case "insights_dashboard":
        return jsonResponse(
          200,
          await getInsightsDashboard(supabase, tenantIds, body),
        );
      case "insights_gap_analysis":
        return jsonResponse(
          200,
          await getInsightsGapAnalysis(supabase, tenantIds, body),
        );
      case "start_insight_report":
        return jsonResponse(
          200,
          await startInsightReportRun(supabase, tenantIds, body),
        );
      case "insight_report_runs":
        return jsonResponse(
          200,
          await listInsightReportRuns(supabase, tenantIds, body),
        );
      case "insight_report_run":
        return jsonResponse(
          200,
          await getInsightReportRun(supabase, asString(body.run_id) ?? ""),
        );
      case "ops_ack_alert":
        return jsonResponse(
          200,
          await acknowledgeOpsAlert(supabase, asString(body.dedupe_key) ?? ""),
        );
      case "candidate_detail": {
        const result = await getCandidateDetail(
          supabase,
          asString(body.candidate_id) ?? "",
        );

        return jsonResponse(200, {
          candidate: result.candidate,
          chunks: result.chunks,
          evidence: result.chunks ?? [],

          profile: {
            status: result.profile?.status ?? null,
            job_readiness_level: result.profile?.job_readiness_level ?? "L1",
            preferred_work_mode: result.profile?.preferred_work_mode ?? null,
            years_of_experience: result.profile?.years_of_experience ?? null,
            primary_skills: result.profile?.primary_skills ?? [],
            notice_period: result.profile?.notice_period ?? null,
            english_proficiency: result.profile?.english_proficiency ?? null,

            expected_salary: result.profile?.expected_salary ?? null,

            is_pre_screened: result.profile?.is_pre_screened ?? false,
            sync_affiliation: result.profile?.sync_affiliation ?? null,
            internal_vetting_notes: result.profile?.internal_vetting_notes ??
              null,

            current_location_city: result.profile?.current_location_city ??
              result.candidate?.location ??
              null,

            willingness_to_relocate: result.profile?.willingness_to_relocate ??
              null,

            external_profiles: result.profile?.external_profiles ?? {},
            ai_profile_summary: result.profile?.ai_profile_summary ??
              result.candidate?.summary_short ??
              result.candidate?.long_summary ??
              null,

            employment_type_preference:
              result.profile?.employment_type_preference ?? [],

            last_interaction_date: result.profile?.last_interaction_date ??
              null,
          },

          manatalCandidateId: result.manatalCandidateId ?? null,
        });
      }
      case "parsing_overview":
        return jsonResponse(
          200,
          await getParsingOverview(supabase, tenantIds, body),
        );
      case "candidates_list":
        return jsonResponse(
          200,
          await getCandidatesList(supabase, tenantIds, body),
        );
      case "parsing_document":
        return jsonResponse(
          200,
          await getParsingDocument(
            supabase,
            asString(body.document_id) ?? "",
            tenantIds,
          ),
        );
      case "original_document_url":
        return jsonResponse(
          200,
          await getOriginalDocumentUrl(supabase, body, tenantIds),
        );
      case "parser_profiles":
        return jsonResponse(200, await getParserProfiles(supabase, tenantIds));
      case "save_parser_profile":
        return jsonResponse(200, await saveParserProfile(supabase, body));
      case "publish_parser_profile":
        return jsonResponse(
          200,
          await publishParserProfile(supabase, asString(body.profile_id) ?? ""),
        );
      case "shortlist_items":
        return jsonResponse(200, await getShortlistItems(supabase, tenantIds));
      case "save_shortlist_item":
        return jsonResponse(200, await saveShortlistItem(supabase, body));
      case "delete_shortlist_item":
        return jsonResponse(200, await deleteShortlistItem(supabase, body));
      case "clear_shortlist_items":
        return jsonResponse(
          200,
          await clearShortlistItems(supabase, tenantIds),
        );
      case "job_postings":
        return jsonResponse(
          200,
          await listJobPostings(supabase, tenantIds, body),
        );
      case "job_posting":
        return jsonResponse(
          200,
          await getJobPosting(supabase, asString(body.job_id) ?? ""),
        );
      case "save_job_posting":
        return jsonResponse(200, await saveJobPosting(supabase, body));
      case "extract_job_posting":
        return jsonResponse(200, await extractJobPosting(supabase, body));
      case "start_job_matching_run":
        return jsonResponse(200, await startJobMatchingRun(supabase, body));
      case "matching_runs":
        return jsonResponse(200, await listMatchingRuns(supabase, body));
      case "matching_run":
        return jsonResponse(
          200,
          await getMatchingRun(supabase, asString(body.run_id) ?? ""),
        );
      case "job_applications":
        return jsonResponse(200, await listJobApplications(supabase, body));
      case "update_job_application_status":
        return jsonResponse(
          200,
          await updateJobApplicationStatus(supabase, body),
        );
      case "job_shortlists":
        return jsonResponse(200, await listJobShortlists(supabase, body));
      case "job_shortlist":
        return jsonResponse(
          200,
          await getJobShortlist(supabase, asString(body.shortlist_id) ?? ""),
        );
      case "save_job_shortlist":
        return jsonResponse(200, await saveJobShortlist(supabase, body));
      case "list_admin_tenants": {
        await assertPlatformAdmin(supabase);
        const admin = createServiceClient();
        return jsonResponse(200, await listAdminTenants(admin));
      }
      case "create_tenant_account": {
        await assertPlatformAdmin(supabase);
        const admin = createServiceClient();
        return jsonResponse(200, await createTenantAccount(admin, body));
      }
      case "add_user_to_tenant": {
        await assertPlatformAdmin(supabase);
        const admin = createServiceClient();
        return jsonResponse(200, await addUserToTenant(admin, body));
      }
      case "get_platform_runtime_config": {
        await assertPlatformAdmin(supabase);
        return jsonResponse(200, await buildPlatformRuntimeConfigView());
      }
      case "save_platform_runtime_config": {
        const user = await assertPlatformAdmin(supabase);
        const settings = asRecord(body.settings) as Record<
          string,
          string | null | undefined
        >;
        try {
          return jsonResponse(
            200,
            await savePlatformRuntimeSettings(settings, user.id),
          );
        } catch (error) {
          const message = describeError(error);
          try {
            const parsed = JSON.parse(message) as {
              code?: string;
              fields?: Record<string, string>;
            };
            if (parsed.code === "validation_error") {
              return jsonResponse(400, {
                error: "validation_error",
                fields: parsed.fields ?? {},
              });
            }
          } catch {
          }
          throw error;
        }
      }
      default:
        return jsonResponse(400, { error: "unknown_action", details: action });
    }
  } catch (error) {
    const message = describeError(error);
    if (
      message === "Authentication is required." ||
      message === "Platform admin access is required."
    ) {
      return jsonResponse(403, { error: "forbidden", details: message });
    }
    return jsonResponse(500, { error: "unexpected_error", details: message });
  }
});
