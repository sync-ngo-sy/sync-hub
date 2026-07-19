from __future__ import annotations

import urllib.parse
from dataclasses import dataclass, field

from ...config import WorkerConfig
from .helpers import format_bytes
from .transport import SupabaseRequest, SupabaseRequestWithHeaders


@dataclass(frozen=True)
class SupabaseCapacitySnapshot:
    database_bytes: int = 0
    storage_bytes: int = 0
    table_counts: dict[str, int] = field(default_factory=dict)
    source: str = "unavailable"


class SupabaseCapacityService:
    def __init__(
        self,
        config: WorkerConfig,
        *,
        request: SupabaseRequest,
        request_with_headers: SupabaseRequestWithHeaders,
    ) -> None:
        self._config = config
        self._request = request
        self._request_with_headers = request_with_headers

    def count_table(self, table: str, tenant_id: str | None = None) -> int:
        query_args = {"select": "id", "limit": "1"}
        if tenant_id:
            query_args["tenant_id"] = f"eq.{tenant_id}"
        query = urllib.parse.urlencode(query_args)
        _result, headers = self._request_with_headers(
            "GET",
            f"/rest/v1/{table}?{query}",
            headers={"Prefer": "count=exact", "Range": "0-0"},
        )
        content_range = headers.get("Content-Range") or headers.get("content-range") or ""
        if "/" not in content_range:
            return 0
        total = content_range.rsplit("/", 1)[-1]
        return int(total) if total.isdigit() else 0

    def snapshot(self, tenant_id: str | None = None) -> SupabaseCapacitySnapshot:
        try:
            payload = (
                {
                    "p_tenant_id": tenant_id,
                    "p_storage_bucket": self._config.supabase_storage_bucket,
                }
                if tenant_id
                else {"p_storage_bucket": self._config.supabase_storage_bucket}
            )
            result = self._request(
                "POST",
                "/rest/v1/rpc/ingestion_capacity_snapshot_v1",
                data=payload,
            )
            row = (
                result[0]
                if isinstance(result, list) and result
                else result
                if isinstance(result, dict)
                else {}
            )
            if isinstance(row, dict):
                table_counts = row.get("table_counts")
                return SupabaseCapacitySnapshot(
                    database_bytes=int(row.get("database_bytes") or 0),
                    storage_bytes=int(row.get("storage_bytes") or 0),
                    table_counts=(
                        dict(table_counts) if isinstance(table_counts, dict) else {}
                    ),
                    source="rpc",
                )
        except RuntimeError:
            pass

        tables = [
            "source_documents",
            "candidates",
            "candidate_profiles",
            "candidate_summaries",
            "candidate_skill_map",
            "candidate_chunks",
            "processing_runs",
        ]
        counts: dict[str, int] = {}
        for table in tables:
            try:
                counts[table] = self.count_table(table, tenant_id=tenant_id)
            except RuntimeError:
                counts[table] = 0
        return SupabaseCapacitySnapshot(table_counts=counts, source="rest-counts")

    def warnings(
        self,
        tenant_id: str,
        estimated_database_bytes: int = 0,
        estimated_storage_bytes: int = 0,
    ) -> list[str]:
        warnings: list[str] = []
        threshold = self._config.supabase_limit_warning_threshold
        snapshot = self.snapshot(tenant_id)
        if self._config.supabase_database_limit_bytes and snapshot.database_bytes:
            projected_database_bytes = snapshot.database_bytes + int(
                estimated_database_bytes
                * self._config.supabase_database_expansion_factor
            )
            ratio = projected_database_bytes / self._config.supabase_database_limit_bytes
            if ratio >= threshold:
                warnings.append(
                    "Supabase database usage is near the configured limit: "
                    f"projected {format_bytes(projected_database_bytes)} of "
                    f"{format_bytes(self._config.supabase_database_limit_bytes)} "
                    f"({ratio:.1%}, source={snapshot.source})."
                )
        if self._config.supabase_storage_limit_bytes:
            projected_storage_bytes = snapshot.storage_bytes + estimated_storage_bytes
            if projected_storage_bytes:
                ratio = projected_storage_bytes / self._config.supabase_storage_limit_bytes
                if ratio >= threshold:
                    warnings.append(
                        "Supabase storage usage is near the configured limit: "
                        f"projected {format_bytes(projected_storage_bytes)} of "
                        f"{format_bytes(self._config.supabase_storage_limit_bytes)} "
                        f"({ratio:.1%}, source={snapshot.source})."
                    )
        if snapshot.source == "rest-counts":
            warnings.append(
                "Supabase capacity RPC is not available; limit checks used table "
                "counts only and cannot read exact database or storage size."
            )
        return warnings
