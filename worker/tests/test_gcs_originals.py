from __future__ import annotations

from pathlib import Path
from unittest.mock import Mock, patch

import pytest

from cv_intelligence_worker.config import WorkerConfig
from cv_intelligence_worker.integrations.manatal import ManatalCandidate, ManatalResumeDownload
from cv_intelligence_worker.workflows import ManatalOriginalsBackfill


@pytest.fixture
def backfill() -> ManatalOriginalsBackfill:
    with (
        patch("cv_intelligence_worker.workflows.manatal_originals.SupabaseClient"),
        patch("cv_intelligence_worker.workflows.manatal_originals.ManatalClient"),
        patch("cv_intelligence_worker.workflows.manatal_originals.GcsJsonClient"),
    ):
        return ManatalOriginalsBackfill(WorkerConfig(tenant_id="tenant-1"))


def _row() -> dict[str, object]:
    return {
        "source_document_id": "source-1",
        "manatal_candidate_id": "candidate-1",
        "manatal_full_name": "Jane Doe",
        "manatal_email": "jane@example.com",
    }


def _source() -> dict[str, object]:
    return {
        "id": "source-1",
        "tenant_id": "tenant-1",
        "original_filename": "Jane Doe.pdf",
        "mime_type": "application/pdf",
        "metadata_json": {},
        "source_uri": "https://example.test/resume",
        "storage_path": None,
    }


def test_dry_run_does_not_download_or_mutate(backfill: ManatalOriginalsBackfill) -> None:
    backfill.supabase.manatal_original_source_rows.side_effect = [[_row()], []]
    backfill.supabase.source_documents_by_ids.return_value = {"source-1": _source()}

    result = backfill.run(bucket="resumes", limit=0, page_size=1)

    assert result.processed == 1
    assert result.uploaded == 0
    assert result.dry_run is True
    backfill.manatal.download_resume.assert_not_called()
    backfill.supabase.update_source_document.assert_not_called()


def test_apply_uploads_and_updates_source(backfill: ManatalOriginalsBackfill, tmp_path: Path) -> None:
    row = _row()
    source = _source()
    resume_path = tmp_path / "resume.pdf"
    resume_path.write_bytes(b"pdf")
    backfill.supabase.manatal_original_source_rows.return_value = [row]
    backfill.supabase.source_documents_by_ids.return_value = {"source-1": source}
    backfill.manatal.download_resume.return_value = ManatalResumeDownload(
        candidate=ManatalCandidate(id="candidate-1"),
        path=resume_path,
        sha256="sha",
        mime_type="application/pdf",
        resume_url="https://example.test/resume",
    )

    result = backfill.run(bucket="resumes", limit=1, page_size=10, apply=True, update_source_uri=True)

    assert result.uploaded == 1
    assert result.dry_run is False
    backfill.gcs.upload_file.assert_called_once_with(
        "resumes",
        "tenant-1/source-1/Jane Doe.pdf",
        resume_path,
        "application/pdf",
    )
    payload = backfill.supabase.update_source_document.call_args.args[2]
    assert payload["source_uri"] == "gs://resumes/tenant-1/source-1/Jane Doe.pdf"


def test_apply_isolates_download_failure(backfill: ManatalOriginalsBackfill) -> None:
    backfill.supabase.manatal_original_source_rows.return_value = [_row()]
    backfill.supabase.source_documents_by_ids.return_value = {"source-1": _source()}
    backfill.manatal.download_resume.side_effect = RuntimeError("download failed")
    progress = Mock()

    result = backfill.run(bucket="resumes", limit=1, page_size=10, apply=True, progress=progress)

    assert result.failed == 1
    assert result.failures[0]["error"] == "RuntimeError: download failed"
    backfill.gcs.upload_file.assert_not_called()
    assert progress.called


@pytest.mark.parametrize(
    ("changes", "message"),
    [
        ({"tenant_id": ""}, "CV_WORKER_TENANT_ID"),
        ({"bucket": ""}, "GCS bucket"),
        ({"limit": -1}, "limit cannot be negative"),
        ({"page_size": 0}, "page_size must be positive"),
        ({"offset": -1}, "offset cannot be negative"),
    ],
)
def test_invalid_options_fail_before_io(backfill: ManatalOriginalsBackfill, changes: dict[str, object], message: str) -> None:
    if "tenant_id" in changes:
        backfill.config = WorkerConfig(tenant_id=str(changes["tenant_id"]))
    options = {"bucket": "resumes", "limit": 0, "page_size": 10, "offset": 0, **{key: value for key, value in changes.items() if key != "tenant_id"}}

    with pytest.raises(ValueError, match=message):
        backfill.run(**options)

    backfill.supabase.manatal_original_source_rows.assert_not_called()
