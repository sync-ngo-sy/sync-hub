from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi.testclient import TestClient
from pydantic import ValidationError
import pytest

from cv_intelligence_worker.candidate_extraction import build_realtime_candidate_system_prompt
from cv_intelligence_worker.config import WorkerConfig
from cv_intelligence_worker.integrations.llm.models import RealtimeCandidateExtraction
from cv_intelligence_worker.realtime_extractor import (
    app,
    build_extended_system_prompt,
    mark_extraction_failed,
    sync_to_supabase_background,
)
from cv_intelligence_worker.domain.models import DocumentText
from tests.test_helpers.realtime import realtime_extraction

client = TestClient(app)


def test_build_extended_system_prompt():
    prompt = build_extended_system_prompt()

    assert prompt == build_realtime_candidate_system_prompt()
    assert "You are an expert ATS" in prompt or "Extract" in prompt, "Base prompt logic is missing"
    assert "Output schema:" not in prompt
    assert "Additional Registration Flow Rules:" in prompt

    assert "field_confidence" in prompt
    assert "employment_type" in prompt
    assert "work_mode" in prompt


def test_realtime_schema_rejects_unknown_fields_and_invalid_confidence():
    payload = realtime_extraction().model_dump()
    payload["nme"] = payload.pop("name")
    payload["field_confidence"] = {"name": 101}

    with pytest.raises(ValidationError):
        RealtimeCandidateExtraction.model_validate(payload)


def test_detect_allowed_mime_type_matches_magic_bytes():
    from cv_intelligence_worker.realtime_extractor import _detect_allowed_mime_type

    assert _detect_allowed_mime_type(b"%PDF-1.7\nrest") == "application/pdf"
    assert _detect_allowed_mime_type(b"PK\x03\x04rest") == "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    assert _detect_allowed_mime_type(b"not a document") is None


@patch("cv_intelligence_worker.realtime_extractor.SupabaseClient")
def test_sync_to_supabase_background_success(mock_supabase_client_class):
    """Test successful DB sync, extracting field_confidence and setting completed status."""
    mock_instance = MagicMock()
    mock_supabase_client_class.return_value = mock_instance

    config = WorkerConfig(supabase_url="http://mock.supabase.co", supabase_service_key="mock_key")

    extraction = realtime_extraction(name="Test User", field_confidence={"name": 100})

    sync_to_supabase_background(
        user_id="user_123",
        extraction=extraction,
        config=config,
    )

    # Check if client was instantiated with correct credentials
    mock_supabase_client_class.assert_called_once_with(config)

    # Verify the upsert call payload
    mock_instance.upsert.assert_called_once()
    table_name, rows = mock_instance.upsert.call_args[0]
    assert mock_instance.upsert.call_args.kwargs == {"on_conflict": "user_id"}

    assert table_name == "candidate_registration_drafts"
    assert len(rows) == 1
    row = rows[0]

    assert row["user_id"] == "user_123"
    assert row["parse_status"] == "completed"
    assert "parse_completed_at" in row

    # Edge Function is responsible for cv_original_filename and cv_mime_type
    assert "cv_original_filename" not in row
    assert "cv_mime_type" not in row

    # Ensure field_confidence was popped out of parsed_profile_json
    assert "field_confidence" not in row["parsed_profile_json"]
    assert row["parsed_profile_json"]["name"] == "Test User"

    # Ensure field_confidence_json received the popped data
    assert row["field_confidence_json"] == {"name": 100}


@patch("cv_intelligence_worker.realtime_extractor.logger")
def test_sync_to_supabase_background_missing_config(mock_logger):
    """Test that sync aborts if supabase config is missing."""
    config = WorkerConfig(supabase_url="", supabase_service_key="")

    sync_to_supabase_background("user_123", realtime_extraction(), config)

    mock_logger.info.assert_called_with("[DB SYNC] No Supabase credentials, skipping sync")


@patch("cv_intelligence_worker.realtime_extractor.SupabaseClient")
@patch("cv_intelligence_worker.realtime_extractor.logger")
def test_mark_extraction_failed_uses_safe_error(mock_logger, mock_supabase_client_class):
    mock_instance = MagicMock()
    mock_supabase_client_class.return_value = mock_instance

    config = WorkerConfig(supabase_url="http://mock.supabase.co", supabase_service_key="mock_key")

    mark_extraction_failed("user_123", "structured model response failed validation", config)

    mock_logger.error.assert_not_called()
    fail_row = mock_instance.upsert.call_args[0][1][0]
    assert fail_row["parse_status"] == "failed"
    assert fail_row["parse_error"] == "structured model response failed validation"


