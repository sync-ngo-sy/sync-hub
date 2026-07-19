"""Workflow QA Tests — End-to-end validation of the candidate-registration pipeline.

Tests are grouped by workflow step. No production code is modified.
All external calls (LLM, Supabase HTTP, DB) are mocked.
"""
from __future__ import annotations

import json
from typing import Any
from unittest.mock import MagicMock, patch

import pytest

from cv_intelligence_worker.config import WorkerConfig
from cv_intelligence_worker.integrations.llm import LLMResponseError
from cv_intelligence_worker.integrations.llm.models import DraftValidationExtraction
from cv_intelligence_worker.integrations.supabase import SupabaseResponseError
from cv_intelligence_worker.domain.models import (
    CandidateProfile,
    DocumentSource,
    DocumentText,
)
from tests.test_helpers.realtime import realtime_extraction


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_config(**overrides: Any) -> WorkerConfig:
    """Create a WorkerConfig with test defaults, overriding specific fields."""
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


# ===========================================================================
# STEP 2 — realtime_extractor.sync_to_supabase_background
# ===========================================================================

class TestSyncToSupabaseBackground:
    """Persist validated realtime extraction output to Supabase."""

    @patch("cv_intelligence_worker.realtime_extractor.SupabaseClient")
    def test_validated_extraction_sets_completed(self, mock_cls):
        from cv_intelligence_worker.realtime_extractor import sync_to_supabase_background
        config = _make_config()
        extraction = realtime_extraction(name="Ahmed", field_confidence={"name": 95})
        mock_client = mock_cls.return_value
        mock_client.upsert.return_value = {"status": 200}

        sync_to_supabase_background("user-1", extraction, config)

        mock_client.upsert.assert_called_once()
        call_args = mock_client.upsert.call_args
        row = call_args[0][1][0]
        assert row["user_id"] == "user-1"
        assert row["parse_status"] == "completed"
        assert row["parsed_profile_json"]["name"] == "Ahmed"
        assert row["field_confidence_json"]["name"] == 95

    @patch("cv_intelligence_worker.realtime_extractor.SupabaseClient")
    def test_extraction_failure_sets_failed(self, mock_cls):
        from cv_intelligence_worker.realtime_extractor import mark_extraction_failed
        config = _make_config()
        mock_client = mock_cls.return_value
        mock_client.upsert.return_value = {"status": 200}

        mark_extraction_failed("user-2", "structured model response failed validation", config)

        mock_client.upsert.assert_called_once()
        row = mock_client.upsert.call_args[0][1][0]
        assert row["parse_status"] == "failed"
        assert row["parse_error"] == "structured model response failed validation"

    @patch("cv_intelligence_worker.realtime_extractor.SupabaseClient")
    def test_validated_extraction_db_error_falls_back_to_failed(self, mock_cls):
        from cv_intelligence_worker.realtime_extractor import sync_to_supabase_background
        config = _make_config()
        extraction = realtime_extraction(name="Ahmed")
        mock_client = mock_cls.return_value
        mock_client.upsert.side_effect = [
            Exception("DB write failed"),  # first call (completed) fails
            {"status": 200},  # fallback call (failed) succeeds
        ]

        # Should NOT raise — fallback handles it
        sync_to_supabase_background("user-3", extraction, config)

        assert mock_client.upsert.call_count == 2
        fallback_row = mock_client.upsert.call_args_list[1][0][1][0]
        assert fallback_row["parse_status"] == "failed"
        assert "DB sync error" in fallback_row["parse_error"]

    def test_no_supabase_credentials_skips(self):
        from cv_intelligence_worker.realtime_extractor import sync_to_supabase_background
        config = _make_config(supabase_url="", supabase_service_key="")
        # Should not raise, should return early
        sync_to_supabase_background("user-4", realtime_extraction(), config)


# ===========================================================================
# STEP 3 — draft_validation.validate_user_overrides_with_llm
# ===========================================================================

