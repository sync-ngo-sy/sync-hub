from __future__ import annotations

from unittest.mock import Mock

import pytest

from cv_intelligence_worker.artifacts import LLMArtifactGenerator, comparison_key
from cv_intelligence_worker.artifacts.models import ComparisonArtifactOutput, ComparisonItemOutput, SummaryArtifactOutput
from cv_intelligence_worker.config import WorkerConfig
from cv_intelligence_worker.integrations.llm import LLMResponseError
from cv_intelligence_worker.domain.models import CandidateProfile


def _profile(candidate_id: str, *, skills: list[str] | None = None) -> CandidateProfile:
    return CandidateProfile(
        tenant_id="tenant-1",
        candidate_id=candidate_id,
        source_document_id=f"document-{candidate_id}",
        source_sha256=f"sha-{candidate_id}",
        name=f"Candidate {candidate_id}",
        current_title="Backend Engineer",
        role_tags=["Backend Engineer"],
        skills=skills or ["Python", "PostgreSQL"],
        summary="Builds backend services.",
        confidence=0.8,
    )


def _generator(output: object) -> LLMArtifactGenerator:
    client = Mock()
    client.parse.return_value = output
    return LLMArtifactGenerator(WorkerConfig(extraction_model="test-model"), client=client)


def test_summary_uses_validated_model_output_without_adjusting_confidence() -> None:
    output = SummaryArtifactOutput(
        short_summary="Backend engineer.",
        long_summary="Backend engineer with explicit Python and PostgreSQL skills.",
        strengths=["Python and PostgreSQL are explicitly listed."],
        risks=[],
        recommended_roles=["Backend Engineer"],
        evidence_refs=["profile.skills"],
        confidence=0.73,
    )

    artifact = _generator(output).summarize(_profile("candidate-1"), "artifact-v2")

    assert artifact.confidence == 0.73
    assert artifact.recommended_roles == ["Backend Engineer"]
    assert artifact.artifact_version == "artifact-v2"


def test_summary_rejects_unsupported_model_values() -> None:
    output = SummaryArtifactOutput(
        short_summary="Backend engineer.",
        long_summary="Backend engineer.",
        strengths=[],
        risks=[],
        recommended_roles=["Chief Technology Officer"],
        evidence_refs=["profile.skills"],
        confidence=0.5,
    )

    with pytest.raises(LLMResponseError, match="unsupported recommended roles"):
        _generator(output).summarize(_profile("candidate-1"), "artifact-v2")


def test_summary_rejects_unsupported_evidence_reference() -> None:
    output = SummaryArtifactOutput(
        short_summary="Backend engineer.",
        long_summary="Backend engineer.",
        strengths=[],
        risks=[],
        recommended_roles=[],
        evidence_refs=["profile.invented_field"],
        confidence=0.5,
    )

    with pytest.raises(LLMResponseError, match="unsupported evidence references"):
        _generator(output).summarize(_profile("candidate-1"), "artifact-v2")


def test_comparison_requires_exact_candidates_and_profile_backed_skills() -> None:
    output = ComparisonArtifactOutput(
        overall_summary="Both candidates list Python.",
        items=[
            ComparisonItemOutput(
                candidate_id="candidate-1",
                score=80,
                matched_skills=["Python"],
                gaps=[],
                evidence_refs=["profile.skills"],
            ),
            ComparisonItemOutput(
                candidate_id="candidate-2",
                score=60,
                matched_skills=["Python"],
                gaps=["PostgreSQL"],
                evidence_refs=["profile.skills"],
            ),
        ],
        overlap=["Python"],
        recommended_candidate_id="candidate-1",
        evidence_refs=["profile.skills"],
    )

    artifact = _generator(output).compare(
        [_profile("candidate-1"), _profile("candidate-2", skills=["Python"])],
        "artifact-v2",
        query="Python and PostgreSQL",
    )

    assert artifact.recommended_candidate_id == "candidate-1"
    assert [item.candidate_id for item in artifact.items] == ["candidate-1", "candidate-2"]


def test_comparison_rejects_recommendation_without_criteria() -> None:
    output = ComparisonArtifactOutput(
        overall_summary="Neutral comparison.",
        items=[
            ComparisonItemOutput(
                candidate_id="candidate-1",
                score=0,
                matched_skills=[],
                gaps=[],
                evidence_refs=["profile.skills"],
            )
        ],
        overlap=[],
        recommended_candidate_id="candidate-1",
        evidence_refs=["profile.skills"],
    )

    with pytest.raises(LLMResponseError, match="without criteria"):
        _generator(output).compare([_profile("candidate-1")], "artifact-v2")


def test_comparison_rejects_candidate_ids_not_in_request() -> None:
    output = ComparisonArtifactOutput(
        overall_summary="Comparison.",
        items=[
            ComparisonItemOutput(
                candidate_id="invented-candidate",
                score=50,
                matched_skills=[],
                gaps=[],
                evidence_refs=[],
            )
        ],
        overlap=[],
        recommended_candidate_id=None,
        evidence_refs=[],
    )

    with pytest.raises(LLMResponseError, match="candidate IDs do not match"):
        _generator(output).compare([_profile("candidate-1")], "artifact-v2", query="Python")


def test_comparison_rejects_skill_not_in_candidate_profile() -> None:
    output = ComparisonArtifactOutput(
        overall_summary="Comparison.",
        items=[
            ComparisonItemOutput(
                candidate_id="candidate-1",
                score=50,
                matched_skills=["Rust"],
                gaps=[],
                evidence_refs=["profile.skills"],
            )
        ],
        overlap=[],
        recommended_candidate_id=None,
        evidence_refs=["profile.skills"],
    )

    with pytest.raises(LLMResponseError, match="unsupported matched skills"):
        _generator(output).compare([_profile("candidate-1")], "artifact-v2", query="Rust")


def test_comparison_key_is_order_independent() -> None:
    assert comparison_key("tenant-1", ["a", "b"], " Python ") == comparison_key("tenant-1", ["b", "a"], "python")
