from __future__ import annotations

import io
import json
import os
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

from cv_intelligence_worker.cli import build_parser, main
from cv_intelligence_worker.commands import CommandRegistry, command_registry
from cv_intelligence_worker.config import WorkerConfig
from cv_intelligence_worker.workflows import PublicApplicationIngestionResult
from cv_intelligence_worker.integrations.supabase import SupabaseSyncStats
from tests.test_helpers.profiles import FakeArtifactGenerator, FakeEmbedder, build_test_profile


class CliTests(unittest.TestCase):
    def setUp(self) -> None:
        embedder_patcher = mock.patch("cv_intelligence_worker.workflows.ingestion_pipeline.build_embedder", return_value=FakeEmbedder())
        self.addCleanup(embedder_patcher.stop)
        embedder_patcher.start()
        artifact_patcher = mock.patch(
            "cv_intelligence_worker.workflows.ingestion_pipeline.LLMArtifactGenerator",
            return_value=FakeArtifactGenerator(),
        )
        self.addCleanup(artifact_patcher.stop)
        artifact_patcher.start()

    def test_ingest_command_outputs_run_summary(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "resume.txt"
            path.write_text(
                "Jane Doe\nSenior Backend Engineer\njane@example.com\nPython, PostgreSQL, GraphQL",
                encoding="utf-8",
            )
            buffer = io.StringIO()
            with mock.patch.dict(os.environ, {"CV_WORKER_CACHE_DIR": str(Path(tmpdir) / "cache")}):
                with mock.patch("cv_intelligence_worker.workflows.ingestion_pipeline.extract_candidate_profile", side_effect=build_test_profile):
                    with redirect_stdout(buffer):
                        exit_code = main(["ingest", str(path), "--tenant-id", "tenant-1", "--no-sync"])
            self.assertEqual(0, exit_code)
            output = buffer.getvalue()
            self.assertIn("ingestion_run_id", output)
            self.assertIn("candidate_ids", output)
            self.assertNotIn('"bundles"', output)

    def test_compare_command_outputs_artifact_key(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "resume.txt"
            path.write_text(
                "Jane Doe\nSenior Backend Engineer\njane@example.com\nPython, PostgreSQL, GraphQL",
                encoding="utf-8",
            )
            ingest_buffer = io.StringIO()
            with mock.patch.dict(os.environ, {"CV_WORKER_CACHE_DIR": str(Path(tmpdir) / "cache")}):
                with mock.patch("cv_intelligence_worker.workflows.ingestion_pipeline.extract_candidate_profile", side_effect=build_test_profile):
                    with redirect_stdout(ingest_buffer):
                        exit_code = main(["ingest", str(path), "--tenant-id", "tenant-1", "--no-sync"])
            self.assertEqual(0, exit_code)
            candidate_id = json.loads(ingest_buffer.getvalue())["candidate_ids"][0]

            compare_buffer = io.StringIO()
            with mock.patch.dict(os.environ, {"CV_WORKER_CACHE_DIR": str(Path(tmpdir) / "cache")}):
                with redirect_stdout(compare_buffer):
                    exit_code = main(
                        [
                            "compare",
                            "--tenant-id",
                            "tenant-1",
                            "--candidate-id",
                            candidate_id,
                            "--candidate-id",
                            candidate_id,
                            "--no-sync",
                        ]
                    )
            self.assertEqual(0, exit_code)
            output = compare_buffer.getvalue()
            self.assertIn("artifact_key", output)
            self.assertIn("comparison", output)

    def test_synced_ingest_deletes_local_bundle_cache(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "resume.txt"
            cache_dir = Path(tmpdir) / "cache"
            path.write_text(
                "Jane Doe\nSenior Backend Engineer\njane@example.com\nPython, PostgreSQL, GraphQL",
                encoding="utf-8",
            )
            buffer = io.StringIO()
            env = {
                "CV_WORKER_CACHE_DIR": str(cache_dir),
                "SUPABASE_URL": "http://example.test",
                "SUPABASE_SERVICE_ROLE_KEY": "test-service-role",
                "CV_DELETE_SYNCED_BUNDLES": "true",
            }
            with mock.patch.dict(os.environ, env):
                with mock.patch("cv_intelligence_worker.workflows.ingestion_pipeline.SupabaseClient") as supabase_client_cls:
                    supabase_client_cls.return_value.sync_bundles.return_value = SupabaseSyncStats(bundles=1)
                    with mock.patch("cv_intelligence_worker.workflows.ingestion_pipeline.extract_candidate_profile", side_effect=build_test_profile):
                        with redirect_stdout(buffer):
                            exit_code = main(["ingest", str(path), "--tenant-id", "tenant-1"])
            self.assertEqual(0, exit_code)
            candidate_id = json.loads(buffer.getvalue())["candidate_ids"][0]
            bundle_path = cache_dir / "tenants" / "tenant-1" / "bundles" / f"{candidate_id}.json"
            self.assertFalse(bundle_path.exists())
            supabase_client_cls.return_value.sync_bundles.assert_called_once()

    def test_pending_manatal_sync_allows_partial_failures(self) -> None:
        result = SimpleNamespace(
            fetched_candidates=25,
            queued_candidates=0,
            skipped_candidates=0,
            downloaded_resumes=23,
            synced_resumes=22,
            failures=[{"manatal_candidate_id": "candidate-1", "error": "bad resume"}],
            ingestion_result=None,
        )
        buffer = io.StringIO()
        with mock.patch("cv_intelligence_worker.commands.manatal.ManatalSync") as manatal_sync_cls:
            manatal_sync_cls.return_value.sync.return_value = result
            with redirect_stdout(buffer):
                exit_code = main(["manatal-sync", "--tenant-id", "tenant-1", "--pending"])
        self.assertEqual(0, exit_code)
        output = json.loads(buffer.getvalue())
        self.assertEqual(result.failures, output["failures"])

    def test_explicit_manatal_sync_fails_on_candidate_failure(self) -> None:
        result = SimpleNamespace(
            fetched_candidates=1,
            queued_candidates=0,
            skipped_candidates=0,
            downloaded_resumes=0,
            synced_resumes=0,
            failures=[{"manatal_candidate_id": "candidate-1", "error": "bad resume"}],
            ingestion_result=None,
        )
        buffer = io.StringIO()
        with mock.patch("cv_intelligence_worker.commands.manatal.ManatalSync") as manatal_sync_cls:
            manatal_sync_cls.return_value.sync.return_value = result
            with redirect_stdout(buffer):
                exit_code = main(["manatal-sync", "--tenant-id", "tenant-1", "--candidate-id", "candidate-1"])
        self.assertEqual(2, exit_code)

    def test_manatal_sync_preserves_empty_configured_tenant(self) -> None:
        result = SimpleNamespace(
            fetched_candidates=0,
            queued_candidates=0,
            skipped_candidates=0,
            downloaded_resumes=0,
            synced_resumes=0,
            failures=[],
            ingestion_result=None,
        )
        config = WorkerConfig(device_id="device-fallback", tenant_id="")

        with mock.patch("cv_intelligence_worker.cli.WorkerConfig.from_env", return_value=config):
            with mock.patch("cv_intelligence_worker.commands.manatal.ManatalSync") as manatal_sync_cls:
                manatal_sync_cls.return_value.sync.return_value = result
                with redirect_stdout(io.StringIO()):
                    exit_code = main(["manatal-sync"])

        self.assertEqual(0, exit_code)
        self.assertEqual("", manatal_sync_cls.call_args.args[0].tenant_id)

    def test_public_applications_outputs_queue_summary(self) -> None:
        result = PublicApplicationIngestionResult(
            queued=2,
            parsed=2,
            failed=0,
            application_ids=["application-1", "application-2"],
            candidate_ids=["candidate-1", "candidate-2"],
        )
        buffer = io.StringIO()
        with mock.patch.dict(os.environ, {"SUPABASE_URL": "http://example.test", "SUPABASE_SERVICE_ROLE_KEY": "test-service-role"}):
            with mock.patch("cv_intelligence_worker.commands.queues.PublicApplicationIngestion") as ingestion_cls:
                ingestion_cls.return_value.run.return_value = result
                with redirect_stdout(buffer):
                    exit_code = main(["public-applications", "--limit", "2", "--no-progress"])
        self.assertEqual(0, exit_code)
        output = json.loads(buffer.getvalue())
        self.assertEqual(2, output["queued"])
        self.assertEqual(["candidate-1", "candidate-2"], output["candidate_ids"])
        ingestion_cls.return_value.run.assert_called_once()
        self.assertEqual(2, ingestion_cls.return_value.run.call_args.kwargs["limit"])

    def test_public_applications_fails_when_any_application_fails(self) -> None:
        result = PublicApplicationIngestionResult(
            queued=1,
            parsed=0,
            failed=1,
            application_ids=["application-1"],
            failures=[{"application_id": "application-1", "error": "bad cv"}],
        )
        buffer = io.StringIO()
        with mock.patch.dict(os.environ, {"SUPABASE_URL": "http://example.test", "SUPABASE_SERVICE_ROLE_KEY": "test-service-role"}):
            with mock.patch("cv_intelligence_worker.commands.queues.PublicApplicationIngestion") as ingestion_cls:
                ingestion_cls.return_value.run.return_value = result
                with redirect_stdout(buffer):
                    exit_code = main(["public-applications", "--limit", "1", "--no-progress"])
        self.assertEqual(2, exit_code)
        self.assertEqual("bad cv", json.loads(buffer.getvalue())["failures"][0]["error"])

    def test_process_drafts_command_dispatches_registered_handler(self) -> None:
        buffer = io.StringIO()
        with mock.patch("cv_intelligence_worker.commands.queues.DraftIngestion") as ingestion_cls:
            ingestion_cls.return_value.run.return_value = 3
            with redirect_stdout(buffer):
                exit_code = main(["process-drafts", "--limit", "3", "--no-progress"])

        self.assertEqual(0, exit_code)
        self.assertEqual({"processed": 3}, json.loads(buffer.getvalue()))
        ingestion_cls.return_value.run.assert_called_once()
        self.assertEqual(3, ingestion_cls.return_value.run.call_args.kwargs["limit"])

    def test_parser_commands_match_registered_commands(self) -> None:
        command_action = next(action for action in build_parser()._actions if action.dest == "command")

        self.assertEqual(
            {spec.name for spec in command_registry.specs()},
            set(command_action.choices),
        )

    def test_registry_rejects_duplicate_command_names(self) -> None:
        registry = CommandRegistry()
        decorator = registry.command("example", help="Example", configure=lambda _parser: None)
        decorator(lambda _args, _config: 0)

        with self.assertRaisesRegex(ValueError, "command already registered"):
            decorator(lambda _args, _config: 0)

    def test_registry_rejects_blank_command_names(self) -> None:
        with self.assertRaisesRegex(ValueError, "command name cannot be blank"):
            CommandRegistry().command(" ", help="Invalid", configure=lambda _parser: None)


if __name__ == "__main__":
    unittest.main()
