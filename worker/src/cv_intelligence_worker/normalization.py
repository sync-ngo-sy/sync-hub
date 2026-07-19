from __future__ import annotations

from dataclasses import replace
from datetime import datetime

from .candidate_normalization.experience import (
    _resolve_as_of,
    experience_years_from_entries as experience_years_from_entries,
    has_dated_education_entries as has_dated_education_entries,
    infer_years_experience,
)
from .candidate_normalization.locations import normalize_location as normalize_location
from .candidate_normalization.roles import (
    infer_job_family as infer_job_family,
    infer_role_tags as infer_role_tags,
    infer_seniority as infer_seniority,
)
from .candidate_normalization.skills import (
    canonical_skill as canonical_skill,
    infer_additional_skills as infer_additional_skills,
)
from .candidate_normalization.titles import (
    count_work_like_experience_entries as count_work_like_experience_entries,
)
from .candidate_normalization.titles import is_title_like as _is_title_like
from .schema import CandidateProfile
from .utils import compact_whitespace, dedupe_keep_order
from .normalization_constants import (
    JOB_FAMILY_TAXONOMY_VERSION,
)


def choose_current_title(profile: CandidateProfile) -> str:
    current_title = compact_whitespace(profile.current_title)
    headline = compact_whitespace(profile.headline)
    experience_titles = [
        compact_whitespace(entry.title)
        for entry in profile.experience
        if _is_title_like(entry.title)
    ]

    if _is_title_like(current_title):
        return current_title
    if _is_title_like(headline, allow_long=True) and len(headline.split()) <= 10:
        return headline
    if experience_titles:
        return experience_titles[0]
    if _is_title_like(headline, allow_long=True):
        return headline
    student_title = _student_title_from_education(profile)
    return current_title or student_title or (experience_titles[0] if experience_titles else "")


def _student_title_from_education(profile: CandidateProfile) -> str:
    for education in profile.education:
        end_date = compact_whitespace(education.end_date or "").lower()
        description = compact_whitespace(education.description).lower()
        text = " ".join(
            compact_whitespace(part)
            for part in (education.degree, education.field, education.institution, education.description)
            if compact_whitespace(part)
        ).lower()
        is_active = end_date in {"present", "current", "now"} or "5th year" in description or "final year" in description
        if not is_active:
            continue
        if "software engineering" in text:
            return "Software Engineering Student"
        if "computer engineering" in text:
            return "Computer Engineering Student"
        if "information technology" in text:
            return "Information Technology Student"
    raw_text = compact_whitespace(profile.raw_text).lower()
    if ("present" in raw_text or "5th year" in raw_text or "final year" in raw_text) and "bachelor" in raw_text:
        if "software engineering" in raw_text:
            return "Software Engineering Student"
        if "computer engineering" in raw_text:
            return "Computer Engineering Student"
        if "information technology" in raw_text:
            return "Information Technology Student"
    return ""


def normalize_profile(
    profile: CandidateProfile,
    *,
    as_of: datetime | None = None,
) -> CandidateProfile:
    reference_time = _resolve_as_of(as_of)
    years_experience = infer_years_experience(profile, as_of=reference_time)
    current_title = choose_current_title(profile)
    headline = compact_whitespace(profile.headline) or current_title
    normalized_experience = [
        replace(entry, location=normalize_location(entry.location) or None)
        for entry in profile.experience
    ]
    location = normalize_location(profile.location)
    if not location:
        for entry in normalized_experience:
            if entry.location:
                location = entry.location
                break
    skills = dedupe_keep_order(
        canonical_skill(skill)
        for skill in [
            *profile.skills,
            *infer_additional_skills(
                replace(
                    profile,
                    current_title=current_title,
                    headline=headline,
                    experience=normalized_experience,
                    location=location,
                )
            ),
        ]
    )
    role_tags = dedupe_keep_order(
        infer_role_tags(
            replace(
                profile,
                current_title=current_title,
                headline=headline,
                skills=skills,
                experience=normalized_experience,
                location=location,
            )
        )
    )
    seniority = infer_seniority(
        replace(
            profile,
            current_title=current_title,
            headline=headline,
            skills=skills,
            experience=normalized_experience,
            location=location,
        ),
        years_experience,
    )
    job_family, job_family_confidence = infer_job_family(
        replace(
            profile,
            current_title=current_title,
            headline=headline,
            skills=skills,
            experience=normalized_experience,
            location=location,
            role_tags=role_tags,
        )
    )
    metadata = {
        **profile.metadata,
        "job_family": job_family,
        "job_family_confidence": job_family_confidence,
        "job_family_taxonomy_version": JOB_FAMILY_TAXONOMY_VERSION,
        "job_family_source": "production_role_tags_skills",
        "job_family_inferred_at": reference_time.isoformat(),
    }
    aliases = {
        canonical: [raw for raw in profile.skills if canonical_skill(raw).lower() == canonical.lower()]
        for canonical in skills
    }
    aliases = {key: dedupe_keep_order(values) for key, values in aliases.items()}
    return replace(
        profile,
        current_title=current_title,
        headline=headline or current_title,
        location=location,
        skills=skills,
        skill_aliases=aliases,
        experience=normalized_experience,
        role_tags=role_tags,
        years_experience=years_experience,
        seniority=seniority,
        metadata=metadata,
    )
