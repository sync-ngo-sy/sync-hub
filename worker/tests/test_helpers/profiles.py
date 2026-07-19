from __future__ import annotations

from cv_intelligence_worker.domain.models import (
    CandidateProfile,
    ChunkRecord,
    ComparisonArtifact,
    DocumentSource,
    DocumentText,
    EmbeddingRecord,
    ExperienceEntry,
    SummaryArtifact,
)
from cv_intelligence_worker.core.identifiers import stable_uuid


class FakeEmbedder:
    def embed_chunks(self, chunks: list[ChunkRecord]) -> list[EmbeddingRecord]:
        return [
            EmbeddingRecord(
                tenant_id=chunk.tenant_id,
                candidate_id=chunk.candidate_id,
                chunk_id=chunk.chunk_id,
                embedding=[1.0, 0.0],
                embedding_version="test-v1",
                provider="test",
            )
            for chunk in chunks
        ]


class FakeArtifactGenerator:
    def summarize(self, profile: CandidateProfile, artifact_version: str) -> SummaryArtifact:
        return SummaryArtifact(
            tenant_id=profile.tenant_id,
            candidate_id=profile.candidate_id,
            short_summary=profile.summary,
            long_summary=profile.summary,
            strengths=[],
            risks=[],
            recommended_roles=profile.role_tags,
            evidence_refs=["profile.summary"],
            confidence=profile.confidence,
            artifact_version=artifact_version,
        )

    def compare(self, profiles: list[CandidateProfile], artifact_version: str, query: str = "") -> ComparisonArtifact:
        return ComparisonArtifact(
            tenant_id=profiles[0].tenant_id,
            candidate_ids=[profile.candidate_id for profile in profiles],
            overall_summary="Test comparison.",
            items=[],
            overlap=[],
            recommended_candidate_id="",
            evidence_refs=[],
            artifact_version=artifact_version,
        )


def build_test_profile(
    source: DocumentSource,
    document_text: DocumentText,
    _config: object | None = None,
) -> CandidateProfile:
    return CandidateProfile(
        tenant_id=source.tenant_id,
        candidate_id=stable_uuid(source.tenant_id, source.document_id),
        source_document_id=source.document_id,
        source_sha256=source.document_sha256,
        name="Jane Doe",
        current_title="Senior Backend Engineer",
        headline="Senior Backend Engineer",
        location="Damascus, Syria",
        email="jane@example.com",
        role_tags=["backend"],
        skills=["Python", "PostgreSQL", "GraphQL"],
        experience=[
            ExperienceEntry(
                company="Example",
                title="Senior Backend Engineer",
                start_date="2020-01",
                end_date="Present",
                description="Built Python and GraphQL services backed by PostgreSQL.",
            )
        ],
        summary="Senior backend engineer building reliable API services.",
        raw_text=document_text.raw_text,
        metadata={"extraction_source": "test_fixture"},
        confidence=0.9,
    )
