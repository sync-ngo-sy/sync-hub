"""End-to-end tests for the is_draft branch in extract_candidate_profile.

Covers the merge, validate, and classify flow when metadata.is_draft=True.
No production code is modified.
"""
from __future__ import annotations

from typing import Any
from unittest.mock import MagicMock, patch

import pytest

from cv_intelligence_worker.config import WorkerConfig
from cv_intelligence_worker.schema import (
    CandidateProfile,
    DocumentSource,
    DocumentText,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_config(**overrides: Any) -> WorkerConfig:
    defaults = dict(
        supabase_url="https://test.supabase.co",
        supabase_service_key="test-service-key",
        api_key="test-api-key",
        extraction_model="test-model",
        extraction_provider="openai-compatible",
        job_family_provider="llm",
        job_family_model="test-model",
        tenant_id="test-tenant",
    )
    defaults.update(overrides)
    return WorkerConfig(**defaults)


def _make_source(metadata: dict[str, Any]) -> DocumentSource:
    return DocumentSource(
        tenant_id="test-tenant",
        source_path="/tmp/test.pdf",
        source_type="candidate_draft",
        original_filename="test.pdf",
        mime_type="application/pdf",
        document_id="doc-1",
        document_sha256="sha-1",
        ingestion_run_id="run-1",
        metadata=metadata,
    )


def _make_document_text() -> DocumentText:
    return DocumentText(
        source=None,
        raw_text="Sample CV text for draft extraction test",
        parser_name="test",
        parser_version="1.0",
        warnings=[],
    )


FULL_ORIGINAL: dict[str, Any] = {
    "tenant_id": "t",
    "candidate_id": "c1",
    "source_document_id": "sd1",
    "source_sha256": "sha1",
    "name": "Ahmed Hassan",
    "current_title": "Developer",
    "skills": ["Python", "SQL"],
    "experience": [
        {"title": "Junior Developer", "company": "Acme", "description": "Built things"}
    ],
}


# ---------------------------------------------------------------------------
# Test class
# ---------------------------------------------------------------------------

class TestDraftExtractionE2E:
    """extract_candidate_profile: is_draft merge + validate + classify flow."""

    @patch("cv_intelligence_worker.extraction.classify_job_family_with_llm")
    @patch("cv_intelligence_worker.draft_validation.validate_user_overrides_with_llm")
    def test_merge_preserves_original_when_no_overrides(
        self, mock_validate: MagicMock, mock_classify: MagicMock
    ) -> None:
        """Empty overrides → profile built from original parsed_profile_json."""
        from cv_intelligence_worker.extraction import extract_candidate_profile

        config = _make_config()
        overrides: dict[str, Any] = {}
        source = _make_source({"is_draft": True, "draft_data": {
            "parsed_profile_json": FULL_ORIGINAL,
            "user_overrides_json": overrides,
        }})

        mock_validate.return_value = (True, "")
        mock_classify.return_value = MagicMock(spec=CandidateProfile)

        extract_candidate_profile(source, _make_document_text(), config)

        mock_validate.assert_called_once_with(FULL_ORIGINAL, overrides, config)

    @patch("cv_intelligence_worker.extraction.classify_job_family_with_llm")
    @patch("cv_intelligence_worker.draft_validation.validate_user_overrides_with_llm")
    def test_merge_applies_scalar_overrides(
        self, mock_validate: MagicMock, mock_classify: MagicMock
    ) -> None:
        """User overrides a scalar field → validate receives original + overrides."""
        from cv_intelligence_worker.extraction import extract_candidate_profile

        config = _make_config()
        overrides = {"current_title": "Senior Developer"}
        source = _make_source({"is_draft": True, "draft_data": {
            "parsed_profile_json": FULL_ORIGINAL,
            "user_overrides_json": overrides,
        }})

        mock_validate.return_value = (True, "")
        mock_classify.return_value = MagicMock(spec=CandidateProfile)

        extract_candidate_profile(source, _make_document_text(), config)

        mock_validate.assert_called_once_with(FULL_ORIGINAL, overrides, config)

    @patch("cv_intelligence_worker.extraction.classify_job_family_with_llm")
    @patch("cv_intelligence_worker.draft_validation.validate_user_overrides_with_llm")
    def test_validation_rejection_raises_value_error(
        self, mock_validate: MagicMock, mock_classify: MagicMock
    ) -> None:
        """LLM validation rejects edits → ValueError("AI Validation Rejected: ...")."""
        from cv_intelligence_worker.extraction import extract_candidate_profile

        config = _make_config()
        overrides = {"current_title": "Chief Executive Officer"}
        source = _make_source({"is_draft": True, "draft_data": {
            "parsed_profile_json": FULL_ORIGINAL,
            "user_overrides_json": overrides,
        }})
        mock_validate.return_value = (False, "Drastic seniority jump without evidence")

        with pytest.raises(ValueError, match="AI Validation Rejected"):
            extract_candidate_profile(source, _make_document_text(), config)

        mock_classify.assert_not_called()

    @patch("cv_intelligence_worker.extraction.classify_job_family_with_llm")
    @patch("cv_intelligence_worker.draft_validation.validate_user_overrides_with_llm")
    def test_empty_draft_data_raises_key_error(
        self, mock_validate: MagicMock, mock_classify: MagicMock
    ) -> None:
        """draft_data={} → candidate_profile_from_dict({}) → KeyError on tenant_id."""
        from cv_intelligence_worker.extraction import extract_candidate_profile

        config = _make_config()
        source = _make_source({"is_draft": True, "draft_data": {}})
        mock_validate.return_value = (True, "")

        with pytest.raises(KeyError):
            extract_candidate_profile(source, _make_document_text(), config)

    @patch("cv_intelligence_worker.extraction.classify_job_family_with_llm")
    @patch("cv_intelligence_worker.draft_validation.validate_user_overrides_with_llm")
    def test_validated_draft_passes_through_classify(
        self, mock_validate: MagicMock, mock_classify: MagicMock
    ) -> None:
        """After successful validation, classify_job_family_with_llm is called."""
        from cv_intelligence_worker.extraction import extract_candidate_profile

        config = _make_config()
        overrides = {"skills": ["Rust", "Go"]}
        source = _make_source({"is_draft": True, "draft_data": {
            "parsed_profile_json": FULL_ORIGINAL,
            "user_overrides_json": overrides,
        }})

        mock_validate.return_value = (True, "")
        expected = MagicMock(spec=CandidateProfile)
        mock_classify.return_value = expected

        result = extract_candidate_profile(source, _make_document_text(), config)

        assert result is expected
        mock_classify.assert_called_once()


# ---------------------------------------------------------------------------
# Unit tests for _merge_draft_profile_json (no mocking needed)
# ---------------------------------------------------------------------------


class TestMergeDraftProfileJson:
    """Direct unit tests on _merge_draft_profile_json merge semantics."""

    def test_recursive_merge_preserves_nested_arrays(self) -> None:
        """Array fields in original are kept when overrides don't touch them."""
        from cv_intelligence_worker.extraction import _merge_draft_profile_json

        original = {
            "experience": [{"title": "Developer", "highlights": ["A", "B"]}],
            "profile": {"skills": ["Python", "SQL"], "location": "Damascus"},
        }
        overrides = {"profile": {"location": "Amman"}}

        merged = _merge_draft_profile_json(original, overrides)

        assert merged["experience"] == original["experience"]
        assert merged["profile"]["skills"] == ["Python", "SQL"]
        assert merged["profile"]["location"] == "Amman"

    def test_override_replaces_array_when_provided(self) -> None:
        """When overrides supplies a new array, it replaces the original."""
        from cv_intelligence_worker.extraction import _merge_draft_profile_json

        original = {"skills": ["Python"]}
        overrides = {"skills": ["Rust", "Go"]}

        merged = _merge_draft_profile_json(original, overrides)

        assert merged["skills"] == ["Rust", "Go"]

    def test_empty_overrides_returns_original(self) -> None:
        from cv_intelligence_worker.extraction import _merge_draft_profile_json

        original = {"name": "Test", "tags": ["a"]}
        merged = _merge_draft_profile_json(original, {})

        assert merged == original

    def test_new_keys_added_from_overrides(self) -> None:
        from cv_intelligence_worker.extraction import _merge_draft_profile_json

        original = {"name": "Test"}
        overrides = {"email": "test@example.com"}

        merged = _merge_draft_profile_json(original, overrides)

        assert merged["name"] == "Test"
        assert merged["email"] == "test@example.com"

    def test_scalar_override_replaces_original(self) -> None:
        from cv_intelligence_worker.extraction import _merge_draft_profile_json

        assert _merge_draft_profile_json("old", "new") == "new"

    def test_none_override_preserves_original(self) -> None:
        from cv_intelligence_worker.extraction import _merge_draft_profile_json

        assert _merge_draft_profile_json("keep", None) == "keep"