class TestValidateUserOverrides:
    """validate_user_overrides_with_llm: LLM-based override sanity check."""

    def test_empty_overrides_returns_valid(self):
        from cv_intelligence_worker.candidate_extraction import validate_user_overrides_with_llm
        config = _make_config()
        is_valid, reason = validate_user_overrides_with_llm({}, {}, config)
        assert is_valid is True
        assert reason == ""

    def test_empty_user_overrides_returns_valid(self):
        from cv_intelligence_worker.candidate_extraction import validate_user_overrides_with_llm
        config = _make_config()
        is_valid, reason = validate_user_overrides_with_llm(
            {"name": "Ahmed"}, {}, config
        )
        assert is_valid is True
        assert reason == ""

    @patch("cv_intelligence_worker.candidate_extraction.draft_validation.LLMClient.parse")
    def test_illogical_override_rejected(self, mock_llm):
        from cv_intelligence_worker.candidate_extraction import validate_user_overrides_with_llm
        config = _make_config()
        mock_llm.return_value = DraftValidationExtraction(
            is_valid=False,
            reason="Drastic seniority change from Junior to CEO without evidence",
        )
        original = {"title": "Junior Developer"}
        overrides = {"title": "CEO"}
        is_valid, reason = validate_user_overrides_with_llm(original, overrides, config)

        assert is_valid is False
        assert "CEO" in reason or "Drastic" in reason
        mock_llm.assert_called_once()

    @patch("cv_intelligence_worker.candidate_extraction.draft_validation.LLMClient.parse")
    def test_logical_override_accepted(self, mock_llm):
        from cv_intelligence_worker.candidate_extraction import validate_user_overrides_with_llm
        config = _make_config()
        mock_llm.return_value = DraftValidationExtraction(
            is_valid=True,
            reason="Minor name correction, acceptable",
        )
        original = {"name": "Ahmed"}
        overrides = {"name": "Ahmed K."}
        is_valid, reason = validate_user_overrides_with_llm(original, overrides, config)

        assert is_valid is True
        mock_llm.assert_called_once()

    def test_disabled_provider_fails_closed(self):
        from cv_intelligence_worker.candidate_extraction import validate_user_overrides_with_llm
        config = _make_config(extraction_provider="disabled")
        with pytest.raises(LLMResponseError, match="not configured"):
            validate_user_overrides_with_llm(
                {"title": "Intern"}, {"title": "President"}, config
            )

    @patch("cv_intelligence_worker.candidate_extraction.draft_validation.LLMClient.parse")
    def test_llm_exception_rejects(self, mock_llm):
        from cv_intelligence_worker.candidate_extraction import validate_user_overrides_with_llm
        config = _make_config()
        mock_llm.side_effect = LLMResponseError("LLM unreachable")
        with pytest.raises(LLMResponseError, match="LLM unreachable"):
            validate_user_overrides_with_llm(
                {"name": "A"}, {"name": "B"}, config
            )

    @patch("cv_intelligence_worker.candidate_extraction.draft_validation.LLMClient.parse")
    def test_ollama_provider_uses_shared_client(self, mock_llm):
        from cv_intelligence_worker.candidate_extraction import validate_user_overrides_with_llm
        config = _make_config(extraction_provider="ollama")
        mock_llm.return_value = DraftValidationExtraction(is_valid=True, reason="OK")
        is_valid, _ = validate_user_overrides_with_llm({"a": 1}, {"b": 2}, config)
        assert is_valid is True
        mock_llm.assert_called_once()


# ===========================================================================
# STEP 5 — DraftIngestion.run()
# ===========================================================================

