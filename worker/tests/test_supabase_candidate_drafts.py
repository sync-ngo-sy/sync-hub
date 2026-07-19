from __future__ import annotations

from unittest.mock import MagicMock

from cv_intelligence_worker.integrations.supabase.candidate_drafts import (
    CandidateDraftRepository,
)


def _draft_row() -> dict[str, object]:
    return {
        "id": "draft-1",
        "user_id": "user-1",
        "parsed_profile_json": {},
        "user_overrides_json": {},
        "cv_storage_path": "user-1/resume.pdf",
        "cv_original_filename": "resume.pdf",
        "cv_mime_type": "application/pdf",
        "cv_size_bytes": 1024,
        "primary_specialization": "Engineering",
        "parse_status": "pending_validation",
        "updated_at": "2026-07-19T12:00:00Z",
    }


def test_queued_drafts_are_validated() -> None:
    row = _draft_row()
    request = MagicMock(return_value=[row])
    repository = CandidateDraftRepository(request)

    assert repository.queued(limit=8, retry_stale_minutes=0) == [row]

    method, path = request.call_args.args
    assert method == "GET"
    assert "limit=8" in path
    assert "parse_status=eq.pending_validation" in path


def test_draft_update_targets_registered_user() -> None:
    request = MagicMock()
    repository = CandidateDraftRepository(request)

    repository.update_draft("user-1", {"parse_status": "parsing"})

    request.assert_called_once_with(
        "PATCH",
        "/rest/v1/candidate_registration_drafts?user_id=eq.user-1",
        data={"parse_status": "parsing"},
        headers={"Prefer": "return=minimal"},
    )


def test_candidate_publish_targets_uploader() -> None:
    request = MagicMock()
    repository = CandidateDraftRepository(request)
    payload = {
        "registered_user_id": "user-1",
        "is_published": True,
    }

    repository.update_candidate("user-1", payload)

    request.assert_called_once_with(
        "PATCH",
        "/rest/v1/candidates?uploaded_by=eq.user-1",
        data=payload,
        headers={"Prefer": "return=minimal"},
    )
