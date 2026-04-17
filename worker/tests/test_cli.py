from __future__ import annotations

import io
import json
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path

from cv_intelligence_worker.cli import main


class CliTests(unittest.TestCase):
    def test_ingest_command_outputs_run_summary(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "resume.txt"
            path.write_text(
                "Jane Doe\nSenior Backend Engineer\njane@example.com\nPython, PostgreSQL, GraphQL",
                encoding="utf-8",
            )
            buffer = io.StringIO()
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
            with redirect_stdout(ingest_buffer):
                exit_code = main(["ingest", str(path), "--tenant-id", "tenant-1", "--no-sync"])
            self.assertEqual(0, exit_code)
            candidate_id = json.loads(ingest_buffer.getvalue())["candidate_ids"][0]

            compare_buffer = io.StringIO()
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


if __name__ == "__main__":
    unittest.main()