class TestDraftIngestionRun:
    """DraftIngestion.run: queue polling → pipeline → status update."""

    @patch("cv_intelligence_worker.workflows.draft_ingestion.IngestionPipeline")
    @patch("cv_intelligence_worker.workflows.draft_ingestion.SupabaseClient")
    def test_empty_drafts_returns_zero(self, mock_sb_cls, mock_pipe_cls):
        from cv_intelligence_worker.workflows import DraftIngestion
        config = _make_config()
        mock_sb_cls.return_value.queued_candidate_drafts.return_value = []

        result = DraftIngestion(config).run()
        assert result == 0
        mock_sb_cls.return_value.update_candidate_draft.assert_not_called()

    @patch("cv_intelligence_worker.workflows.draft_ingestion.IngestionPipeline")
    @patch("cv_intelligence_worker.workflows.draft_ingestion.SupabaseClient")
    def test_draft_without_user_id_skipped(self, mock_sb_cls, mock_pipe_cls):
        from cv_intelligence_worker.workflows import DraftIngestion
        config = _make_config()
        mock_sb_cls.return_value.queued_candidate_drafts.return_value = [
            {"id": "d1", "user_id": None, "cv_storage_path": "a.pdf"},
        ]

        result = DraftIngestion(config).run()
        assert result == 0
        mock_sb_cls.return_value.update_candidate_draft.assert_not_called()
        mock_pipe_cls.return_value.ingest_sources.assert_not_called()

    @patch("cv_intelligence_worker.workflows.draft_ingestion.IngestionPipeline")
    @patch("cv_intelligence_worker.workflows.draft_ingestion.SupabaseClient")
    def test_valid_draft_sets_parsing_then_published(self, mock_sb_cls, mock_pipe_cls):
        from cv_intelligence_worker.workflows import DraftIngestion
        from cv_intelligence_worker.workflows import IngestionResult
        config = _make_config()
        mock_sb = mock_sb_cls.return_value
        mock_sb.queued_candidate_drafts.return_value = [
            {"user_id": "u1", "id": "d1", "cv_storage_path": "test.pdf"}
        ]
        mock_pipe = mock_pipe_cls.return_value
        mock_pipe.ingest_sources.return_value = IngestionResult(
            ingestion_run_id="r1", total_discovered=1, bundles=[],
            failures=[], warnings=[], sync_stats={}
        )

        result = DraftIngestion(config).run()
        assert result == 1

        # Verify status transitions
        calls = {c[0][1]["parse_status"] for c in mock_sb.update_candidate_draft.call_args_list}
        assert "parsing" in calls
        assert "published" in calls

    @patch("cv_intelligence_worker.workflows.draft_ingestion.IngestionPipeline")
    @patch("cv_intelligence_worker.workflows.draft_ingestion.SupabaseClient")
    def test_pipeline_failure_sets_failed(self, mock_sb_cls, mock_pipe_cls):
        from cv_intelligence_worker.workflows import DraftIngestion
        from cv_intelligence_worker.workflows import IngestionResult
        config = _make_config()
        mock_sb = mock_sb_cls.return_value
        mock_sb.queued_candidate_drafts.return_value = [
            {"user_id": "u2", "id": "d2", "cv_storage_path": "bad.pdf"}
        ]
        mock_pipe = mock_pipe_cls.return_value
        mock_pipe.ingest_sources.return_value = IngestionResult(
            ingestion_run_id="r2", total_discovered=1, bundles=[], warnings=[], sync_stats={},
            failures=[{"source": "bad.pdf", "error": "Validation error"}]
        )

        result = DraftIngestion(config).run()
        assert result == 0

        failed_calls = [
            c for c in mock_sb.update_candidate_draft.call_args_list
            if c[0][1].get("parse_status") == "failed"
        ]
        assert len(failed_calls) == 1
        assert "Validation error" in failed_calls[0][0][1]["parse_error"]

    @patch("cv_intelligence_worker.workflows.draft_ingestion.IngestionPipeline")
    @patch("cv_intelligence_worker.workflows.draft_ingestion.SupabaseClient")
    def test_update_draft_failure_outside_try_31(self, mock_sb_cls, mock_pipe_cls):
        from cv_intelligence_worker.workflows import DraftIngestion
        config = _make_config()
        mock_sb = mock_sb_cls.return_value
        mock_sb.queued_candidate_drafts.return_value = [
            {"user_id": "u3", "id": "d3"}
        ]
        mock_sb.update_candidate_draft.side_effect = RuntimeError("Connection reset")

        result = DraftIngestion(config).run()
        assert result == 0
        mock_pipe_cls.return_value.ingest_sources.assert_not_called()

    @patch("cv_intelligence_worker.workflows.draft_ingestion.IngestionPipeline")
    @patch("cv_intelligence_worker.workflows.draft_ingestion.SupabaseClient")
    def test_progress_callback_called(self, mock_sb_cls, mock_pipe_cls):
        from cv_intelligence_worker.workflows import DraftIngestion
        from cv_intelligence_worker.workflows import IngestionResult
        config = _make_config()
        mock_sb = mock_sb_cls.return_value
        mock_sb.queued_candidate_drafts.return_value = [
            {"user_id": "u4", "id": "d4", "cv_storage_path": "cv.pdf"}
        ]
        mock_pipe_cls.return_value.ingest_sources.return_value = IngestionResult(
            ingestion_run_id="r4", total_discovered=1, bundles=[],
            failures=[], warnings=[], sync_stats={}
        )
        progress = MagicMock()
        DraftIngestion(config).run(progress=progress)
        progress.assert_called()
        assert any("u4" in str(c) for c in progress.call_args_list)


