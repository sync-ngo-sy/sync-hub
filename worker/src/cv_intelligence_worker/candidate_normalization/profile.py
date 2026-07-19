from __future__ import annotations

from dataclasses import replace
from datetime import datetime

from ..schema import CandidateProfile
from ..utils import compact_whitespace, dedupe_keep_order
from .experience import resolve_years_experience
from .locations import normalize_location
from .skills import canonical_skill


def normalize_profile(
    profile: CandidateProfile,
    *,
    as_of: datetime | None = None,
) -> CandidateProfile:
    current_title = compact_whitespace(profile.current_title)
    headline = compact_whitespace(profile.headline)
    normalized_experience = [
        replace(entry, location=normalize_location(entry.location) or None)
        for entry in profile.experience
    ]
    skills = dedupe_keep_order(canonical_skill(skill) for skill in profile.skills)
    role_tags = dedupe_keep_order(
        compact_whitespace(role_tag).lower()
        for role_tag in profile.role_tags
        if compact_whitespace(role_tag)
    )
    aliases = {
        canonical: [raw for raw in profile.skills if canonical_skill(raw).lower() == canonical.lower()]
        for canonical in skills
    }
    return replace(
        profile,
        current_title=current_title,
        headline=headline or current_title,
        location=normalize_location(profile.location),
        skills=skills,
        skill_aliases={key: dedupe_keep_order(values) for key, values in aliases.items()},
        experience=normalized_experience,
        role_tags=role_tags,
        years_experience=resolve_years_experience(
            replace(profile, experience=normalized_experience),
            as_of=as_of,
        ),
        seniority=compact_whitespace(profile.seniority).lower() or "unclassified",
        metadata={
            **profile.metadata,
            "job_family": "Unclassified",
            "job_family_confidence": 0.0,
            "job_family_source": "unclassified",
        },
    )
