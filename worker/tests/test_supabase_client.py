from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest import mock

from cv_intelligence_worker.config import WorkerConfig
from cv_intelligence_worker.discovery import stable_document_id
from cv_intelligence_worker.extraction import heuristic_extract_profile
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

    def resolve_source_document_id(self, tenant_id: str, document_sha256: str, fallback_id: str) -> str:
        return fallback_id

    def resolve_candidate_id(self, tenant_id: str, email: str, source_document_id: str, fallback_id: str) -> str:
        return fallback_id

    def _resolve_bundle_identities(self, bundles):
        return [(bundle.source.document_id, bundle.profile.candidate_id) for bundle in bundles]

    def capacity_warnings(self, tenant_id: str, estimated_database_bytes: int = 0, estimated_storage_bytes: int = 0):
        return []


class FlakySupabaseClient(RecordingSupabaseClient):
    def __init__(self, config: WorkerConfig) -> None:
        super().__init__(config)
        self.failures_remaining = 1

    def upsert(self, table: str, rows, on_conflict: str):
        if table == "candidate_chunks" and len(rows) > 1 and self.failures_remaining:
            self.failures_remaining -= 1
            raise RuntimeError('Supabase POST /rest/v1/candidate_chunks failed (500): {"code":"57014","message":"canceling statement due to statement timeout"}')
        return super().upsert(table, rows, on_conflict)


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
                sync_originals_to_storage=True,
                cache_dir=str(Path(tmpdir) / "cache"),
            )
            pipeline = IngestionPipeline(config)
            with mock.patch("cv_intelligence_worker.pipeline.extract_candidate_profile", side_effect=lambda source, document, config: heuristic_extract_profile(source, document)):
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

    def test_chunk_ids_are_scoped_to_source_document(self) -> None:
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
                sync_originals_to_storage=False,
                cache_dir=str(Path(tmpdir) / "cache"),
            )
            pipeline = IngestionPipeline(config)
            with mock.patch("cv_intelligence_worker.pipeline.extract_candidate_profile", side_effect=lambda source, document, config: heuristic_extract_profile(source, document)):
                result = pipeline.ingest_paths([str(path)], tenant_id="tenant-1", sync_to_supabase=False)
            bundle = result.bundles[0]
            client = RecordingSupabaseClient(config)
            first_rows, _ = client._rows_for_bundle(bundle, "source-a", bundle.profile.candidate_id)
            second_rows, _ = client._rows_for_bundle(bundle, "source-b", bundle.profile.candidate_id)
            first_chunk_ids = {row["id"] for row in first_rows["candidate_chunks"]}
            second_chunk_ids = {row["id"] for row in second_rows["candidate_chunks"]}
            self.assertTrue(first_chunk_ids)
            self.assertTrue(second_chunk_ids)
            self.assertTrue(first_chunk_ids.isdisjoint(second_chunk_ids))

    def test_sync_bundle_splits_retryable_chunk_timeouts(self) -> None:
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
                supabase_batch_size=50,
            )
            pipeline = IngestionPipeline(config)
            with mock.patch("cv_intelligence_worker.pipeline.extract_candidate_profile", side_effect=lambda source, document, config: heuristic_extract_profile(source, document)):
                result = pipeline.ingest_paths([str(path)], tenant_id="tenant-1", sync_to_supabase=False)
            client = FlakySupabaseClient(config)
            client.sync_bundle(result.bundles[0])
            chunk_calls = [rows for table, rows, _on_conflict in client.upsert_calls if table == "candidate_chunks"]
            self.assertGreaterEqual(len(chunk_calls), 2)
            self.assertTrue(all(len(rows) >= 1 for rows in chunk_calls))


if __name__ == "__main__":
    unittest.main()
