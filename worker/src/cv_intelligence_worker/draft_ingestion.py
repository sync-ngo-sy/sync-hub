from __future__ import annotations

import os
import tempfile
from datetime import datetime, timezone
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

    def run(
        self,
        limit: int = 25,
        retry_stale_minutes: int = 30,
        progress: Callable[[str], None] | None = None,
    ) -> int:
        drafts = self.supabase.queued_candidate_drafts(limit=limit, retry_stale_minutes=retry_stale_minutes)
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

            storage_path = draft.get("cv_storage_path")
            local_tmp_path = None
            if storage_path:
                bucket = self.config.supabase_storage_bucket
                if bucket == "cv-originals" or not bucket:
                    bucket = "candidate-cvs"

                _, ext = os.path.splitext(storage_path)
                fd, local_tmp_path = tempfile.mkstemp(suffix=ext or ".pdf")
                os.close(fd)
                try:
                    self.supabase.download_file(bucket, storage_path, local_tmp_path)
                except Exception as dl_err:
                    emit(f"failed to download CV from storage for user {user_id}: {dl_err}")
                    continue

            source = DocumentSource(
                tenant_id=self.config.tenant_id or "default",
                source_path=local_tmp_path or f"draft_{user_id}.pdf",
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

                # Bug#5: set registration fields on the candidates row.
                # Find the candidate that was just written — it is keyed by
                # uploaded_by (user_id) since that is what the pipeline uses as
                # the stable identity for a self-registered candidate.
                now_iso = datetime.now(timezone.utc).isoformat()
                try:
                    self.supabase.update_candidate_by_registered_user(
                        user_id=user_id,
                        payload={
                            "registered_user_id": user_id,
                            "is_published": True,
                            "published_at": now_iso,
                        },
                    )
                except Exception as patch_err:
                    emit(f"warning: could not set registration fields on candidates row for {user_id}: {patch_err}")

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
            finally:
                if local_tmp_path and os.path.exists(local_tmp_path):
                    try:
                        os.remove(local_tmp_path)
                    except OSError:
                        pass

        return processed
