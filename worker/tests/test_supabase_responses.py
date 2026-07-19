from __future__ import annotations

import pytest

from cv_intelligence_worker.integrations.supabase import (
    CandidateDraftRow,
    PublicJobApplicationRow,
    SourceDocumentRow,
    SupabaseResponseError,
    validate_optional_row,
    validate_rows,
)


def candidate_draft_row(**overrides: object) -> dict[str, object]:
    row: dict[str, object] = {
        "id": "draft-1",
        "user_id": "user-1",
        "parsed_profile_json": {},
        "user_overrides_json": {},
        "cv_storage_path": "user-1/cv.pdf",
        "cv_original_filename": "cv.pdf",
        "cv_mime_type": "application/pdf",
        "cv_size_bytes": 1024,
        "primary_specialization": "Engineering",
        "parse_status": "pending_validation",
        "updated_at": "2026-07-19T12:00:00Z",
    }
    row.update(overrides)
    return row


def test_candidate_draft_rows_are_validated_and_preserved() -> None:
    row = candidate_draft_row()

    assert validate_rows([row], CandidateDraftRow, "candidate draft queue") == [row]


@pytest.mark.parametrize(
    "invalid_row",
    [
        candidate_draft_row(user_id=""),
        candidate_draft_row(cv_size_bytes="1024"),
        candidate_draft_row(parse_status="completed"),
        candidate_draft_row(nme="misspelled"),
    ],
)
def test_candidate_draft_rows_reject_invalid_fields(invalid_row: dict[str, object]) -> None:
    with pytest.raises(SupabaseResponseError, match="invalid row"):
        validate_rows([invalid_row], CandidateDraftRow, "candidate draft queue")


def test_public_application_rows_reject_missing_fields() -> None:
    with pytest.raises(SupabaseResponseError, match="invalid row"):
        validate_rows([{"id": "application-1"}], PublicJobApplicationRow, "job application queue")


def test_source_document_lookup_rejects_multiple_rows() -> None:
    row = {
        "id": "source-1",
        "tenant_id": "tenant-1",
        "candidate_id": None,
        "document_sha256": "sha256",
        "storage_path": None,
        "source_uri": "supabase://cv-originals/source-1/cv.pdf",
        "original_filename": "cv.pdf",
        "mime_type": "application/pdf",
    }

    with pytest.raises(SupabaseResponseError, match="multiple rows"):
        validate_optional_row([row, row], SourceDocumentRow, "source document lookup")


def test_validation_errors_do_not_include_response_content() -> None:
    private_value = "private CV content"

    with pytest.raises(SupabaseResponseError) as error:
        validate_rows([candidate_draft_row(user_id=private_value, unexpected=private_value)], CandidateDraftRow, "candidate draft queue")

    assert private_value not in str(error.value)
    assert error.value.__cause__ is None
