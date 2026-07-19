from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest import mock

from cv_intelligence_worker.config import WorkerConfig
from cv_intelligence_worker.documents import discover_documents
from cv_intelligence_worker.workflows import IngestionPipeline
from cv_intelligence_worker.domain.models import DocumentSource
from tests.test_helpers.profiles import FakeArtifactGenerator, FakeEmbedder, build_test_profile


class IngestionPipelineTests(unittest.TestCase):
    def test_deduped_ingestion_preserves_discovered_count_and_reports_completion(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            first = root / "first.txt"
            second = root / "second.txt"
            resume_text = "Jane Doe\nSenior Backend Engineer\njane@example.com\nPython, PostgreSQL, GraphQL"
            first.write_text(resume_text, encoding="utf-8")
            second.write_text(resume_text, encoding="utf-8")

            sources = discover_documents([str(root)], tenant_id="tenant-1", ingestion_run_id="run-1")
            progress_messages: list[str] = []
            config = WorkerConfig(
                cache_dir=str(root / "cache"),
                dedupe_source_documents=True,
                ingest_concurrency=1,
                progress_interval=25,
            )

            with mock.patch("cv_intelligence_worker.workflows.ingestion_pipeline.extract_candidate_profile", side_effect=build_test_profile):
                result = IngestionPipeline(config, embedder=FakeEmbedder(), artifact_generator=FakeArtifactGenerator()).ingest_sources(
                    sources,
                    tenant_id="tenant-1",
                    sync_to_supabase=False,
                    progress=progress_messages.append,
                )

        self.assertEqual(2, result.total_discovered)
        self.assertEqual(1, len(result.bundles))
        self.assertEqual(1, result.sync_stats["duplicate_source_files_skipped"])
        self.assertIn("processed 1/1 documents; completed=1 failures=0", progress_messages)

    def test_source_failure_is_isolated_and_reported(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            config = WorkerConfig(
                cache_dir=str(root / "cache"),
                ingest_concurrency=1,
                progress_interval=1,
            )
            sources = [
                DocumentSource(
                    tenant_id="tenant-1",
                    source_path="bad.pdf",
                    source_type="file",
                    original_filename="bad.pdf",
                    mime_type="application/pdf",
                    document_id="bad",
                    document_sha256="bad-sha",
                    ingestion_run_id="run-1",
                ),
                DocumentSource(
                    tenant_id="tenant-1",
                    source_path="good.pdf",
                    source_type="file",
                    original_filename="good.pdf",
                    mime_type="application/pdf",
                    document_id="good",
                    document_sha256="good-sha",
                    ingestion_run_id="run-1",
                ),
            ]
            pipeline = IngestionPipeline(config, embedder=FakeEmbedder(), artifact_generator=FakeArtifactGenerator())

            def build_bundle(source: DocumentSource, _ingestion_run_id: str):
                if source.document_id == "bad":
                    raise RuntimeError("synthetic parse failure")
                return mock.sentinel.bundle, root / "good.bundle.json"

            progress_messages: list[str] = []
            with mock.patch.object(pipeline, "_build_bundle", side_effect=build_bundle):
                result = pipeline.ingest_sources(
                    sources,
                    tenant_id="tenant-1",
                    sync_to_supabase=False,
                    progress=progress_messages.append,
                )

        self.assertEqual([mock.sentinel.bundle], result.bundles)
        self.assertEqual([{"source_path": "bad.pdf", "error": "RuntimeError: synthetic parse failure"}], result.failures)
        self.assertIn("processed 2/2 documents; completed=1 failures=1", progress_messages)


if __name__ == "__main__":
    unittest.main()
