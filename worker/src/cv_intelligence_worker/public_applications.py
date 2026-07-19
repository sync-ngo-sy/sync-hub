from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable
from uuid import uuid4


from .config import WorkerConfig
from .discovery import compute_sha256, guess_mime_type, stable_document_id
from .pipeline import IngestionPipeline
from .schema import DocumentSource
from .supabase import SupabaseClient
from .utils import format_error_message


@dataclass(frozen=True)
class PublicApplicationIngestionResult:
    queued: int = 0
    parsed: int = 0
    failed: int = 0
    application_ids: list[str] = field(default_factory=list)
    candidate_ids: list[str] = field(default_factory=list)
    failures: list[dict[str, str]] = field(default_factory=list)


@dataclass(frozen=True)
class _ApplicationContext:
    application_id: str
    tenant_id: str
    source_document_id: str

    @classmethod
    def from_record(cls, application: dict[str, object]) -> _ApplicationContext:
        return cls(
            application_id=str(application.get("id") or ""),
            tenant_id=str(application.get("tenant_id") or ""),
            source_document_id=str(application.get("resume_source_document_id") or ""),
        )


def _safe_filename(value: str, fallback: str) -> str:
    name = Path(value or fallback).name.strip()
    return name or fallback


class PublicApplicationIngestion:
    def __init__(self, config: WorkerConfig) -> None:
        if not config.has_supabase_http_credentials():
            raise ValueError("Supabase credentials are required to ingest public applications.")
        self.config = config
        self.supabase = SupabaseClient(config)

    def _download_application_cv(self, application: dict[str, object], work_dir: Path) -> Path:
        application_id = str(application.get("id") or "")
        storage_path = str(application.get("resume_storage_path") or "")
        original_filename = _safe_filename(str(application.get("resume_original_filename") or ""), f"{application_id}.pdf")
        if not application_id or not storage_path:
            raise ValueError("queued application is missing id or resume_storage_path")
        target = work_dir / application_id / original_filename
        self.supabase.download_file(self.config.supabase_storage_bucket, storage_path, str(target))
        return target

    def _source_for_application(self, application: dict[str, object], local_path: Path) -> DocumentSource:
        tenant_id = str(application.get("tenant_id") or "")
        application_id = str(application.get("id") or "")
        storage_path = str(application.get("resume_storage_path") or "")
        source_document_id = str(application.get("resume_source_document_id") or "")
        document_sha256 = compute_sha256(local_path)
        source_document_id = source_document_id or stable_document_id(tenant_id, storage_path, document_sha256)
        return DocumentSource(
            tenant_id=tenant_id,
            source_path=str(local_path),
            source_type="public_job_application",
            original_filename=local_path.name,
            mime_type=guess_mime_type(local_path),
            document_id=source_document_id,
            document_sha256=document_sha256,
            ingestion_run_id=str(uuid4()),
            uploaded_by="public-job-board",
            metadata={
                "source": "public_job_application",
                "job_application_id": application_id,
                "storage_bucket": self.config.supabase_storage_bucket,
                "storage_path": storage_path,
                "source_uri": f"supabase://{self.config.supabase_storage_bucket}/{storage_path}",
                "candidate_hub_visibility": str(application.get("candidate_hub_visibility") or "platform"),
            },
        )

    def _ingest_application(
        self,
        application: dict[str, object],
        context: _ApplicationContext,
        work_dir: Path,
        progress: Callable[[str], None] | None,
    ) -> str:
        if progress:
            progress(f"parsing public application {context.application_id}")
        self.supabase.update_job_application(
            context.application_id,
            {
                "resume_ingestion_status": "parsing",
                "resume_ingestion_error": None,
            },
        )
        if context.source_document_id:
            self.supabase.update_processing_runs_for_source(
                context.source_document_id,
                {"status": "parsing"},
                application_id=context.application_id,
            )

        local_path = self._download_application_cv(application, work_dir)
        source = self._source_for_application(application, local_path)
        result = IngestionPipeline(config=self.config).ingest_sources(
            [source],
            tenant_id=context.tenant_id,
            uploaded_by="public-job-board",
            sync_to_supabase=True,
            progress=progress,
        )
        if result.failures:
            raise RuntimeError(result.failures[0].get("error") or "CV parsing failed.")

        source_document = self.supabase.source_document(source.document_id)
        candidate_id = str((source_document or {}).get("candidate_id") or "")
        if not candidate_id:
            raise RuntimeError("CV parsed, but no candidate was linked to the source document.")
        self._mark_parsed(context, source.document_id, candidate_id)
        return candidate_id

    def _mark_parsed(self, context: _ApplicationContext, source_document_id: str, candidate_id: str) -> None:
        self.supabase.update_job_application(
            context.application_id,
            {
                "candidate_id": candidate_id,
                "candidate_source_tenant_id": context.tenant_id,
                "resume_ingestion_status": "parsed",
                "resume_ingestion_error": None,
            },
        )
        self.supabase.update_processing_runs_for_source(
            source_document_id,
            {"candidate_id": candidate_id, "status": "completed"},
            application_id=context.application_id,
        )
        self.supabase.record_job_application_event(
            context.tenant_id,
            context.application_id,
            "CV_INGESTION_PARSED",
            {"candidate_id": candidate_id, "source_document_id": source_document_id},
        )

    def _mark_failed(self, context: _ApplicationContext, message: str) -> None:
        if context.application_id:
            self.supabase.update_job_application(
                context.application_id,
                {
                    "resume_ingestion_status": "failed",
                    "resume_ingestion_error": message[:1000],
                },
            )

    def _failure_result(self, context: _ApplicationContext, exc: Exception) -> dict[str, str]:
        message = format_error_message(exc)
        failure = {"application_id": context.application_id, "error": message}
        try:
            self._mark_failed(context, message)
        except Exception as reporting_exc:  # noqa: BLE001
            failure["reporting_error"] = format_error_message(reporting_exc)
        return failure
        if context.source_document_id:
            self.supabase.update_processing_runs_for_source(
                context.source_document_id,
                {
                    "status": "failed",
                    "error_code": "public_application_ingestion_failed",
                    "error_message": message[:1000],
                },
                application_id=context.application_id,
            )
        if context.tenant_id and context.application_id:
            self.supabase.record_job_application_event(
                context.tenant_id,
                context.application_id,
                "CV_INGESTION_FAILED",
                {
                    "error": message[:1000],
                    "source_document_id": context.source_document_id or None,
                },
            )

    def run(
        self,
        limit: int = 25,
        retry_stale_minutes: int = 30,
        progress: Callable[[str], None] | None = None,
    ) -> PublicApplicationIngestionResult:
        queued = self.supabase.queued_public_job_applications(limit=limit, retry_stale_minutes=retry_stale_minutes)
        parsed = 0
        failed = 0
        candidate_ids: list[str] = []
        failures: list[dict[str, str]] = []
        application_ids: list[str] = []
        work_dir = self.config.cache_path() / "public_application_uploads"

        for application in queued:
            context = _ApplicationContext.from_record(application)
            application_ids.append(context.application_id)
            try:
                candidate_id = self._ingest_application(application, context, work_dir, progress)
                candidate_ids.append(candidate_id)
                parsed += 1
            except Exception as exc:  # noqa: BLE001
                failed += 1
                failures.append(self._failure_result(context, exc))

        return PublicApplicationIngestionResult(
            queued=len(queued),
            parsed=parsed,
            failed=failed,
            application_ids=application_ids,
            candidate_ids=candidate_ids,
            failures=failures,
        )