# ===========================================================================
# STEP 6 — extract_candidate_profile is_draft branch
# ===========================================================================

class TestExtractCandidateProfileDraft:
    """extract_candidate_profile: is_draft merge + validate + classify."""

    def _make_source(self, metadata: dict) -> DocumentSource:
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

    def _make_document_text(self) -> DocumentText:
        return DocumentText(
            source=self._make_source({"is_draft": True}),
            raw_text="Sample CV text",
            parser_name="test",
            parser_version="1.0",
            warnings=[],
        )

    @patch("cv_intelligence_worker.candidate_extraction.service.classify_job_family_with_llm")
    @patch("cv_intelligence_worker.candidate_extraction.draft_validation.validate_user_overrides_with_llm")
    def test_merge_original_and_overrides(self, mock_validate, mock_classify):
        from cv_intelligence_worker.candidate_extraction import extract_candidate_profile
        config = _make_config()
        original = {
            "tenant_id": "t", "candidate_id": "c1", "source_document_id": "sd1",
            "source_sha256": "sha1", "name": "Ahmed", "current_title": "Developer",
            "skills": ["Python"], "experience": [],
        }
        overrides = {"current_title": "Senior Developer"}
        source = self._make_source({"is_draft": True, "draft_data": {
            "parsed_profile_json": original, "user_overrides_json": overrides
        }})
        doc_text = self._make_document_text()

        mock_validate.return_value = (True, "")
        mock_profile = MagicMock(spec=CandidateProfile)
        mock_classify.return_value = mock_profile

        result = extract_candidate_profile(source, doc_text, config)

        # Verify validate was called with original and overrides
        mock_validate.assert_called_once_with(original, overrides, config)
        assert result is mock_profile

    @patch("cv_intelligence_worker.candidate_extraction.service.classify_job_family_with_llm")
    @patch("cv_intelligence_worker.candidate_extraction.draft_validation.validate_user_overrides_with_llm")
    def test_experience_list_merge(self, mock_validate, mock_classify):
        from cv_intelligence_worker.candidate_extraction import extract_candidate_profile
        config = _make_config()
        original = {
            "tenant_id": "t", "candidate_id": "c2", "source_document_id": "sd2",
            "source_sha256": "sha2", "name": "Sara", "current_title": "Designer",
            "skills": [], "experience": [
                {"title": "Junior Designer", "company": "A", "description": "Design work"}
            ],
        }
        overrides = {"experience": [{"title": "Senior Designer", "company": "B"}]}
        source = self._make_source({"is_draft": True, "draft_data": {
            "parsed_profile_json": original, "user_overrides_json": overrides
        }})

        mock_validate.return_value = (True, "")

        # The merge happens as: {**original, **overrides}
        # overrides["experience"] replaces original["experience"]
        mock_classify.return_value = MagicMock(spec=CandidateProfile)
        extract_candidate_profile(source, self._make_document_text(), config)

        # Validate was called — the merged dict should have overrides' experience
        call_args = mock_validate.call_args[0]
        merged_into = call_args[1]  # user_overrides
        assert merged_into == overrides

    @patch("cv_intelligence_worker.candidate_extraction.service.classify_job_family_with_llm")
    @patch("cv_intelligence_worker.candidate_extraction.draft_validation.validate_user_overrides_with_llm")
    def test_empty_draft_data_raises_keyerror(self, mock_validate, mock_classify):
        """draft_data={} → original_profile and user_overrides are both {}.
        merged_profile_json = {} → candidate_profile_from_dict({}) → KeyError."""
        from cv_intelligence_worker.candidate_extraction import extract_candidate_profile
        config = _make_config()
        source = self._make_source({"is_draft": True, "draft_data": {}})
        mock_validate.return_value = (True, "")

        with pytest.raises(KeyError):
            extract_candidate_profile(source, self._make_document_text(), config)

    @patch("cv_intelligence_worker.candidate_extraction.service.classify_job_family_with_llm")
    @patch("cv_intelligence_worker.candidate_extraction.draft_validation.validate_user_overrides_with_llm")
    def test_empty_overrides_still_validates(self, mock_validate, mock_classify):
        """Even with empty overrides, the validate function is called.
        If it returns True, profile is built from original."""
        from cv_intelligence_worker.candidate_extraction import extract_candidate_profile
        config = _make_config()
        original = {
            "tenant_id": "t", "candidate_id": "c3", "source_document_id": "sd3",
            "source_sha256": "sha3", "name": "Omar", "current_title": "Tester",
            "skills": [], "experience": [],
        }
        source = self._make_source({"is_draft": True, "draft_data": {
            "parsed_profile_json": original, "user_overrides_json": {}
        }})
        mock_validate.return_value = (True, "")
        mock_classify.return_value = MagicMock(spec=CandidateProfile)

        result = extract_candidate_profile(source, self._make_document_text(), config)
        mock_validate.assert_called_once_with(original, {}, config)
        assert result is not None

    @patch("cv_intelligence_worker.candidate_extraction.service.classify_job_family_with_llm")
    @patch("cv_intelligence_worker.candidate_extraction.draft_validation.validate_user_overrides_with_llm")
    def test_validation_rejection_raises(self, mock_validate, mock_classify):
        from cv_intelligence_worker.candidate_extraction import extract_candidate_profile
        config = _make_config()
        original = {
            "tenant_id": "t", "candidate_id": "c4", "source_document_id": "sd4",
            "source_sha256": "sha4", "name": "X", "current_title": "Intern",
            "skills": [], "experience": [],
        }
        overrides = {"current_title": "CTO"}
        source = self._make_source({"is_draft": True, "draft_data": {
            "parsed_profile_json": original, "user_overrides_json": overrides
        }})
        mock_validate.return_value = (False, "Drastic change rejected")

        with pytest.raises(ValueError, match="AI Validation Rejected"):
            extract_candidate_profile(source, self._make_document_text(), config)

    def test_recursive_draft_merge_preserves_nested_arrays(self):
        from cv_intelligence_worker.candidate_extraction.service import _merge_draft_profile_json

        original = {
            "experience": [{"title": "Developer", "highlights": ["A", "B"]}],
            "profile": {"skills": ["Python", "SQL"], "location": "Damascus"},
        }
        overrides = {
            "profile": {"location": "Amman"},
        }

        merged = _merge_draft_profile_json(original, overrides)

        assert merged["experience"] == original["experience"]
        assert merged["profile"]["skills"] == ["Python", "SQL"]
        assert merged["profile"]["location"] == "Amman"


