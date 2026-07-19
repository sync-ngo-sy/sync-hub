from __future__ import annotations

from cv_intelligence_worker.schema import CandidateProfile, DocumentSource, DocumentText, ExperienceEntry
from cv_intelligence_worker.utils import stable_uuid


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
