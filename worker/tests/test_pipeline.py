from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest import mock

from cv_intelligence_worker.config import WorkerConfig
from cv_intelligence_worker.discovery import discover_documents
from cv_intelligence_worker.extraction import heuristic_extract_profile
from cv_intelligence_worker.pipeline import IngestionPipeline


def _test_extract_profile(source, document_text, config):
    return heuristic_extract_profile(source, document_text)


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

            with mock.patch("cv_intelligence_worker.pipeline.extract_candidate_profile", side_effect=_test_extract_profile):
                result = IngestionPipeline(config).ingest_sources(
                    sources,
                    tenant_id="tenant-1",
                    sync_to_supabase=False,
                    progress=progress_messages.append,
                )

        self.assertEqual(2, result.total_discovered)
        self.assertEqual(1, len(result.bundles))
        self.assertEqual(1, result.sync_stats["duplicate_source_files_skipped"])
        self.assertIn("processed 1/1 documents; completed=1 failures=0", progress_messages)


if __name__ == "__main__":
    unittest.main()
