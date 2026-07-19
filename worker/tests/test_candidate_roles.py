from cv_intelligence_worker.candidate_normalization import (
    infer_job_family,
    infer_role_tags,
    infer_seniority,
)
from cv_intelligence_worker.schema import CandidateProfile, ExperienceEntry


def _profile(**overrides: object) -> CandidateProfile:
    return CandidateProfile(
        tenant_id="tenant-1",
        candidate_id="candidate-1",
        source_document_id="document-1",
        source_sha256="sha-1",
        **overrides,
    )


def test_seniority_rejects_unsupported_staff_plus_label() -> None:
    profile = _profile(seniority="staff-plus", current_title="Backend Engineer")

    assert infer_seniority(profile, 0.0) == "unclassified"


def test_seniority_keeps_explicit_label_when_profile_supports_it() -> None:
    profile = _profile(seniority="senior", current_title="Senior Backend Engineer")

    assert infer_seniority(profile, 0.0) == "senior"


def test_role_scoring_prioritizes_mobile_evidence() -> None:
    profile = _profile(
        current_title="Flutter Developer",
        headline="Flutter and React Developer",
        skills=["Flutter", "React", "Firebase"],
        experience=[ExperienceEntry(company="Product", title="Flutter Developer")],
    )

    roles = infer_role_tags(profile)

    assert roles[0] == "mobile"
    assert "frontend" in roles


def test_job_family_uses_combined_role_tags() -> None:
    profile = _profile(
        current_title="Software Engineer",
        role_tags=["backend", "frontend"],
        skills=["React", "Node.js", "PostgreSQL"],
    )

    family, confidence = infer_job_family(profile)

    assert family == "Full-Stack Engineering"
    assert confidence > 0.5