@patch("cv_intelligence_worker.realtime_extractor._check_rate_limit")
@patch("cv_intelligence_worker.realtime_extractor.parse_document")
@patch("cv_intelligence_worker.realtime_extractor.WorkerConfig.from_env")
@patch("cv_intelligence_worker.integrations.llm.client.AsyncOpenAI")
def test_parse_endpoint_returns_only_sdk_validated_json(openai, config_from_env, parse_document, _rate_limit):
    extraction = realtime_extraction()
    sdk_client = MagicMock()
    sdk_client.chat.completions.parse = AsyncMock(
        return_value=MagicMock(choices=[MagicMock(message=MagicMock(parsed=extraction, refusal=None))])
    )
    openai.return_value = sdk_client
    config_from_env.return_value = WorkerConfig(
        api_key="worker-secret",
        extraction_model="test-model",
        model_api_key="model-secret",
    )
    parse_document.return_value = DocumentText(
        source=None,
        raw_text="Jane Doe, backend engineer",
        parser_name="test",
        parser_version="1",
    )

    response = client.post(
        "/api/v1/parse-cv-fast",
        files={"file": ("cv.pdf", b"%PDF-1.7\ntest", "application/pdf")},
        data={"user_id": "b7d19f85-fcb1-4eb9-bb10-0d515e925c55"},
        headers={"X-API-Key": "worker-secret"},
    )

    assert response.status_code == 200
    assert RealtimeCandidateExtraction.model_validate_json(response.text) == extraction
    sdk_client.chat.completions.parse.assert_awaited_once()
    parsed_source = parse_document.call_args.args[0]
    assert not Path(parsed_source.source_path).exists()


@patch("cv_intelligence_worker.realtime_extractor._check_rate_limit")
@patch("cv_intelligence_worker.realtime_extractor.WorkerConfig.from_env")
def test_parse_endpoint_rejects_declared_mime_type_mismatch(config_from_env, _rate_limit):
    config_from_env.return_value = WorkerConfig(
        api_key="worker-secret",
        extraction_model="test-model",
        model_api_key="model-secret",
    )

    response = client.post(
        "/api/v1/parse-cv-fast",
        files={
            "file": (
                "cv.docx",
                b"%PDF-1.7\ntest",
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )
        },
        data={"user_id": "b7d19f85-fcb1-4eb9-bb10-0d515e925c55"},
        headers={"X-API-Key": "worker-secret"},
    )

    assert response.status_code == 400
    assert response.json() == {"detail": "Invalid file type. Only PDF and Word documents are allowed."}


@patch("cv_intelligence_worker.realtime_extractor._check_rate_limit")
@patch("cv_intelligence_worker.realtime_extractor.parse_document")
@patch("cv_intelligence_worker.realtime_extractor.WorkerConfig.from_env")
@patch("cv_intelligence_worker.integrations.llm.client.AsyncOpenAI")
def test_parse_endpoint_rejects_malformed_model_output(openai, config_from_env, parse_document, _rate_limit):
    payload = realtime_extraction().model_dump()
    payload["nme"] = "private CV content"
    with pytest.raises(ValidationError) as validation:
        RealtimeCandidateExtraction.model_validate(payload)
    sdk_client = MagicMock()
    sdk_client.chat.completions.parse = AsyncMock(side_effect=validation.value)
    openai.return_value = sdk_client
    config_from_env.return_value = WorkerConfig(
        api_key="worker-secret",
        extraction_model="test-model",
        model_api_key="model-secret",
    )
    parse_document.return_value = DocumentText(
        source=None,
        raw_text="private CV content",
        parser_name="test",
        parser_version="1",
    )

    response = client.post(
        "/api/v1/parse-cv-fast",
        files={"file": ("cv.pdf", b"%PDF-1.7\ntest", "application/pdf")},
        data={"user_id": "b7d19f85-fcb1-4eb9-bb10-0d515e925c55"},
        headers={"X-API-Key": "worker-secret"},
    )

    assert response.status_code == 502
    assert response.json() == {"detail": "CV extraction failed"}
    assert "private CV content" not in response.text
