import { supabase } from "@/lib/supabaseClient";

type CountRowsQuery = PromiseLike<{ count?: number | null; error?: unknown }> & {
  eq(column: string, value: unknown): CountRowsQuery;
  ilike(column: string, pattern: string): CountRowsQuery;
  in(column: string, values: readonly string[]): CountRowsQuery;
  like(column: string, pattern: string): CountRowsQuery;
  not(column: string, operator: string, value: unknown): CountRowsQuery;
};

type CountableTable = "source_documents" | "manatal_candidate_sync";

export async function countRemoteRows(table: CountableTable, tenantIds: string[], apply?: (query: CountRowsQuery) => CountRowsQuery): Promise<number> {
  if (!supabase) {
    return 0;
  }
  let query = supabase.from(table).select("*", { count: "exact", head: true }) as unknown as CountRowsQuery;
  if (tenantIds.length) {
    query = query.in("tenant_id", tenantIds);
  }
  if (apply) {
    query = apply(query);
  }
  const { count, error } = await query;
  if (error) {
    throw error instanceof Error ? error : new Error(String(error));
  }
  return count ?? 0;
}
