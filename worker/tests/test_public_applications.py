from pathlib import Path
from unittest.mock import patch

from cv_intelligence_worker.config import WorkerConfig
from cv_intelligence_worker.pipeline import IngestionResult
from cv_intelligence_worker.public_applications import PublicApplicationIngestion


def _config(tmp_path: Path) -> WorkerConfig:
    return WorkerConfig(
        supabase_url="https://supabase.test",
        supabase_service_key="service-key",
        cache_dir=str(tmp_path),
    )


def _application(application_id: str) -> dict[str, object]:
    return {
        "id": application_id,
        "tenant_id": "tenant-1",
        "resume_storage_path": f"applications/{application_id}.pdf",
        "resume_original_filename": "candidate.pdf",
    }


def _write_download(_bucket: str, _storage_path: str, target: str) -> None:
    path = Path(target)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b"synthetic cv")


@patch("cv_intelligence_worker.public_applications.IngestionPipeline")
@patch("cv_intelligence_worker.public_applications.SupabaseClient")
def test_public_application_ingestion_completes_candidate_link(
    supabase_class,
    pipeline_class,
    tmp_path: Path,
) -> None:
    supabase = supabase_class.return_value
    supabase.queued_public_job_applications.return_value = [_application("application-1")]
    supabase.download_file.side_effect = _write_download
    supabase.source_document.return_value = {"candidate_id": "candidate-1"}
    pipeline_class.return_value.ingest_sources.return_value = IngestionResult(
        ingestion_run_id="run-1",
        total_discovered=1,
        bundles=[],
        failures=[],
        warnings=[],
        sync_stats={},
    )

    result = PublicApplicationIngestion(_config(tmp_path)).run()

    assert result.queued == 1
    assert result.parsed == 1
    assert result.failed == 0
    assert result.candidate_ids == ["candidate-1"]
    supabase.update_job_application.assert_any_call(
        "application-1",
        {
            "candidate_id": "candidate-1",
            "candidate_source_tenant_id": "tenant-1",
            "resume_ingestion_status": "parsed",
            "resume_ingestion_error": None,
        },
    )
    supabase.record_job_application_event.assert_called_once()


@patch("cv_intelligence_worker.public_applications.IngestionPipeline")
@patch("cv_intelligence_worker.public_applications.SupabaseClient")
def test_public_application_ingestion_continues_when_failure_reporting_fails(
    supabase_class,
    pipeline_class,
    tmp_path: Path,
) -> None:
    supabase = supabase_class.return_value
    supabase.queued_public_job_applications.return_value = [
        _application("application-bad"),
        _application("application-good"),
    ]
    supabase.download_file.side_effect = _write_download
    supabase.source_document.return_value = {"candidate_id": "candidate-good"}

    def update_application(application_id: str, _payload: dict[str, object]) -> None:
        if application_id == "application-bad":
            raise RuntimeError("database unavailable")

    supabase.update_job_application.side_effect = update_application
    pipeline_class.return_value.ingest_sources.return_value = IngestionResult(
        ingestion_run_id="run-1",
        total_discovered=1,
        bundles=[],
        failures=[],
        warnings=[],
        sync_stats={},
    )

    result = PublicApplicationIngestion(_config(tmp_path)).run()

    assert result.parsed == 1
    assert result.failed == 1
    assert result.candidate_ids == ["candidate-good"]
    assert result.failures[0]["application_id"] == "application-bad"
    assert "database unavailable" in result.failures[0]["reporting_error"]
