from __future__ import annotations

import os
import unittest
from unittest import mock

from cv_intelligence_worker.config import WorkerConfig


class WorkerConfigTests(unittest.TestCase):
    def test_prompt_version_defaults_to_structured_output_v3(self) -> None:
        with mock.patch.dict(os.environ, {}, clear=True):
            config = WorkerConfig.from_env()

        self.assertEqual("structured-output-v3", config.prompt_version)

    def test_embedding_defaults_are_explicitly_unconfigured_without_model_credentials(self) -> None:
        with mock.patch.dict(os.environ, {}, clear=True):
            config = WorkerConfig.from_env()

        self.assertEqual("openai-compatible", config.embedding_provider)
        self.assertEqual("", config.embedding_model)
        self.assertEqual("embedding-unconfigured-v1", config.embedding_version)

    def test_embedding_version_follows_explicit_model_configuration(self) -> None:
        with mock.patch.dict(os.environ, {"CV_EMBEDDING_MODEL": "text-embedding-3-small"}, clear=True):
            config = WorkerConfig.from_env()

        self.assertEqual("text-embedding-3-small-v1", config.embedding_version)

    def test_batch_size_does_not_implicitly_change_ingest_concurrency(self) -> None:
        env = {
            "CV_BATCH_SIZE": "2",
        }
        with mock.patch.dict(os.environ, env, clear=True):
            config = WorkerConfig.from_env()

        self.assertEqual(2, config.batch_size)
        self.assertEqual(8, config.ingest_concurrency)

    def test_ingest_concurrency_has_a_dedicated_env_override(self) -> None:
        env = {
            "CV_BATCH_SIZE": "2",
            "CV_INGEST_CONCURRENCY": "5",
        }
        with mock.patch.dict(os.environ, env, clear=True):
            config = WorkerConfig.from_env()

        self.assertEqual(2, config.batch_size)
        self.assertEqual(5, config.ingest_concurrency)


if __name__ == "__main__":
    unittest.main()
