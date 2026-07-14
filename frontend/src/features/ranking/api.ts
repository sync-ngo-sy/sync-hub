import { invokeFunction } from "@/lib/api/platformClient";
import type {
  FormulaGetResponse,
  RankFiltersInput,
  RankingFormula,
  RankProfilesResponse,
  RankTargetInput,
  RecomputeScoresResponse,
  TargetOptionsResponse,
} from "@/features/ranking/types";

export const rankingApi = {
  getFormula(tenantId: string) {
    return invokeFunction<FormulaGetResponse>("rank", {
      action: "formula_get",
      tenant_id: tenantId,
    });
  },

  saveFormula(input: {
    tenantId: string;
    profile: {
      id?: string;
      name: string;
      description: string;
      version?: string;
      formula: RankingFormula;
      syrianCompanies: string[];
    };
    activate?: boolean;
  }) {
    return invokeFunction<FormulaGetResponse>("rank", {
      action: "formula_save",
      tenant_id: input.tenantId,
      profile: input.profile,
      activate: input.activate ?? false,
    });
  },

  targetOptions(tenantIds: string[]) {
    return invokeFunction<TargetOptionsResponse>("rank", {
      action: "target_options",
      tenant_ids: tenantIds,
    });
  },

  rankProfiles(input: {
    tenantIds: string[];
    tenantId: string;
    target: RankTargetInput;
    filters?: RankFiltersInput;
    limit?: number;
    offset?: number;
  }) {
    return invokeFunction<RankProfilesResponse>("rank", {
      action: "rank_profiles",
      tenant_ids: input.tenantIds,
      tenant_id: input.tenantId,
      target: input.target,
      filters: input.filters ?? {},
      limit: input.limit ?? 25,
      offset: input.offset ?? 0,
    });
  },

  recomputeScores(tenantId: string) {
    return invokeFunction<RecomputeScoresResponse>("rank", {
      action: "scores_recompute",
      tenant_id: tenantId,
    });
  },
};
