from __future__ import annotations

from datetime import datetime, timezone

from cv_intelligence_worker.normalization import normalize_location, normalize_profile
from cv_intelligence_worker.schema import CandidateProfile, ExperienceEntry


def _profile(**overrides: object) -> CandidateProfile:
    payload = {
        "tenant_id": "tenant-1",
        "candidate_id": "candidate-1",
        "source_document_id": "doc-1",
        "source_sha256": "sha-1",
        "name": "Candidate",
        "current_title": "Backend Engineer",
        "headline": "Backend Engineer",
        "location": "Damascus, Syria",
        "email": "candidate@example.com",
        "seniority": "mid",
        "role_tags": ["backend"],
        "skills": ["Python"],
    }
    payload.update(overrides)
    return CandidateProfile(**payload)


def test_normalization_preserves_explicit_profile_classification() -> None:
    profile = _profile(
        current_title="  Principal Platform Engineer  ",
        headline="  Platform Engineering  ",
        seniority="staff-plus",
        role_tags=["Platform", "platform", "Backend"],
    )

    normalized = normalize_profile(profile)

    assert normalized.current_title == "Principal Platform Engineer"
    assert normalized.headline == "Platform Engineering"
    assert normalized.seniority == "staff-plus"
    assert normalized.role_tags == ["platform", "backend"]


def test_normalization_does_not_infer_profile_facts_from_raw_text() -> None:
    profile = _profile(
        current_title="",
        headline="",
        seniority="unclassified",
        role_tags=[],
        skills=[],
        raw_text="Senior Flutter Developer using Firebase, React, Docker, and Kubernetes.",
    )

    normalized = normalize_profile(profile)

    assert normalized.current_title == ""
    assert normalized.headline == ""
    assert normalized.seniority == "unclassified"
    assert normalized.role_tags == []
    assert normalized.skills == []


def test_normalization_calculates_years_from_structured_dates() -> None:
    profile = _profile(
        years_experience=20,
        experience=[
            ExperienceEntry(company="First", title="Engineer", start_date="2020-01", end_date="2021-12"),
            ExperienceEntry(company="Second", title="Engineer", start_date="2021-01", end_date="2022-12"),
        ],
    )

    normalized = normalize_profile(
        profile,
        as_of=datetime(2024, 6, 1, tzinfo=timezone.utc),
    )

    assert normalized.years_experience == 3.0


def test_normalization_uses_validated_years_when_roles_have_no_dates() -> None:
    normalized = normalize_profile(_profile(years_experience=6.5, experience=[]))

    assert normalized.years_experience == 6.5


def test_normalization_does_not_copy_location_from_employment() -> None:
    profile = _profile(
        location="",
        experience=[
            ExperienceEntry(
                company="Example",
                title="Engineer",
                location="Montreal, Canada",
            )
        ],
    )

    normalized = normalize_profile(profile)

    assert normalized.location == ""
    assert normalized.experience[0].location == "Montreal, Canada"


def test_normalization_marks_job_family_unclassified_until_model_classifies_it() -> None:
    normalized = normalize_profile(
        _profile(
            metadata={
                "job_family": "Backend Engineering",
                "job_family_confidence": 0.95,
                "job_family_source": "rules",
            }
        )
    )

    assert normalized.metadata["job_family"] == "Unclassified"
    assert normalized.metadata["job_family_confidence"] == 0.0
    assert normalized.metadata["job_family_source"] == "unclassified"


def test_normalize_location_canonicalizes_without_inferred_country() -> None:
    assert normalize_location("Damscus") == "Damascus"
    assert normalize_location("Damascus syria") == "Damascus, Syria"
    assert normalize_location("Damascus, syria") == "Damascus, Syria"


def test_normalize_location_discards_non_geographic_values() -> None:
    assert normalize_location("ERP, CRM") == ""
