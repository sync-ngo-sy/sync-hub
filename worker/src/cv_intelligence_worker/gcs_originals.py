from __future__ import annotations

import re
import tempfile
import time
import urllib.parse
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable


from .config import WorkerConfig
from .gcs_storage import GcsJsonClient
from .manatal import ManatalCandidate, ManatalClient
from .supabase import SupabaseClient
from .utils import format_error_message


@dataclass(frozen=True)
class ManatalOriginalsBackfillResult:
    processed: int = 0
    uploaded: int = 0
    skipped: int = 0
    missing_source: int = 0
    failed: int = 0
    failures: list[dict[str, str]] = field(default_factory=list)
    dry_run: bool = True


def _safe_filename(value: str, fallback: str) -> str:
    name = Path(value or fallback).name.strip()
    name = re.sub(r"[\x00-\x1f/\\]+", "-", name)
    name = re.sub(r"\s+", " ", name).strip(" .")
    return name[:180] or fallback


def _as_metadata(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


class ManatalOriginalsBackfill:
    def __init__(self, config: WorkerConfig) -> None:
        self.config = config
        self.supabase = SupabaseClient(config)
        self.manatal = ManatalClient(config)
        self.gcs = GcsJsonClient(config)

    def _manatal_rows(self, *, offset: int, limit: int) -> list[dict[str, Any]]:
        query = urllib.parse.urlencode(
            {
                "tenant_id": f"eq.{self.config.tenant_id}",
                "source_document_id": "not.is.null",
                "select": "tenant_id,manatal_candidate_id,manatal_full_name,manatal_email,resume_url,source_document_id,resume_sha256,metadata_json",
                "order": "updated_at.asc",
                "limit": str(max(1, limit)),
                "offset": str(max(0, offset)),
            }
        )
        result = self.supabase._request("GET", f"/rest/v1/{self.config.manatal_sync_state_table}?{query}")
        return result if isinstance(result, list) else []

    def _source_documents(self, source_document_ids: list[str]) -> dict[str, dict[str, Any]]:
        if not source_document_ids:
            return {}
        rows: list[dict[str, Any]] = []
        for batch_start in range(0, len(source_document_ids), 100):
            batch = source_document_ids[batch_start : batch_start + 100]
            query = urllib.parse.urlencode(
                {
                    "id": f"in.({','.join(batch)})",
                    "select": "id,tenant_id,candidate_id,original_filename,mime_type,source_uri,storage_path,metadata_json",
                }
            )
            result = self.supabase._request("GET", f"/rest/v1/source_documents?{query}")
            if isinstance(result, list):
                rows.extend(row for row in result if isinstance(row, dict))
        return {str(row.get("id")): row for row in rows if row.get("id")}

    def _update_source_document(self, source: dict[str, Any], manatal_row: dict[str, Any], bucket: str, object_name: str, update_source_uri: bool) -> None:
        metadata = _as_metadata(source.get("metadata_json"))
        manatal_metadata = _as_metadata(manatal_row.get("metadata_json"))
        next_metadata = {
            **metadata,
            "external_source": metadata.get("external_source") or "manatal",
            "manatal_candidate_id": manatal_row.get("manatal_candidate_id"),
            "manatal_full_name": manatal_row.get("manatal_full_name"),
            "manatal_email": manatal_row.get("manatal_email"),
            "manatal_resume_url": manatal_row.get("resume_url") or metadata.get("manatal_resume_url"),
            "manatal_resume_sha256": manatal_row.get("resume_sha256") or metadata.get("manatal_resume_sha256"),
            "manatal_metadata": manatal_metadata,
            "previous_source_uri": metadata.get("previous_source_uri") or source.get("source_uri"),
            "gcs_bucket": bucket,
            "gcs_object": object_name,
            "migrated_to_gcs_from": "manatal",
            "migrated_to_gcs_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        }
        payload: dict[str, Any] = {
            "storage_path": object_name,
            "metadata_json": next_metadata,
        }
        if update_source_uri:
            payload["source_uri"] = f"gs://{bucket}/{object_name}"
        query = urllib.parse.urlencode({"id": f"eq.{source['id']}"})
        self.supabase._request(
            "PATCH",
            f"/rest/v1/source_documents?{query}",
            data=payload,
            headers={"Prefer": "return=minimal"},
        )

    def run(
        self,
        *,
        bucket: str,
        limit: int,
        page_size: int,
        offset: int = 0,
        apply: bool = False,
        force: bool = False,
        update_source_uri: bool = False,
        progress: Callable[[str], None] | None = None,
    ) -> ManatalOriginalsBackfillResult:
        if not self.config.tenant_id:
            raise ValueError("CV_WORKER_TENANT_ID is required.")
        if not bucket:
            raise ValueError("GCS bucket is required.")

        processed = uploaded = skipped = missing_source = failed = 0
        failures: list[dict[str, str]] = []
        current_offset = max(0, offset)

        def emit(message: str) -> None:
            if progress:
                progress(message)

        while True:
            rows = self._manatal_rows(offset=current_offset, limit=page_size)
            if not rows:
                break
            sources = self._source_documents([str(row.get("source_document_id") or "") for row in rows])

            for row in rows:
                if limit and processed >= limit:
                    break
                processed += 1
                manatal_id = str(row.get("manatal_candidate_id") or "")
                source_id = str(row.get("source_document_id") or "")
                source = sources.get(source_id)
                if not source:
                    missing_source += 1
                    emit(f"missing source_document {source_id} for Manatal candidate {manatal_id}")
                    continue
                if source.get("storage_path") and not force:
                    skipped += 1
                    emit(f"skip existing storage_path {source_id} -> {source.get('storage_path')}")
                    continue

                filename = _safe_filename(str(source.get("original_filename") or ""), f"manatal-{manatal_id}.pdf")
                object_name = f"{source['tenant_id']}/{source_id}/{filename}"
                emit(f"{'apply' if apply else 'dry-run'} manatal={manatal_id} source={source_id} gcs=gs://{bucket}/{object_name}")
                if not apply:
                    continue

                try:
                    candidate = ManatalCandidate(
                        id=manatal_id,
                        full_name=str(row.get("manatal_full_name") or ""),
                        email=str(row.get("manatal_email") or ""),
                        # Stored Manatal media URLs are time-limited; call the Manatal
                        # resume endpoint so each backfill run mints a fresh download.
                        resume_url="",
                    )
                    with tempfile.TemporaryDirectory(prefix="manatal-originals-") as tmpdir:
                        resume = self.manatal.download_resume(candidate, Path(tmpdir))
                        if not resume:
                            raise RuntimeError("Manatal candidate did not return a resume.")
                        self.gcs.upload_file(bucket, object_name, resume.path, resume.mime_type or str(source.get("mime_type") or "application/pdf"))
                        self._update_source_document(source, row, bucket, object_name, update_source_uri)
                        uploaded += 1
                except Exception as exc:  # noqa: BLE001
                    failed += 1
                    failures.append({"source_document_id": source_id, "manatal_candidate_id": manatal_id, "error": format_error_message(exc)})
                    emit(f"error source={source_id} manatal={manatal_id}: {exc}")

            if limit and processed >= limit:
                break
            if len(rows) < page_size:
                break
            current_offset += page_size

        return ManatalOriginalsBackfillResult(
            processed=processed,
            uploaded=uploaded,
            skipped=skipped,
            missing_source=missing_source,
            failed=failed,
            failures=failures,
            dry_run=not apply,
        )
