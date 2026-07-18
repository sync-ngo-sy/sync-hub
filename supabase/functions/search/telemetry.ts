import { jsonResponse } from "../_shared/cors.ts";
import { recordEdgeRequest, withTraceHeader } from "../_shared/ops.ts";

export function createResponder(
  getSupabase: () =>
    | ReturnType<typeof import("../_shared/client.ts").createAuthedClient>
    | null,
  getTenantIds: () => string[],
  traceId: string,
  startedAt: number,
) {
  return async (
    status: number,
    payload: Record<string, unknown>,
    telemetry: Record<string, unknown> = {},
  ) => {
    const supabase = getSupabase();
    const tenantIds = getTenantIds();

    if (supabase) {
      await recordEdgeRequest(supabase, {
        component: "search",
        tenantIds,
        traceId,
        startedAt,
        statusCode: status,
        payload: {
          error_code: typeof payload.error === "string" ? payload.error : null,
          result_count: Array.isArray(payload.results)
            ? payload.results.length
            : null,
          ...telemetry,
        },
      });
    }
    return withTraceHeader(jsonResponse(status, payload), traceId);
  };
}
