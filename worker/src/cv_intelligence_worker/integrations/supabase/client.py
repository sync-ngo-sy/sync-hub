from __future__ import annotations

import urllib.parse
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from ...config import WorkerConfig
from ...core.http import urlopen
from ...core.text import normalize_email
from ...domain.models import ArtifactBundle, ComparisonArtifact, dataclass_to_dict
from .batching import SupabaseBatchWriter
from .capacity import SupabaseCapacityService, SupabaseCapacitySnapshot
from .candidate_drafts import CandidateDraftRepository
from .helpers import (
    chunks,
    dedupe_rows,
    json_payload_size,
)
from .manatal import ManatalRepository
from .public_applications import PublicApplicationRepository
from .rows import build_bundle_rows
from .storage import SupabaseStorageClient
from .transport import SupabaseRestTransport


@dataclass(frozen=True)
class SupabaseSyncStats:
    bundles: int = 0
    table_rows: dict[str, int] = field(default_factory=dict)
    storage_bytes: int = 0
    estimated_database_bytes: int = 0
    warnings: list[str] = field(default_factory=list)


class SupabaseClient:
    def __init__(self, config: WorkerConfig) -> None:
        self.config = config
        self._transport = SupabaseRestTransport(config, opener=urlopen)
        self._storage = SupabaseStorageClient(config, opener=urlopen)
        self._batch_writer = SupabaseBatchWriter(
            self.upsert,
            default_batch_size=config.supabase_batch_size,
        )
        self._public_applications = PublicApplicationRepository(self._request)
        self._candidate_drafts = CandidateDraftRepository(self._request)
        self._manatal = ManatalRepository(
            config,
            request=self._request,
            select_rows=self._select_in,
            upsert_many=self.upsert_many,
        )
        self._capacity = SupabaseCapacityService(
            config,
            request=self._request,
            request_with_headers=self._request_with_headers,
        )

    def _headers(self, extra: dict[str, str] | None = None) -> dict[str, str]:
        return self._transport.headers(extra)

    def _request_with_headers(self, method: str, path: str, *, data: Any | None = None, headers: dict[str, str] | None = None) -> tuple[Any, dict[str, str]]:
        return self._transport.request_with_headers(
            method,
            path,
            data=data,
            headers=headers,
        )

    def _request(self, method: str, path: str, *, data: Any | None = None, headers: dict[str, str] | None = None) -> Any:
        return self._transport.request(method, path, data=data, headers=headers)

    def upsert(self, table: str, rows: list[dict[str, Any]], on_conflict: str) -> Any:
        if not rows:
            return None
        query = urllib.parse.urlencode({"on_conflict": on_conflict})
        return self._request(
            "POST",
            f"/rest/v1/{table}?{query}",
            data=rows,
            headers={"Prefer": "resolution=merge-duplicates,return=minimal"},
        )

    def upsert_many(self, table: str, rows: list[dict[str, Any]], on_conflict: str, batch_size: int | None = None) -> int:
        return self._batch_writer.write_many(table, rows, on_conflict, batch_size)

    def _select_in(self, table: str, tenant_id: str, column: str, values: list[str], select: str) -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = []
        unique_values = sorted({value for value in values if value})
        for batch in chunks(unique_values, 100):
            query = urllib.parse.urlencode(
                {
                    "tenant_id": f"eq.{tenant_id}",
                    column: f"in.({','.join(batch)})",
                    "select": select,
                }
            )
            result = self._request("GET", f"/rest/v1/{table}?{query}")
            if isinstance(result, list):
                rows.extend(item for item in result if isinstance(item, dict))
        return rows

    def manatal_sync_states(self, tenant_id: str, manatal_candidate_ids: list[str]) -> dict[str, dict[str, Any]]:
        return self._manatal.sync_states(tenant_id, manatal_candidate_ids)

    def upsert_manatal_sync_states(self, rows: list[dict[str, Any]]) -> int:
        return self._manatal.upsert_sync_states(rows)

    def pending_manatal_candidate_ids(self, tenant_id: str, limit: int = 100) -> list[str]:
        return self._manatal.pending_candidate_ids(tenant_id, limit)

    def manatal_original_source_rows(self, tenant_id: str, *, offset: int, limit: int) -> list[dict[str, Any]]:
        return self._manatal.original_source_rows(
            tenant_id,
            offset=offset,
            limit=limit,
        )

    def source_documents_by_ids(self, tenant_id: str, source_document_ids: list[str]) -> dict[str, dict[str, Any]]:
        return self._manatal.source_documents(tenant_id, source_document_ids)

    def update_source_document(self, tenant_id: str, source_document_id: str, values: dict[str, Any]) -> None:
        self._manatal.update_source_document(
            tenant_id,
            source_document_id,
            values,
        )

    def _count_table(self, table: str, tenant_id: str | None = None) -> int:
        return self._capacity.count_table(table, tenant_id)

    def capacity_snapshot(self, tenant_id: str | None = None) -> SupabaseCapacitySnapshot:
        return self._capacity.snapshot(tenant_id)

    def capacity_warnings(self, tenant_id: str, estimated_database_bytes: int = 0, estimated_storage_bytes: int = 0) -> list[str]:
        return self._capacity.warnings(
            tenant_id,
            estimated_database_bytes,
            estimated_storage_bytes,
        )

    def public_source_uri(self, local_source_path: str) -> str:
        return self.config.public_source_uri or local_source_path

    def resolve_source_document_id(self, tenant_id: str, document_sha256: str, fallback_id: str) -> str:
        query = urllib.parse.urlencode(
            {
                "tenant_id": f"eq.{tenant_id}",
                "document_sha256": f"eq.{document_sha256}",
                "select": "id",
                "limit": "1",
            }
        )
        result = self._request("GET", f"/rest/v1/source_documents?{query}")
        if isinstance(result, list) and result:
            existing_id = str(result[0].get("id") or "")
            if existing_id:
                return existing_id
        return fallback_id

    def resolve_candidate_id(self, tenant_id: str, email: str, source_document_id: str, fallback_id: str) -> str:
        normalized_email = normalize_email(email)
        if normalized_email:
            query = urllib.parse.urlencode(
                {
                    "tenant_id": f"eq.{tenant_id}",
                    "email": f"eq.{normalized_email}",
                    "select": "id",
                    "order": "created_at.asc",
                    "limit": "1",
                }
            )
            result = self._request("GET", f"/rest/v1/candidates?{query}")
            if isinstance(result, list) and result:
                existing_id = str(result[0].get("id") or "")
                if existing_id:
                    return existing_id

        query = urllib.parse.urlencode(
            {
                "tenant_id": f"eq.{tenant_id}",
                "id": f"eq.{source_document_id}",
                "select": "candidate_id",
                "limit": "1",
            }
        )
        result = self._request("GET", f"/rest/v1/source_documents?{query}")
        if isinstance(result, list) and result:
            existing_id = str(result[0].get("candidate_id") or "")
            if existing_id:
                return existing_id
        return fallback_id

    def _resolve_bundle_identities(self, bundles: list[ArtifactBundle]) -> list[tuple[str, str]]:
        identities: list[tuple[str, str]] = []
        by_tenant: dict[str, list[ArtifactBundle]] = {}
        for bundle in bundles:
            by_tenant.setdefault(bundle.source.tenant_id, []).append(bundle)

        identity_by_bundle_index: dict[int, tuple[str, str]] = {}
        for tenant_id, tenant_bundles in by_tenant.items():
            source_rows = self._select_in(
                "source_documents",
                tenant_id,
                "document_sha256",
                [bundle.source.document_sha256 for bundle in tenant_bundles],
                "id,document_sha256,candidate_id",
            )
            source_id_by_sha = {
                str(row.get("document_sha256")): str(row.get("id"))
                for row in source_rows
                if row.get("document_sha256") and row.get("id")
            }
            candidate_id_by_source_id = {
                str(row.get("id")): str(row.get("candidate_id"))
                for row in source_rows
                if row.get("id") and row.get("candidate_id")
            }
            for bundle in tenant_bundles:
                source_id_by_sha.setdefault(bundle.source.document_sha256, bundle.source.document_id)

            email_rows = self._select_in(
                "candidates",
                tenant_id,
                "email",
                [normalize_email(bundle.profile.email) for bundle in tenant_bundles],
                "id,email,created_at",
            )
            candidate_id_by_email: dict[str, str] = {}
            for row in email_rows:
                email = normalize_email(str(row.get("email") or ""))
                candidate_id = str(row.get("id") or "")
                if email and candidate_id and email not in candidate_id_by_email:
                    candidate_id_by_email[email] = candidate_id

            local_candidate_id_by_source_id: dict[str, str] = {}
            for bundle in tenant_bundles:
                source_document_id = source_id_by_sha[bundle.source.document_sha256]
                local_candidate_id_by_source_id.setdefault(source_document_id, bundle.profile.candidate_id)

            for index, bundle in enumerate(bundles):
                if bundle.source.tenant_id != tenant_id:
                    continue
                source_document_id = source_id_by_sha[bundle.source.document_sha256]
                email = normalize_email(bundle.profile.email)
                candidate_id = (
                    candidate_id_by_email.get(email)
                    or candidate_id_by_source_id.get(source_document_id)
                    or local_candidate_id_by_source_id[source_document_id]
                )
                identity_by_bundle_index[index] = (source_document_id, candidate_id)

        for index in range(len(bundles)):
            identities.append(identity_by_bundle_index[index])
        return identities

    def _rows_for_bundle(self, bundle: ArtifactBundle, source_document_id: str, candidate_id: str) -> tuple[dict[str, list[dict[str, Any]]], int]:
        source_metadata = dataclass_to_dict(bundle.source.metadata)
        metadata_storage_path = str(source_metadata.get("storage_path") or "").strip()
        metadata_source_uri = str(source_metadata.get("source_uri") or "").strip()
        source_storage_path = metadata_storage_path or None
        storage_bytes = 0
        if self.config.sync_originals_to_storage and not source_storage_path:
            source_storage_path = f"{bundle.source.tenant_id}/{source_document_id}/{bundle.source.original_filename}"
            self.upload_file(
                self.config.supabase_storage_bucket,
                source_storage_path,
                bundle.source.source_path,
                bundle.source.mime_type,
            )
            try:
                storage_bytes = Path(bundle.source.source_path).stat().st_size
            except OSError:
                storage_bytes = 0
        rows = build_bundle_rows(
            bundle,
            source_document_id,
            candidate_id,
            source_storage_path=source_storage_path,
            source_uri=metadata_source_uri or self.public_source_uri(bundle.source.source_path),
        )
        return rows, storage_bytes

    def upload_file(self, bucket: str, object_path: str, file_path: str, content_type: str) -> None:
        self._storage.upload_file(bucket, object_path, file_path, content_type)

    def download_file(self, bucket: str, object_path: str, target_path: str) -> None:
        self._storage.download_file(bucket, object_path, target_path)

    def queued_public_job_applications(self, limit: int = 25, retry_stale_minutes: int = 30) -> list[dict[str, Any]]:
        return self._public_applications.queued(limit, retry_stale_minutes)

    def source_document(self, source_document_id: str) -> dict[str, Any] | None:
        return self._public_applications.source_document(source_document_id)

    def update_job_application(self, application_id: str, payload: dict[str, Any]) -> None:
        self._public_applications.update_application(application_id, payload)

    def update_processing_runs_for_source(self, source_document_id: str, payload: dict[str, Any], application_id: str | None = None) -> None:
        self._public_applications.update_processing_runs(
            source_document_id,
            payload,
            application_id,
        )

    def record_job_application_event(self, tenant_id: str, application_id: str, event_type: str, payload: dict[str, Any]) -> None:
        self._public_applications.record_event(
            tenant_id,
            application_id,
            event_type,
            payload,
        )

    def sync_bundle(self, bundle: ArtifactBundle) -> None:
        self.sync_bundles([bundle])

    def refresh_candidate_search_cache(self) -> int:
        result = self._request("POST", "/rest/v1/rpc/refresh_candidate_search_cache_v1", data={})
        try:
            return int(result)
        except (TypeError, ValueError):
            return 0

    def sync_bundles(self, bundles: list[ArtifactBundle]) -> SupabaseSyncStats:
        if not bundles:
            return SupabaseSyncStats()

        rows_by_table: dict[str, list[dict[str, Any]]] = {
            "source_documents": [],
            "candidates": [],
            "candidate_profiles": [],
            "candidate_summaries": [],
            "candidate_skill_map": [],
            "candidate_chunks": [],
            "processing_runs": [],
        }
        storage_bytes = 0
        for bundle, (source_document_id, candidate_id) in zip(bundles, self._resolve_bundle_identities(bundles)):
            bundle_rows, bundle_storage_bytes = self._rows_for_bundle(bundle, source_document_id, candidate_id)
            storage_bytes += bundle_storage_bytes
            for table, rows in bundle_rows.items():
                rows_by_table[table].extend(rows)

        conflict_keys = {
            "source_documents": ("tenant_id", "document_sha256"),
            "candidates": ("id",),
            "candidate_profiles": ("candidate_id",),
            "candidate_summaries": ("candidate_id",),
            "candidate_skill_map": ("tenant_id", "candidate_id", "skill_slug"),
            "candidate_chunks": ("id",),
            "processing_runs": ("tenant_id", "input_hash"),
        }
        rows_by_table = {
            table: dedupe_rows(rows, conflict_keys[table])
            for table, rows in rows_by_table.items()
        }

        estimated_database_bytes = sum(json_payload_size(rows) for rows in rows_by_table.values() if rows)
        tenant_id = bundles[0].source.tenant_id
        warnings = self.capacity_warnings(tenant_id, estimated_database_bytes=estimated_database_bytes, estimated_storage_bytes=storage_bytes)

        self.upsert_many("source_documents", rows_by_table["source_documents"], "tenant_id,document_sha256")
        self.upsert_many("candidates", rows_by_table["candidates"], "id")
        self.upsert_many("candidate_profiles", rows_by_table["candidate_profiles"], "candidate_id")
        self.upsert_many("candidate_summaries", rows_by_table["candidate_summaries"], "candidate_id")
        self.upsert_many("candidate_skill_map", rows_by_table["candidate_skill_map"], "tenant_id,candidate_id,skill_slug")
        self.upsert_many("candidate_chunks", rows_by_table["candidate_chunks"], "id")
        self.upsert_many("processing_runs", rows_by_table["processing_runs"], "tenant_id,input_hash")

        return SupabaseSyncStats(
            bundles=len(bundles),
            table_rows={table: len(rows) for table, rows in rows_by_table.items()},
            storage_bytes=storage_bytes,
            estimated_database_bytes=estimated_database_bytes,
            warnings=warnings,
        )

    def sync_comparison_artifact(self, artifact: ComparisonArtifact, artifact_key: str, query: str = "") -> None:
        query_fingerprint = f"{query.lower().strip()}|{'|'.join(sorted(artifact.candidate_ids))}"
        row = {
            "artifact_key": artifact_key,
            "tenant_id": artifact.tenant_id,
            "candidate_ids": artifact.candidate_ids,
            "query_fingerprint": query_fingerprint,
            "comparison_json": dataclass_to_dict(artifact),
            "artifact_version": artifact.artifact_version,
        }
        self.upsert("comparison_artifacts", [row], "artifact_key")

    def queued_candidate_drafts(self, limit: int = 25, retry_stale_minutes: int = 30) -> list[dict[str, Any]]:
        return self._candidate_drafts.queued(limit, retry_stale_minutes)

    def update_candidate_draft(self, user_id: str, payload: dict[str, Any]) -> None:
        self._candidate_drafts.update_draft(user_id, payload)

    def update_candidate_by_registered_user(self, user_id: str, payload: dict[str, Any]) -> None:
        self._candidate_drafts.update_candidate(user_id, payload)
