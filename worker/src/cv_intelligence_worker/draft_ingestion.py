from __future__ import annotations

import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable
from uuid import uuid4

from .config import WorkerConfig
from .pipeline import IngestionPipeline
from .schema import DocumentSource
from .supabase import SupabaseClient


Progress = Callable[[str], None]


def _no_progress(_message: str) -> None:
    return None


class DraftIngestion:
    def __init__(self, config: WorkerConfig) -> None:
        self.config = config
        self.supabase = SupabaseClient(config)

    def run(
        self,
        limit: int = 25,
        retry_stale_minutes: int = 30,
        progress: Progress | None = None,
    ) -> int:
        drafts = self.supabase.queued_candidate_drafts(limit=limit, retry_stale_minutes=retry_stale_minutes)
        emit = progress or _no_progress
        return sum(self._process_draft(draft, emit) for draft in drafts)

    def _process_draft(self, draft: dict[str, Any], emit: Progress) -> bool:
        user_id = draft.get("user_id")
        if not isinstance(user_id, str) or not user_id:
            return False
        emit(f"processing draft for user {user_id}")
        if not self._mark_parsing(user_id, emit):
            return False

        local_path: str | None = None
        try:
            local_path = self._download_cv(draft)
            source = self._build_source(draft, user_id, local_path)
            self._ingest(source, user_id, emit)
            self._publish_candidate(user_id, emit)
            self._mark_published(user_id, emit)
            return True
        except Exception as exc:  # noqa: BLE001
            emit(f"failed to process draft {user_id}: {exc}")
            self._record_failure(user_id, exc, emit)
            return False
        finally:
            self._delete_temp_file(local_path)

    def _mark_parsing(self, user_id: str, emit: Progress) -> bool:
        try:
            self.supabase.update_candidate_draft(user_id, {"parse_status": "parsing"})
        except Exception as exc:  # noqa: BLE001
            emit(f"failed to mark draft {user_id} as parsing: {exc}")
            return False
        return True

    def _download_cv(self, draft: dict[str, Any]) -> str | None:
        storage_path = draft.get("cv_storage_path")
        if not isinstance(storage_path, str) or not storage_path:
            return None
        bucket = self.config.supabase_storage_bucket
        if bucket == "cv-originals" or not bucket:
            bucket = "candidate-cvs"
        suffix = os.path.splitext(storage_path)[1] or ".pdf"
        file_descriptor, local_path = tempfile.mkstemp(suffix=suffix)
        os.close(file_descriptor)
        try:
            self.supabase.download_file(bucket, storage_path, local_path)
        except Exception:
            self._delete_temp_file(local_path)
            raise
        return local_path

    def _build_source(self, draft: dict[str, Any], user_id: str, local_path: str | None) -> DocumentSource:
        return DocumentSource(
            tenant_id=self.config.tenant_id or "default",
            source_path=local_path or f"draft_{user_id}.pdf",
            source_type="candidate_draft",
            original_filename=draft.get("cv_original_filename") or f"draft_{user_id}.pdf",
            mime_type=draft.get("cv_mime_type") or "application/pdf",
            document_id=draft.get("id") or str(uuid4()),
            document_sha256="",
            ingestion_run_id=str(uuid4()),
            uploaded_by=user_id,
            metadata={"is_draft": True, "draft_data": draft},
        )

    def _ingest(self, source: DocumentSource, user_id: str, emit: Progress) -> None:
        result = IngestionPipeline(config=self.config).ingest_sources(
            [source],
            tenant_id=source.tenant_id,
            uploaded_by=user_id,
            sync_to_supabase=True,
            progress=emit,
        )
        if result.failures:
            raise RuntimeError(result.failures[0].get("error") or "Validation/Ingestion failed")

    def _publish_candidate(self, user_id: str, emit: Progress) -> None:
        try:
            self.supabase.update_candidate_by_registered_user(
                user_id=user_id,
                payload={
                    "registered_user_id": user_id,
                    "is_published": True,
                    "published_at": datetime.now(timezone.utc).isoformat(),
                },
            )
        except Exception as exc:  # noqa: BLE001
            emit(f"warning: could not set registration fields on candidates row for {user_id}: {exc}")

    def _mark_published(self, user_id: str, emit: Progress) -> None:
        try:
            self.supabase.update_candidate_draft(user_id, {"parse_status": "published"})
        except Exception as exc:  # noqa: BLE001
            emit(f"failed to mark draft {user_id} as published: {exc}")

    def _record_failure(self, user_id: str, error: Exception, emit: Progress) -> None:
        try:
            self.supabase.update_candidate_draft(
                user_id,
                {"parse_status": "failed", "parse_error": str(error)[:1000]},
            )
        except Exception as exc:  # noqa: BLE001
            emit(f"failed to record error for draft {user_id}: {exc}")

    @staticmethod
    def _delete_temp_file(local_path: str | None) -> None:
        if not local_path:
            return
        try:
            Path(local_path).unlink(missing_ok=True)
        except OSError:
            return
