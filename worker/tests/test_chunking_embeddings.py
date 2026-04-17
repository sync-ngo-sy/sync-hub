from __future__ import annotations

import unittest

from cv_intelligence_worker.chunking import build_chunks
from cv_intelligence_worker.embeddings import DeterministicEmbedder
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


if __name__ == "__main__":
    unittest.main()
