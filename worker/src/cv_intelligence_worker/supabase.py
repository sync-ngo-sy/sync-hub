from __future__ import annotations

import json
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable

from .config import WorkerConfig
from .schema import ArtifactBundle, ComparisonArtifact, dataclass_to_dict
from .utils import normalize_email, skill_slugify, slugify, stable_uuid, strip_nul_bytes, urlopen


def _vector_literal(values: list[float]) -> str:
    return "[" + ",".join(f"{value:.8f}" for value in values) + "]"


def _is_jwt(value: str) -> bool:
    return value.count(".") == 2


def _chunks(values: list[Any], size: int) -> Iterable[list[Any]]:
    size = max(1, size)
    for index in range(0, len(values), size):
        yield values[index : index + size]


def _json_payload_size(value: Any) -> int:
    return len(json.dumps(strip_nul_bytes(value), separators=(",", ":"), ensure_ascii=True).encode("utf-8"))


def _dedupe_rows(rows: list[dict[str, Any]], key_fields: tuple[str, ...]) -> list[dict[str, Any]]:
    keyed: dict[tuple[Any, ...], dict[str, Any]] = {}
    for row in rows:
        key = tuple(row.get(field) for field in key_fields)
        keyed[key] = row
    return list(keyed.values())


def _format_bytes(value: int) -> str:
    units = ("B", "KiB", "MiB", "GiB", "TiB")
    size = float(max(0, value))
    for unit in units:
        if size < 1024 or unit == units[-1]:
            return f"{size:.1f} {unit}" if unit != "B" else f"{int(size)} {unit}"
        size /= 1024
    return f"{value} B"


def _bounded_years_experience(value: Any) -> float:
    try:
        years = float(value or 0.0)
    except (TypeError, ValueError):
        return 0.0
    return round(max(0.0, min(80.0, years)), 2)


def _is_retryable_supabase_error(error: Exception) -> bool:
    message = str(error).lower()
    return any(
        marker in message
        for marker in (
            "57014",
            "statement timeout",
            "timeout",
            "temporarily unavailable",
            "connection reset",
        )
    )


