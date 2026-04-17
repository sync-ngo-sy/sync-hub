from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from cv_intelligence_worker.config import WorkerConfig
from cv_intelligence_worker.discovery import stable_document_id
from cv_intelligence_worker.pipeline import IngestionPipeline
from cv_intelligence_worker.supabase import SupabaseClient


class RecordingSupabaseClient(SupabaseClient):
    def __init__(self, config: WorkerConfig) -> None:
        super().__init__(config)
        self.upload_calls = []
        self.upsert_calls = []

    def upload_file(self, bucket: str, object_path: str, file_path: str, content_type: str) -> None:
        self.upload_calls.append((bucket, object_path, file_path, content_type))

    def upsert(self, table: str, rows, on_conflict: str):
        self.upsert_calls.append((table, rows, on_conflict))
        return {"table": table, "count": len(rows)}


class SupabaseClientTests(unittest.TestCase):
    def test_stable_document_id_depends_on_tenant_path_and_content_hash(self) -> None:
        first = stable_document_id("tenant-1", "/tmp/first.pdf", "sha-1")
        second = stable_document_id("tenant-1", "/tmp/second.pdf", "sha-1")
        third = stable_document_id("tenant-2", "/tmp/first.pdf", "sha-1")
        fourth = stable_document_id("tenant-1", "/tmp/first.pdf", "sha-1")
        self.assertNotEqual(first, second)
        self.assertNotEqual(first, third)
        self.assertEqual(first, fourth)

    def test_sync_bundle_serializes_expected_tables(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "resume.txt"
            path.write_text(
                "Jane Doe\nSenior Backend Engineer\njane@example.com\nPython, PostgreSQL, GraphQL",
                encoding="utf-8",
            )
            config = WorkerConfig(
                source_dir=str(Path(tmpdir)),
                tenant_id="tenant-1",
                supabase_url="https://example.supabase.co",
                supabase_anon_key="anon",
                cache_dir=str(Path(tmpdir) / "cache"),
            )
            pipeline = IngestionPipeline(config)
            result = pipeline.ingest_paths([str(path)], tenant_id="tenant-1", sync_to_supabase=False)
            bundle = result.bundles[0]
            client = RecordingSupabaseClient(config)
            client.sync_bundle(bundle)
            tables = [call[0] for call in client.upsert_calls]
            upsert_targets = {table: on_conflict for table, _, on_conflict in client.upsert_calls}
            self.assertIn("candidates", tables)
            self.assertIn("candidate_summaries", tables)
            self.assertIn("candidate_chunks", tables)
            self.assertIn("processing_runs", tables)
            self.assertTrue(client.upload_calls)
            self.assertEqual(upsert_targets["source_documents"], "tenant_id,document_sha256")
            self.assertEqual(upsert_targets["processing_runs"], "tenant_id,input_hash")


if __name__ == "__main__":
    unittest.main()
