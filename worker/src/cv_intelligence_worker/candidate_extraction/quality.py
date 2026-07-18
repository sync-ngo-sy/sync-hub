from __future__ import annotations

from ..schema import CandidateProfile, DocumentText


def missing_profile_fields(profile: CandidateProfile) -> list[str]:
    missing_fields: list[str] = []
    if not profile.name:
        missing_fields.append("name")
    if not profile.current_title:
        missing_fields.append("current_title")
    if not (profile.email or profile.phone or profile.links):
        missing_fields.append("contact")
    if not profile.skills:
        missing_fields.append("skills")
    if not _has_professional_activity(profile):
        missing_fields.append("experience")
    return missing_fields


def calculate_profile_confidence(profile: CandidateProfile, document_text: DocumentText) -> float:
    raw_text_length = len(document_text.raw_text.strip())
    identity_score = 1.0 if profile.name and profile.current_title else 0.55 if profile.name or profile.current_title else 0.0
    contact_score = (0.65 if profile.email else 0.0) + (0.35 if profile.phone else 0.0)
    skills_score = _fraction_at_least(len(profile.skills), 6)
    employment_score = 1.0 if len(profile.experience) >= 2 else 0.65 if profile.experience else 0.0
    project_score = 1.0 if len(profile.projects) >= 3 else 0.75 if profile.projects else 0.0
    stated_experience_score = 0.65 if profile.years_experience > 0 else 0.0
    education_activity_score = 0.65 if profile.education and "student" in profile.current_title.lower() else 0.0
    experience_score = max(employment_score, project_score, stated_experience_score, education_activity_score)
    education_score = 1.0 if profile.education else 0.0
    raw_text_score = 1.0 if raw_text_length >= 1200 else 0.55 if raw_text_length >= 300 else 0.0
    facets_score = (
        1.0
        if profile.years_experience > 0 and profile.seniority and profile.role_tags
        else 0.55
        if profile.years_experience > 0 or profile.role_tags
        else 0.0
    )
    summary_score = 1.0 if len(profile.summary) >= 120 else 0.65 if profile.summary else 0.0
    supplemental_score = min(
        1.0,
        (len(profile.links) * 0.35) + (len(profile.projects) * 0.25) + (len(profile.certifications) * 0.2) + (len(profile.languages) * 0.1),
    )
    weighted_scores = [
        (raw_text_score, 10),
        (identity_score, 16),
        (contact_score, 12),
        (skills_score, 16),
        (experience_score, 18),
        (education_score, 8),
        (1.0 if profile.location else 0.0, 5),
        (summary_score, 5),
        (facets_score, 8),
        (supplemental_score, 2),
    ]
    total_weight = sum(weight for _score, weight in weighted_scores)
    confidence = sum(score * weight for score, weight in weighted_scores) / total_weight
    warning_penalty = min(0.12, len(document_text.warnings) * 0.03)
    if raw_text_length < 300:
        confidence = min(confidence, 0.45)
    return round(max(0.0, min(0.99, confidence - warning_penalty)), 2)


def _has_professional_activity(profile: CandidateProfile) -> bool:
    if profile.experience or profile.projects or profile.years_experience > 0:
        return True
    return bool(profile.education and "student" in profile.current_title.lower())


def _fraction_at_least(count: int, target: int) -> float:
    if target <= 0:
        return 1.0
    return min(1.0, count / target)
