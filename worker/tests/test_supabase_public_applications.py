from __future__ import annotations

from unittest.mock import MagicMock

from cv_intelligence_worker.integrations.supabase.public_applications import (
    PublicApplicationRepository,
)


def _application_row() -> dict[str, object]:
    return {
        "id": "application-1",
        "tenant_id": "tenant-1",
        "job_posting_id": "job-1",
        "resume_storage_path": "tenant-1/resume.pdf",
        "resume_original_filename": "resume.pdf",
        "resume_source_document_id": None,
        "candidate_hub_visibility": "tenant",
        "resume_ingestion_status": "queued",
        "submitted_at": "2026-07-19T12:00:00Z",
        "updated_at": "2026-07-19T12:00:00Z",
    }


def test_queued_applications_are_validated() -> None:
    row = _application_row()
    request = MagicMock(return_value=[row])
    repository = PublicApplicationRepository(request)

    assert repository.queued(limit=5, retry_stale_minutes=0) == [row]

    method, path = request.call_args.args
    assert method == "GET"
    assert "limit=5" in path
    assert "resume_ingestion_status=eq.queued" in path


def test_processing_run_update_can_be_scoped_to_application() -> None:
    request = MagicMock()
    repository = PublicApplicationRepository(request)

    repository.update_processing_runs(
        "source-1",
        {"status": "completed"},
        "application-1",
    )

    method, path = request.call_args.args
    assert method == "PATCH"
    assert "source_document_id=eq.source-1" in path
    assert "metadata_json-%3E%3Ejob_application_id=eq.application-1" in path
    assert request.call_args.kwargs == {
        "data": {"status": "completed"},
        "headers": {"Prefer": "return=minimal"},
    }


def test_event_write_uses_expected_audit_shape() -> None:
    request = MagicMock()
    repository = PublicApplicationRepository(request)

    repository.record_event(
        "tenant-1",
        "application-1",
        "CV_INGESTION_COMPLETED",
        {"candidate_id": "candidate-1"},
    )

    request.assert_called_once_with(
        "POST",
        "/rest/v1/job_application_events",
        data=[
            {
                "tenant_id": "tenant-1",
                "application_id": "application-1",
                "actor_user_id": None,
                "event_type": "CV_INGESTION_COMPLETED",
                "payload": {"candidate_id": "candidate-1"},
            }
        ],
        headers={"Prefer": "return=minimal"},
    )
