from __future__ import annotations

import unittest
from unittest.mock import MagicMock

from cv_intelligence_worker.chunking import build_chunks
from cv_intelligence_worker.config import WorkerConfig
from cv_intelligence_worker.embeddings import DeterministicEmbedder, SDKEmbedder, build_embedder
from cv_intelligence_worker.schema import CandidateProfile, ExperienceEntry


class ChunkingEmbeddingTests(unittest.TestCase):
    def _profile(self) -> CandidateProfile:
        return CandidateProfile(
            tenant_id="tenant-1",
            candidate_id="candidate-1",
            source_document_id="doc-1",
            source_sha256="sha",
            name="Jane Doe",
            current_title="Backend Engineer",
            headline="Backend Engineer",
            years_experience=6,
            seniority="senior",
            role_tags=["backend"],
            skills=["Python", "PostgreSQL", "GraphQL"],
            experience=[
                ExperienceEntry(
                    company="Example",
                    title="Backend Engineer",
                    start_date="2020",
                    end_date="Present",
                    description="Built APIs and data services " * 80,
                )
            ],
        )

    def test_build_chunks_includes_overview_and_experience(self) -> None:
        chunks = build_chunks(self._profile(), "v1")
        self.assertTrue(any(chunk.chunk_type == "profile_overview" for chunk in chunks))
        self.assertTrue(any(chunk.chunk_type == "experience" for chunk in chunks))

    def test_deterministic_embedder_is_stable(self) -> None:
        embedder = DeterministicEmbedder(16, "det-v1")
        first = embedder.embed_text("python graphql postgres")
        second = embedder.embed_text("python graphql postgres")
        self.assertEqual(first, second)
        self.assertEqual(len(first), 16)

    def test_sdk_embedder_uses_validated_client_results(self) -> None:
        chunks = build_chunks(self._profile(), "v1")[:2]
        client = MagicMock()
        client.embed.return_value = [[0.1, 0.2], [0.3, 0.4]]
        config = WorkerConfig(
            embedding_provider="openai",
            embedding_model="gemini-embedding-001",
            embedding_dimension=2,
            embedding_version="gemini-v1",
        )

        records = SDKEmbedder(config, client=client).embed_chunks(chunks)

        self.assertEqual([record.embedding for record in records], client.embed.return_value)
        self.assertTrue(all(record.provider == "openai" for record in records))
        client.embed.assert_called_once_with(
            model="gemini-embedding-001",
            inputs=[chunk.text for chunk in chunks],
            dimensions=2,
            expected_dimension=2,
        )

    def test_sdk_embedder_skips_empty_batches(self) -> None:
        client = MagicMock()

        self.assertEqual(SDKEmbedder(WorkerConfig(), client=client).embed_chunks([]), [])
        client.embed.assert_not_called()

    def test_network_embedding_providers_share_sdk_embedder(self) -> None:
        for provider in ("openai", "local-openai", "ollama", "ollama-openai"):
            with self.subTest(provider=provider):
                self.assertIsInstance(build_embedder(WorkerConfig(embedding_provider=provider)), SDKEmbedder)


if __name__ == "__main__":
    unittest.main()
