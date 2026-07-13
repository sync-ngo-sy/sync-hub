import json
from unittest.mock import patch, MagicMock

from fastapi.testclient import TestClient

from realtime_extractor import app, build_extended_system_prompt, sync_to_supabase_background
from cv_intelligence_worker.config import WorkerConfig

client = TestClient(app)

def test_build_extended_system_prompt():
    """Test that the extended system prompt successfully merges base prompt, extra rules, and schema."""
    prompt = build_extended_system_prompt()

    # Check base components
    assert "You are an expert ATS" in prompt or "Extract" in prompt, "Base prompt logic is missing"
    assert "Output schema:" in prompt
    assert "Additional Registration Flow Rules:" in prompt

    # Check that new required fields were added dynamically
    assert "field_confidence" in prompt
    assert "employment_type" in prompt
    assert "work_mode" in prompt

def test_detect_allowed_mime_type_matches_magic_bytes():
    from realtime_extractor import _detect_allowed_mime_type

    assert _detect_allowed_mime_type(b"%PDF-1.7\nrest") == "application/pdf"
    assert _detect_allowed_mime_type(b"PK\x03\x04rest") == "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    assert _detect_allowed_mime_type(b"not a document") is None

@patch("realtime_extractor.SupabaseSyncClient")
def test_sync_to_supabase_background_success(mock_supabase_client_class):
    """Test successful DB sync, extracting field_confidence and setting completed status."""
    mock_instance = MagicMock()
    mock_supabase_client_class.return_value = mock_instance

    config = WorkerConfig(supabase_url="http://mock.supabase.co", supabase_service_key="mock_key")

    raw_json = json.dumps({
        "name": "Test User",
        "experience": [],
        "field_confidence": {"name": 100}
    })

    sync_to_supabase_background(
        user_id="user_123",
        file_name="resume.pdf",
        mime_type="application/pdf",
        raw_json_str=raw_json,
        config=config
    )

    # Check if client was instantiated with correct credentials
    mock_supabase_client_class.assert_called_once_with("http://mock.supabase.co", "mock_key")

    # Verify the upsert call payload
    mock_instance.upsert_rows.assert_called_once()
    table_name, rows = mock_instance.upsert_rows.call_args[0]

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

@patch("realtime_extractor.logger")
def test_sync_to_supabase_background_missing_config(mock_logger):
    """Test that sync aborts if supabase config is missing."""
    config = WorkerConfig(supabase_url="", supabase_service_key="")

    sync_to_supabase_background("user_123", "resume.pdf", "application/pdf", "{}", config)

    mock_logger.info.assert_called_with("[DB SYNC] No Supabase credentials, skipping sync")

@patch("realtime_extractor.SupabaseSyncClient")
@patch("realtime_extractor.logger")
def test_sync_to_supabase_background_invalid_json(mock_logger, mock_supabase_client_class):
    """Test that sync marks draft as failed on malformed JSON."""
    mock_instance = MagicMock()
    mock_supabase_client_class.return_value = mock_instance

    config = WorkerConfig(supabase_url="http://mock.supabase.co", supabase_service_key="mock_key")

    sync_to_supabase_background("user_123", "resume.pdf", "application/pdf", "{invalid_json}", config)

    assert mock_logger.error.called
    assert "Failed to decode final JSON" in mock_logger.error.call_args_list[0][0][0]

    # Verify it tried to mark the draft as failed in the DB
    assert mock_instance.upsert_rows.called
    fail_row = mock_instance.upsert_rows.call_args[0][1][0]
    assert fail_row["parse_status"] == "failed"
    assert "JSON decode error" in fail_row["parse_error"]