@dataclass(frozen=True)
class SupabaseCapacitySnapshot:
    database_bytes: int = 0
    storage_bytes: int = 0
    table_counts: dict[str, int] = field(default_factory=dict)
    source: str = "unavailable"


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
        self.base_url = config.supabase_url.rstrip("/")

    def _headers(self, extra: dict[str, str] | None = None) -> dict[str, str]:
        api_key = self.config.supabase_api_key()
        bearer_token = self.config.supabase_bearer_token()
        headers = {
            "apikey": api_key,
            "Content-Type": "application/json",
            "User-Agent": self.config.user_agent,
        }
        if _is_jwt(bearer_token):
            headers["Authorization"] = f"Bearer {bearer_token}"
        if extra:
            headers.update(extra)
        return headers

    def _request_with_headers(self, method: str, path: str, *, data: Any | None = None, headers: dict[str, str] | None = None) -> tuple[Any, dict[str, str]]:
        body = None
        if data is not None:
            body = json.dumps(strip_nul_bytes(data)).encode("utf-8")
        request = urllib.request.Request(
            f"{self.base_url}{path}",
            data=body,
            headers=self._headers(headers),
            method=method,
        )
        try:
            with urlopen(request, timeout=self.config.request_timeout_seconds) as response:
                content = response.read().decode("utf-8")
                response_headers = dict(response.headers.items())
        except urllib.error.HTTPError as exc:
            content = exc.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"Supabase {method} {path} failed ({exc.code}): {content or exc.reason}") from exc
        return (json.loads(content) if content else None), response_headers

    def _request(self, method: str, path: str, *, data: Any | None = None, headers: dict[str, str] | None = None) -> Any:
        result, _headers = self._request_with_headers(method, path, data=data, headers=headers)
        return result

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

    def _upsert_batch_with_retry(self, table: str, rows: list[dict[str, Any]], on_conflict: str, attempt: int = 1) -> None:
        try:
            self.upsert(table, rows, on_conflict)
            return
        except RuntimeError as exc:
            if not _is_retryable_supabase_error(exc):
                raise
            if len(rows) > 1:
                midpoint = max(1, len(rows) // 2)
                self._upsert_batch_with_retry(table, rows[:midpoint], on_conflict, attempt=attempt)
                self._upsert_batch_with_retry(table, rows[midpoint:], on_conflict, attempt=attempt)
                return
            if attempt >= 3:
                raise
            time.sleep(0.5 * attempt)
            self._upsert_batch_with_retry(table, rows, on_conflict, attempt=attempt + 1)

    def upsert_many(self, table: str, rows: list[dict[str, Any]], on_conflict: str, batch_size: int | None = None) -> int:
        for batch in _chunks(rows, batch_size or self.config.supabase_batch_size):
            self._upsert_batch_with_retry(table, batch, on_conflict)
        return len(rows)

    def _select_in(self, table: str, tenant_id: str, column: str, values: list[str], select: str) -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = []
        unique_values = sorted({value for value in values if value})
        for batch in _chunks(unique_values, 100):
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
        rows = self._select_in(
            self.config.manatal_sync_state_table,
            tenant_id,
            "manatal_candidate_id",
            manatal_candidate_ids,
            "tenant_id,manatal_candidate_id,manatal_updated_at,manatal_full_name,manatal_email,resume_url,resume_sha256,source_document_id,sync_status,last_synced_at,error_message,metadata_json",
        )
        return {
            str(row.get("manatal_candidate_id")): row
            for row in rows
            if row.get("manatal_candidate_id")
        }

    def upsert_manatal_sync_states(self, rows: list[dict[str, Any]]) -> int:
        return self.upsert_many(
            self.config.manatal_sync_state_table,
            rows,
            "tenant_id,manatal_candidate_id",
        )

    def pending_manatal_candidate_ids(self, tenant_id: str, limit: int = 100) -> list[str]:
        query = urllib.parse.urlencode(
            {
                "tenant_id": f"eq.{tenant_id}",
                "sync_status": "eq.pending",
                "select": "manatal_candidate_id",
                "order": "updated_at.asc",
                "limit": str(max(1, limit)),
            }
        )
        result = self._request("GET", f"/rest/v1/{self.config.manatal_sync_state_table}?{query}")
        if not isinstance(result, list):
            return []
        return [
            str(row.get("manatal_candidate_id"))
            for row in result
            if isinstance(row, dict) and row.get("manatal_candidate_id")
        ]

    def _count_table(self, table: str, tenant_id: str | None = None) -> int:
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

    def capacity_snapshot(self, tenant_id: str | None = None) -> SupabaseCapacitySnapshot:
        try:
            payload = {"p_tenant_id": tenant_id, "p_storage_bucket": self.config.supabase_storage_bucket} if tenant_id else {"p_storage_bucket": self.config.supabase_storage_bucket}
            result = self._request("POST", "/rest/v1/rpc/ingestion_capacity_snapshot_v1", data=payload)
            row = result[0] if isinstance(result, list) and result else result if isinstance(result, dict) else {}
            if isinstance(row, dict):
                table_counts = row.get("table_counts")
                return SupabaseCapacitySnapshot(
                    database_bytes=int(row.get("database_bytes") or 0),
                    storage_bytes=int(row.get("storage_bytes") or 0),
                    table_counts=dict(table_counts) if isinstance(table_counts, dict) else {},
                    source="rpc",
                )
        except RuntimeError:
            pass

        tables = ["source_documents", "candidates", "candidate_profiles", "candidate_summaries", "candidate_skill_map", "candidate_chunks", "processing_runs"]
        counts: dict[str, int] = {}
        for table in tables:
            try:
                counts[table] = self._count_table(table, tenant_id=tenant_id)
            except RuntimeError:
                counts[table] = 0
        return SupabaseCapacitySnapshot(table_counts=counts, source="rest-counts")

    def capacity_warnings(self, tenant_id: str, estimated_database_bytes: int = 0, estimated_storage_bytes: int = 0) -> list[str]:
        warnings: list[str] = []
        threshold = max(0.0, min(1.0, self.config.supabase_limit_warning_threshold))
        snapshot = self.capacity_snapshot(tenant_id)
        if self.config.supabase_database_limit_bytes and snapshot.database_bytes:
            projected_database_bytes = snapshot.database_bytes + int(estimated_database_bytes * max(1.0, self.config.supabase_database_expansion_factor))
            ratio = projected_database_bytes / self.config.supabase_database_limit_bytes
            if ratio >= threshold:
                warnings.append(
                    "Supabase database usage is near the configured limit: "
                    f"projected {_format_bytes(projected_database_bytes)} of {_format_bytes(self.config.supabase_database_limit_bytes)} "
                    f"({ratio:.1%}, source={snapshot.source})."
                )
        if self.config.supabase_storage_limit_bytes:
            projected_storage_bytes = snapshot.storage_bytes + estimated_storage_bytes
            if projected_storage_bytes:
                ratio = projected_storage_bytes / self.config.supabase_storage_limit_bytes
                if ratio >= threshold:
                    warnings.append(
                        "Supabase storage usage is near the configured limit: "
                        f"projected {_format_bytes(projected_storage_bytes)} of {_format_bytes(self.config.supabase_storage_limit_bytes)} "
                        f"({ratio:.1%}, source={snapshot.source})."
                    )
        if snapshot.source == "rest-counts":
            warnings.append("Supabase capacity RPC is not available; limit checks used table counts only and cannot read exact database or storage size.")
        return warnings

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
        candidate_email = normalize_email(bundle.profile.email)
        source_storage_path = None
        storage_bytes = 0
        if self.config.sync_originals_to_storage:
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

        profile_payload = dataclass_to_dict(bundle.profile)
        profile_payload["candidate_id"] = candidate_id
        profile_payload["source_document_id"] = source_document_id
        profile_payload["email"] = candidate_email
        profile_payload["years_experience"] = _bounded_years_experience(profile_payload.get("years_experience"))
        profile_payload.pop("raw_text", None)

        source_document = {
            "id": source_document_id,
            "tenant_id": bundle.source.tenant_id,
            "candidate_id": candidate_id,
            "source_type": bundle.source.source_type,
            "original_filename": bundle.source.original_filename,
            "mime_type": bundle.source.mime_type,
            "document_sha256": bundle.source.document_sha256,
            "source_uri": self.public_source_uri(bundle.source.source_path),
            "storage_path": source_storage_path,
            "uploaded_by": bundle.source.uploaded_by,
            "metadata_json": dataclass_to_dict(bundle.source.metadata),
        }
        candidate = {
            "id": candidate_id,
            "tenant_id": bundle.profile.tenant_id,
            "name": bundle.profile.name,
            "headline": bundle.profile.headline,
            "current_title": bundle.profile.current_title,
            "location": bundle.profile.location,
            "years_experience": _bounded_years_experience(bundle.profile.years_experience),
            "seniority": bundle.profile.seniority,
            "primary_role": bundle.profile.role_tags[0] if bundle.profile.role_tags else None,
            "top_skills": bundle.profile.skills,
            "email": candidate_email,
            "phone": bundle.profile.phone,
            "links": bundle.profile.links,
            "latest_document_id": source_document_id,
            "summary_short": bundle.summary.short_summary,
            "status": "completed",
            "metadata_json": bundle.profile.metadata,
            "parse_version": bundle.document_text.parser_version,
            "normalization_version": bundle.processing_run.chunk_version,
            "embedding_version": bundle.processing_run.embedding_version,
            "artifact_version": bundle.summary.artifact_version,
        }
        profile = {
            "candidate_id": candidate_id,
            "tenant_id": bundle.profile.tenant_id,
            "source_document_id": source_document_id,
            "profile_json": profile_payload,
            "timeline_json": dataclass_to_dict(bundle.profile.experience),
            "skill_matrix_json": {
                "skills": [{"skill": skill, "aliases": bundle.profile.skill_aliases.get(skill, []), "confidence": bundle.profile.confidence} for skill in bundle.profile.skills]
            },
            "raw_text": bundle.document_text.raw_text,
            "confidence": bundle.profile.confidence,
            "missing_fields": bundle.profile.missing_fields,
            "parse_warnings": bundle.profile.parse_warnings,
        }
        summary = {
            "candidate_id": candidate_id,
            "tenant_id": bundle.profile.tenant_id,
            "short_summary": bundle.summary.short_summary,
            "long_summary": bundle.summary.long_summary,
            "strengths": bundle.summary.strengths,
            "risks": bundle.summary.risks,
            "recommended_roles": bundle.summary.recommended_roles,
            "evidence_refs": bundle.summary.evidence_refs,
            "confidence": bundle.summary.confidence,
            "artifact_version": bundle.summary.artifact_version,
        }
        skill_rows = []
        seen_skill_slugs: set[str] = set()
        for skill in bundle.profile.skills:
            skill_slug = skill_slugify(skill)
            if not skill_slug or skill_slug in seen_skill_slugs:
                continue
            seen_skill_slugs.add(skill_slug)
            skill_rows.append(
                {
                    "id": stable_uuid(bundle.profile.tenant_id, candidate_id, skill_slug),
                    "tenant_id": bundle.profile.tenant_id,
                    "candidate_id": candidate_id,
                    "skill_slug": skill_slug,
                    "canonical_skill": skill,
                    "evidence": {"aliases": bundle.profile.skill_aliases.get(skill, [])},
                }
            )
        chunk_rows = []
        for chunk, embedding in zip(bundle.chunks, bundle.embeddings):
            chunk_rows.append(
                {
                    "id": stable_uuid(candidate_id, source_document_id, chunk.chunk_type, str(chunk.chunk_index), chunk.text[:120]),
                    "tenant_id": chunk.tenant_id,
                    "candidate_id": candidate_id,
                    "source_document_id": source_document_id,
                    "chunk_type": chunk.chunk_type,
                    "section_name": chunk.section_name,
                    "chunk_index": chunk.chunk_index,
                    "text": chunk.text,
                    "token_count": chunk.token_count,
                    "source_span": chunk.source_span,
                    "metadata_json": chunk.metadata,
                    "embedding": _vector_literal(embedding.embedding),
                    "embedding_version": embedding.embedding_version,
                    "parse_version": bundle.document_text.parser_version,
                    "normalization_version": bundle.processing_run.chunk_version,
                    "source_hash": bundle.source.document_sha256,
                    "is_active": chunk.is_active,
                }
            )
        processing_run = {
            "id": stable_uuid(bundle.processing_run.tenant_id, bundle.processing_run.ingestion_run_id, source_document_id),
            "tenant_id": bundle.processing_run.tenant_id,
            "candidate_id": candidate_id,
            "source_document_id": source_document_id,
            "ingestion_run_id": bundle.processing_run.ingestion_run_id,
            "status": bundle.processing_run.status,
            "input_hash": bundle.processing_run.input_hash,
            "source_path": bundle.processing_run.source_path,
            "source_sha256": bundle.processing_run.source_sha256,
            "parser_version": bundle.processing_run.parser_version,
            "model_version": bundle.processing_run.model_version,
            "prompt_version": bundle.processing_run.prompt_version,
            "chunk_version": bundle.processing_run.chunk_version,
            "embedding_version": bundle.processing_run.embedding_version,
            "warnings": bundle.processing_run.warnings,
            "error_code": bundle.processing_run.error_code,
            "error_message": bundle.processing_run.error_message,
            "metadata_json": bundle.processing_run.metadata,
        }
        return {
            "source_documents": [source_document],
            "candidates": [candidate],
            "candidate_profiles": [profile],
            "candidate_summaries": [summary],
            "candidate_skill_map": skill_rows,
            "candidate_chunks": chunk_rows,
            "processing_runs": [processing_run],
        }, storage_bytes

    def upload_file(self, bucket: str, object_path: str, file_path: str, content_type: str) -> None:
        data = Path(file_path).read_bytes()
        api_key = self.config.supabase_api_key()
        bearer_token = self.config.supabase_bearer_token()
        headers = {
            "apikey": api_key,
            "Content-Type": content_type,
            "x-upsert": "true",
        }
        if _is_jwt(bearer_token):
            headers["Authorization"] = f"Bearer {bearer_token}"
        request = urllib.request.Request(
            f"{self.base_url}/storage/v1/object/{bucket}/{urllib.parse.quote(object_path)}",
            data=data,
            headers=headers,
            method="POST",
        )
        try:
            with urlopen(request, timeout=self.config.request_timeout_seconds):
                return
        except urllib.error.HTTPError as exc:
            if exc.code == 409:
                return
            content = exc.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"Supabase storage upload failed ({exc.code}): {content or exc.reason}") from exc

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
            table: _dedupe_rows(rows, conflict_keys[table])
            for table, rows in rows_by_table.items()
        }

        estimated_database_bytes = sum(_json_payload_size(rows) for rows in rows_by_table.values() if rows)
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