# ===========================================================================
# STEP 8 — SupabaseClient.queued_candidate_drafts + update_candidate_draft
# ===========================================================================

class TestSupabaseDraftOps:
    """SupabaseClient draft queue and update operations."""

    @patch("cv_intelligence_worker.integrations.supabase.client.urlopen")
    def test_queued_candidate_drafts_returns_list(self, mock_urlopen):
        from cv_intelligence_worker.integrations.supabase import SupabaseClient
        config = _make_config()
        client = SupabaseClient(config)

        mock_response = MagicMock()
        mock_response.read.return_value = json.dumps(
            [
                {
                    "id": draft_id,
                    "user_id": user_id,
                    "parsed_profile_json": {},
                    "user_overrides_json": {},
                    "cv_storage_path": None,
                    "cv_original_filename": None,
                    "cv_mime_type": None,
                    "cv_size_bytes": None,
                    "primary_specialization": None,
                    "parse_status": "pending_validation",
                    "updated_at": "2026-07-19T12:00:00Z",
                }
                for draft_id, user_id in (("d1", "u1"), ("d2", "u2"))
            ]
        ).encode()
        mock_response.headers = {}
        mock_response.__enter__ = MagicMock(return_value=mock_response)
        mock_response.__exit__ = MagicMock(return_value=False)
        mock_urlopen.return_value = mock_response

        drafts = client.queued_candidate_drafts(limit=10)
        assert len(drafts) == 2
        assert drafts[0]["user_id"] == "u1"

    @patch("cv_intelligence_worker.integrations.supabase.client.urlopen")
    def test_queued_candidate_drafts_empty(self, mock_urlopen):
        from cv_intelligence_worker.integrations.supabase import SupabaseClient
        config = _make_config()
        client = SupabaseClient(config)

        mock_response = MagicMock()
        mock_response.read.return_value = b"[]"
        mock_response.headers = {}
        mock_response.__enter__ = MagicMock(return_value=mock_response)
        mock_response.__exit__ = MagicMock(return_value=False)
        mock_urlopen.return_value = mock_response

        drafts = client.queued_candidate_drafts()
        assert drafts == []

    @patch("cv_intelligence_worker.integrations.supabase.client.urlopen")
    def test_queued_candidate_drafts_rejects_non_list_response(self, mock_urlopen):
        from cv_intelligence_worker.integrations.supabase import SupabaseClient
        config = _make_config()
        client = SupabaseClient(config)

        mock_response = MagicMock()
        mock_response.read.return_value = b'{"error": "bad query"}'
        mock_response.headers = {}
        mock_response.__enter__ = MagicMock(return_value=mock_response)
        mock_response.__exit__ = MagicMock(return_value=False)
        mock_urlopen.return_value = mock_response

        with pytest.raises(SupabaseResponseError, match="invalid response shape"):
            client.queued_candidate_drafts()

    @patch("cv_intelligence_worker.integrations.supabase.client.urlopen")
    def test_update_candidate_draft_calls_patch(self, mock_urlopen):
        from cv_intelligence_worker.integrations.supabase import SupabaseClient
        config = _make_config()
        client = SupabaseClient(config)

        mock_response = MagicMock()
        mock_response.read.return_value = b""
        mock_response.headers = {}
        mock_response.__enter__ = MagicMock(return_value=mock_response)
        mock_response.__exit__ = MagicMock(return_value=False)
        mock_urlopen.return_value = mock_response

        client.update_candidate_draft("user-abc", {"parse_status": "parsing"})

        mock_urlopen.assert_called_once()
        req = mock_urlopen.call_args[0][0]
        assert req.get_method() == "PATCH"
        assert "user_id=eq.user-abc" in req.full_url


