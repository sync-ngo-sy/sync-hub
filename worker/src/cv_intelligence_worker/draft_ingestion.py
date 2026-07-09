from __future__ import annotations

from typing import Callable
from uuid import uuid4

from .config import WorkerConfig
from .pipeline import IngestionPipeline
from .schema import DocumentSource
from .supabase import SupabaseClient


class DraftIngestion:
    def __init__(self, config: WorkerConfig) -> None:
        self.config = config
        self.supabase = SupabaseClient(config)

    def run(self, limit: int = 25, progress: Callable[[str], None] | None = None) -> int:
        drafts = self.supabase.queued_candidate_drafts(limit=limit)
        processed = 0

        def emit(message: str) -> None:
            if progress:
                progress(message)

        for draft in drafts:
            user_id = draft.get("user_id")
            if not user_id:
                continue

            emit(f"processing draft for user {user_id}")
            try:
                self.supabase.update_candidate_draft(user_id, {"parse_status": "parsing"})
            except Exception as db_err:
                emit(f"failed to mark draft {user_id} as parsing: {db_err}")
                continue

            source = DocumentSource(
                tenant_id=self.config.tenant_id or "default",
                source_path=draft.get("cv_storage_path") or f"draft_{user_id}.pdf",
                source_type="candidate_draft",
                original_filename=draft.get("cv_original_filename") or f"draft_{user_id}.pdf",
                mime_type=draft.get("cv_mime_type") or "application/pdf",
                document_id=draft.get("id") or str(uuid4()),
                document_sha256="",
                ingestion_run_id=str(uuid4()),
                uploaded_by=user_id,
                metadata={
                    "is_draft": True,
                    "draft_data": draft,
                },
            )

            pipeline = IngestionPipeline(config=self.config)
            try:
                result = pipeline.ingest_sources(
                    [source],
                    tenant_id=source.tenant_id,
                    uploaded_by=user_id,
                    sync_to_supabase=True,
                    progress=progress,
                )
                if result.failures:
                    raise RuntimeError(result.failures[0].get("error") or "Validation/Ingestion failed")
                try:
                    self.supabase.update_candidate_draft(user_id, {"parse_status": "published"})
                except Exception as db_err:
                    emit(f"failed to mark draft {user_id} as published: {db_err}")
                processed += 1
            except Exception as exc:
                emit(f"failed to process draft {user_id}: {exc}")
                try:
                    self.supabase.update_candidate_draft(user_id, {
                        "parse_status": "failed",
                        "parse_error": str(exc)[:1000]
                    })
                except Exception as db_err:
                    emit(f"failed to record error for draft {user_id}: {db_err}")

        return processed
