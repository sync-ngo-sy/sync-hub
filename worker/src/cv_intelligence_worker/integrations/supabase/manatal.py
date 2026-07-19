from __future__ import annotations

import urllib.parse
from typing import Any, Protocol

from ...config import WorkerConfig
from .transport import SupabaseRequest


class SelectRows(Protocol):
    def __call__(
        self,
        table: str,
        tenant_id: str,
        column: str,
        values: list[str],
        select: str,
    ) -> list[dict[str, Any]]: ...


class UpsertMany(Protocol):
    def __call__(
        self,
        table: str,
        rows: list[dict[str, Any]],
        on_conflict: str,
        batch_size: int | None = None,
    ) -> int: ...


class ManatalRepository:
    def __init__(
        self,
        config: WorkerConfig,
        *,
        request: SupabaseRequest,
        select_rows: SelectRows,
        upsert_many: UpsertMany,
    ) -> None:
        self._table = config.manatal_sync_state_table
        self._request = request
        self._select_rows = select_rows
        self._upsert_many = upsert_many

    def sync_states(
        self,
        tenant_id: str,
        candidate_ids: list[str],
    ) -> dict[str, dict[str, Any]]:
        rows = self._select_rows(
            self._table,
            tenant_id,
            "manatal_candidate_id",
            candidate_ids,
            "tenant_id,manatal_candidate_id,manatal_updated_at,manatal_full_name,manatal_email,resume_url,resume_sha256,source_document_id,sync_status,last_synced_at,error_message,metadata_json",
        )
        return {
            str(row.get("manatal_candidate_id")): row
            for row in rows
            if row.get("manatal_candidate_id")
        }

    def upsert_sync_states(self, rows: list[dict[str, Any]]) -> int:
        return self._upsert_many(
            self._table,
            rows,
            "tenant_id,manatal_candidate_id",
        )

    def pending_candidate_ids(self, tenant_id: str, limit: int = 100) -> list[str]:
        query = urllib.parse.urlencode(
            {
                "tenant_id": f"eq.{tenant_id}",
                "sync_status": "eq.pending",
                "select": "manatal_candidate_id",
                "order": "updated_at.asc",
                "limit": str(max(1, limit)),
            }
        )
        result = self._request("GET", f"/rest/v1/{self._table}?{query}")
        if not isinstance(result, list):
            return []
        return [
            str(row.get("manatal_candidate_id"))
            for row in result
            if isinstance(row, dict) and row.get("manatal_candidate_id")
        ]

    def original_source_rows(
        self,
        tenant_id: str,
        *,
        offset: int,
        limit: int,
    ) -> list[dict[str, Any]]:
        query = urllib.parse.urlencode(
            {
                "tenant_id": f"eq.{tenant_id}",
                "source_document_id": "not.is.null",
                "select": "tenant_id,manatal_candidate_id,manatal_full_name,manatal_email,resume_url,source_document_id,resume_sha256,metadata_json",
                "order": "updated_at.asc",
                "limit": str(max(1, limit)),
                "offset": str(max(0, offset)),
            }
        )
        result = self._request("GET", f"/rest/v1/{self._table}?{query}")
        if not isinstance(result, list):
            return []
        return [row for row in result if isinstance(row, dict)]

    def source_documents(
        self,
        tenant_id: str,
        source_document_ids: list[str],
    ) -> dict[str, dict[str, Any]]:
        rows = self._select_rows(
            "source_documents",
            tenant_id,
            "id",
            source_document_ids,
            "id,tenant_id,candidate_id,original_filename,mime_type,source_uri,storage_path,metadata_json",
        )
        return {str(row.get("id")): row for row in rows if row.get("id")}

    def update_source_document(
        self,
        tenant_id: str,
        source_document_id: str,
        values: dict[str, Any],
    ) -> None:
        query = urllib.parse.urlencode(
            {
                "tenant_id": f"eq.{tenant_id}",
                "id": f"eq.{source_document_id}",
            }
        )
        self._request(
            "PATCH",
            f"/rest/v1/source_documents?{query}",
            data=values,
            headers={"Prefer": "return=minimal"},
        )