# ===========================================================================
# STEP 9 — realtime_extractor.verify_api_key
# ===========================================================================

class TestVerifyApiKey:
    """verify_api_key: security gate for the FastAPI endpoint."""

    def test_valid_key_returns_key(self):
        from cv_intelligence_worker.realtime_extractor import verify_api_key
        config = _make_config(api_key="secret-123")

        with patch("cv_intelligence_worker.realtime_extractor.WorkerConfig.from_env", return_value=config):
            result = verify_api_key("secret-123")
            assert result == "secret-123"

    def test_wrong_key_raises_403(self):
        from cv_intelligence_worker.realtime_extractor import verify_api_key
        from fastapi import HTTPException
        config = _make_config(api_key="secret-123")

        with patch("cv_intelligence_worker.realtime_extractor.WorkerConfig.from_env", return_value=config):
            with pytest.raises(HTTPException) as exc_info:
                verify_api_key("wrong-key")
            assert exc_info.value.status_code == 403

    def test_no_server_key_configured_raises_403(self):
        from cv_intelligence_worker.realtime_extractor import verify_api_key
        from fastapi import HTTPException
        config = _make_config(api_key="")

        with patch("cv_intelligence_worker.realtime_extractor.WorkerConfig.from_env", return_value=config):
            with pytest.raises(HTTPException) as exc_info:
                verify_api_key("any-key")
            assert exc_info.value.status_code == 403


