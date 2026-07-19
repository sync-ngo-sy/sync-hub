import os
from unittest.mock import patch

import pytest

from cv_intelligence_worker.config import WorkerConfig
from cv_intelligence_worker.draft_ingestion import DraftIngestion
from cv_intelligence_worker.pipeline import IngestionResult

from dataclasses import replace

@pytest.fixture
def config():
    return replace(WorkerConfig(), tenant_id="test-tenant")

@patch("cv_intelligence_worker.draft_ingestion.IngestionPipeline")
@patch("cv_intelligence_worker.draft_ingestion.SupabaseClient")
def test_draft_ingestion_no_drafts(mock_supabase_cls, mock_pipeline_cls, config):
    mock_supabase = mock_supabase_cls.return_value
    mock_supabase.queued_candidate_drafts.return_value = []

    ingestion = DraftIngestion(config)
    processed = ingestion.run()

    assert processed == 0
    mock_supabase.update_candidate_draft.assert_not_called()
    mock_pipeline_cls.assert_not_called()

@patch("cv_intelligence_worker.draft_ingestion.IngestionPipeline")
@patch("cv_intelligence_worker.draft_ingestion.SupabaseClient")
def test_draft_ingestion_successful_processing(mock_supabase_cls, mock_pipeline_cls, config):
    mock_supabase = mock_supabase_cls.return_value
    mock_supabase.queued_candidate_drafts.return_value = [
        {"user_id": "user-123", "id": "draft-123", "cv_storage_path": "test.pdf"}
    ]

    mock_pipeline = mock_pipeline_cls.return_value
    mock_pipeline.ingest_sources.return_value = IngestionResult(
        ingestion_run_id="run-1", total_discovered=1, bundles=[], failures=[], warnings=[], sync_stats={}
    )

    ingestion = DraftIngestion(config)
    processed = ingestion.run()

    assert processed == 1
    mock_supabase.update_candidate_draft.assert_any_call("user-123", {"parse_status": "parsing"})
    mock_supabase.update_candidate_draft.assert_any_call("user-123", {"parse_status": "published"})

@patch("cv_intelligence_worker.draft_ingestion.IngestionPipeline")
@patch("cv_intelligence_worker.draft_ingestion.SupabaseClient")
def test_draft_ingestion_pipeline_failure(mock_supabase_cls, mock_pipeline_cls, config):
    mock_supabase = mock_supabase_cls.return_value
    mock_supabase.queued_candidate_drafts.return_value = [
        {"user_id": "user-123", "id": "draft-123", "cv_storage_path": "test.pdf"}
    ]

    mock_pipeline = mock_pipeline_cls.return_value
    # Simulate an error during pipeline execution
    mock_pipeline.ingest_sources.return_value = IngestionResult(
        ingestion_run_id="run-1", total_discovered=1, bundles=[], warnings=[], sync_stats={},
        failures=[{"source": "test.pdf", "error": "AI Validation Rejected: Unrealistic edits"}]
    )

    ingestion = DraftIngestion(config)
    processed = ingestion.run()

    assert processed == 0
    mock_supabase.update_candidate_draft.assert_any_call("user-123", {"parse_status": "parsing"})

    # Verify the failure was logged to the database
    failed_call = [call for call in mock_supabase.update_candidate_draft.call_args_list if call[0][1].get("parse_status") == "failed"]
    assert len(failed_call) == 1
    assert "Unrealistic edits" in failed_call[0][0][1]["parse_error"]

@patch("cv_intelligence_worker.draft_ingestion.IngestionPipeline")
@patch("cv_intelligence_worker.draft_ingestion.SupabaseClient")
def test_draft_ingestion_db_error_resilience(mock_supabase_cls, mock_pipeline_cls, config):
    mock_supabase = mock_supabase_cls.return_value
    mock_supabase.queued_candidate_drafts.return_value = [
        {"user_id": "user-123", "id": "draft-123"},
        {"user_id": "user-456", "id": "draft-456"}
    ]

    # Make the first update to 'parsing' fail for user-123
    def update_mock(user_id, data):
        if user_id == "user-123" and data.get("parse_status") == "parsing":
            raise Exception("DB Connection lost")
    mock_supabase.update_candidate_draft.side_effect = update_mock

    mock_pipeline = mock_pipeline_cls.return_value
    mock_pipeline.ingest_sources.return_value = IngestionResult(
        ingestion_run_id="run-1", total_discovered=1, bundles=[], failures=[], warnings=[], sync_stats={}
    )

    ingestion = DraftIngestion(config)
    processed = ingestion.run()

    # user-456 should process successfully despite user-123 failing early
    assert processed == 1

    # user-456 should hit 'published'
    published_calls = [call for call in mock_supabase.update_candidate_draft.call_args_list if call[0][1].get("parse_status") == "published"]
    assert len(published_calls) == 1
    assert published_calls[0][0][0] == "user-456"


@patch("cv_intelligence_worker.draft_ingestion.IngestionPipeline")
@patch("cv_intelligence_worker.draft_ingestion.SupabaseClient")
def test_draft_ingestion_records_download_failure_and_deletes_temp_file(
    mock_supabase_cls,
    mock_pipeline_cls,
    config,
    tmp_path,
):
    mock_supabase = mock_supabase_cls.return_value
    mock_supabase.queued_candidate_drafts.return_value = [
        {"user_id": "user-123", "id": "draft-123", "cv_storage_path": "test.pdf"}
    ]
    mock_supabase.download_file.side_effect = RuntimeError("download failed")
    local_path = tmp_path / "download.pdf"
    file_descriptor = os.open(local_path, os.O_CREAT | os.O_RDWR)

    with patch("cv_intelligence_worker.draft_ingestion.tempfile.mkstemp", return_value=(file_descriptor, str(local_path))):
        processed = DraftIngestion(config).run()

    assert processed == 0
    assert not local_path.exists()
    mock_pipeline_cls.assert_not_called()
    mock_supabase.update_candidate_draft.assert_any_call(
        "user-123",
        {"parse_status": "failed", "parse_error": "download failed"},
    )
