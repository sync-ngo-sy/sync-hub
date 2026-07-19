from __future__ import annotations

import re
import tempfile
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Iterator

from ..config import WorkerConfig
from ..integrations.gcs import GcsJsonClient
from ..integrations.manatal import ManatalCandidate, ManatalClient
from ..integrations.supabase import SupabaseClient
from ..core.errors import format_error_message


Progress = Callable[[str], None]


def _no_progress(_message: str) -> None:
    return None


@dataclass(frozen=True)
class ManatalOriginalsBackfillResult:
    processed: int = 0
    uploaded: int = 0
    skipped: int = 0
    missing_source: int = 0
    failed: int = 0
    failures: list[dict[str, str]] = field(default_factory=list)
    dry_run: bool = True


@dataclass
class BackfillStats:
    processed: int = 0
    uploaded: int = 0
    skipped: int = 0
    missing_source: int = 0
    failed: int = 0
    failures: list[dict[str, str]] = field(default_factory=list)

    def result(self, *, apply: bool) -> ManatalOriginalsBackfillResult:
        return ManatalOriginalsBackfillResult(
            processed=self.processed,
            uploaded=self.uploaded,
            skipped=self.skipped,
            missing_source=self.missing_source,
            failed=self.failed,
            failures=list(self.failures),
            dry_run=not apply,
        )


@dataclass(frozen=True)
class BackfillOptions:
    bucket: str
    limit: int
    page_size: int
    offset: int
    apply: bool
    force: bool
    update_source_uri: bool


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
        progress: Progress | None = None,
    ) -> ManatalOriginalsBackfillResult:
        options = self._validated_options(bucket, limit, page_size, offset, apply, force, update_source_uri)
        stats = BackfillStats()
        emit = progress or _no_progress
        for rows in self._pages(options):
            self._process_page(rows, options, stats, emit)
            if options.limit and stats.processed >= options.limit:
                break
        return stats.result(apply=options.apply)

    def _validated_options(
        self,
        bucket: str,
        limit: int,
        page_size: int,
        offset: int,
        apply: bool,
        force: bool,
        update_source_uri: bool,
    ) -> BackfillOptions:
        if not self.config.tenant_id:
            raise ValueError("CV_WORKER_TENANT_ID is required.")
        if not bucket:
            raise ValueError("GCS bucket is required.")
        if limit < 0:
            raise ValueError("limit cannot be negative.")
        if page_size <= 0:
            raise ValueError("page_size must be positive.")
        if offset < 0:
            raise ValueError("offset cannot be negative.")
        return BackfillOptions(bucket, limit, page_size, offset, apply, force, update_source_uri)

    def _pages(self, options: BackfillOptions) -> Iterator[list[dict[str, Any]]]:
        current_offset = options.offset
        while True:
            rows = self.supabase.manatal_original_source_rows(
                self.config.tenant_id,
                offset=current_offset,
                limit=options.page_size,
            )
            if not rows:
                return
            yield rows
            if len(rows) < options.page_size:
                return
            current_offset += options.page_size

    def _process_page(
        self,
        rows: list[dict[str, Any]],
        options: BackfillOptions,
        stats: BackfillStats,
        emit: Progress,
    ) -> None:
        source_ids = [str(row.get("source_document_id") or "") for row in rows]
        sources = self.supabase.source_documents_by_ids(self.config.tenant_id, source_ids)
        for row in rows:
            if options.limit and stats.processed >= options.limit:
                return
            self._process_row(row, sources, options, stats, emit)

    def _process_row(
        self,
        row: dict[str, Any],
        sources: dict[str, dict[str, Any]],
        options: BackfillOptions,
        stats: BackfillStats,
        emit: Progress,
    ) -> None:
        stats.processed += 1
        manatal_id = str(row.get("manatal_candidate_id") or "")
        source_id = str(row.get("source_document_id") or "")
        source = sources.get(source_id)
        if source is None:
            stats.missing_source += 1
            emit(f"missing source_document {source_id} for Manatal candidate {manatal_id}")
            return
        if source.get("storage_path") and not options.force:
            stats.skipped += 1
            emit(f"skip existing storage_path {source_id} -> {source.get('storage_path')}")
            return

        filename = _safe_filename(str(source.get("original_filename") or ""), f"manatal-{manatal_id}.pdf")
        object_name = f"{self.config.tenant_id}/{source_id}/{filename}"
        emit(f"{'apply' if options.apply else 'dry-run'} manatal={manatal_id} source={source_id} gcs=gs://{options.bucket}/{object_name}")
        if not options.apply:
            return
        try:
            self._upload_original(row, source, manatal_id, object_name, options)
        except Exception as exc:  # noqa: BLE001
            stats.failed += 1
            stats.failures.append(
                {
                    "source_document_id": source_id,
                    "manatal_candidate_id": manatal_id,
                    "error": format_error_message(exc),
                }
            )
            emit(f"error source={source_id} manatal={manatal_id}: {exc}")
            return
        stats.uploaded += 1

    def _upload_original(
        self,
        row: dict[str, Any],
        source: dict[str, Any],
        manatal_id: str,
        object_name: str,
        options: BackfillOptions,
    ) -> None:
        candidate = ManatalCandidate(
            id=manatal_id,
            full_name=str(row.get("manatal_full_name") or ""),
            email=str(row.get("manatal_email") or ""),
        )
        with tempfile.TemporaryDirectory(prefix="manatal-originals-") as tmpdir:
            resume = self.manatal.download_resume(candidate, Path(tmpdir))
            if resume is None:
                raise RuntimeError("Manatal candidate did not return a resume.")
            content_type = resume.mime_type or str(source.get("mime_type") or "application/pdf")
            self.gcs.upload_file(options.bucket, object_name, resume.path, content_type)
        self._update_source_document(source, row, options.bucket, object_name, options.update_source_uri)

    def _update_source_document(
        self,
        source: dict[str, Any],
        manatal_row: dict[str, Any],
        bucket: str,
        object_name: str,
        update_source_uri: bool,
    ) -> None:
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
        payload: dict[str, Any] = {"storage_path": object_name, "metadata_json": next_metadata}
        if update_source_uri:
            payload["source_uri"] = f"gs://{bucket}/{object_name}"
        self.supabase.update_source_document(self.config.tenant_id, str(source["id"]), payload)