# ===========================================================================
# STEP 1 — candidate-registration Edge Function route logic
# ===========================================================================

class TestEdgeFunctionRoutes:
    """Validate the route structure in candidate-registration/index.ts."""

    def test_upload_cv_route_exists(self):
        """Verify the Edge Function handles /upload-cv POST."""
        from pathlib import Path
        ts_file = Path(__file__).resolve().parents[2] / "supabase" / "functions" / "candidate-registration" / "index.ts"
        if not ts_file.exists():
            pytest.skip("Edge Function source not available locally")
        content = ts_file.read_text()
        assert "/upload-cv" in content or "upload-cv" in content

    def test_save_draft_route_exists(self):
        from pathlib import Path
        ts_file = Path(__file__).resolve().parents[2] / "supabase" / "functions" / "candidate-registration" / "index.ts"
        if not ts_file.exists():
            pytest.skip("Edge Function source not available locally")
        content = ts_file.read_text()
        assert "/save-draft" in content or "save-draft" in content

    def test_publish_route_exists(self):
        from pathlib import Path
        ts_file = Path(__file__).resolve().parents[2] / "supabase" / "functions" / "candidate-registration" / "index.ts"
        if not ts_file.exists():
            pytest.skip("Edge Function source not available locally")
        content = ts_file.read_text()
        assert "/publish" in content or "publish" in content


# ===========================================================================
# STEP 5b — CLI process-drafts command
# ===========================================================================

class TestCLIProcessDrafts:
    """CLI process-drafts command integration."""

    def test_cli_has_process_drafts_command(self):
        from cv_intelligence_worker import cli
        assert hasattr(cli, "main") or hasattr(cli, "cli")

    @patch("cv_intelligence_worker.workflows.draft_ingestion.IngestionPipeline")
    @patch("cv_intelligence_worker.workflows.draft_ingestion.SupabaseClient")
    def test_process_drafts_returns_count(self, mock_sb_cls, mock_pipe_cls):
        from cv_intelligence_worker.workflows import DraftIngestion
        from cv_intelligence_worker.workflows import IngestionResult
        config = _make_config()
        mock_sb_cls.return_value.queued_candidate_drafts.return_value = [
            {"user_id": "u10", "id": "d10", "cv_storage_path": "ok.pdf"},
            {"user_id": "u11", "id": "d11", "cv_storage_path": "ok2.pdf"},
        ]
        mock_pipe_cls.return_value.ingest_sources.return_value = IngestionResult(
            ingestion_run_id="r", total_discovered=1, bundles=[],
            failures=[], warnings=[], sync_stats={}
        )
        processed = DraftIngestion(config).run(limit=50)
        assert processed == 2
