from __future__ import annotations

from ..schema import CandidateProfile


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
    if not (profile.experience or profile.projects or profile.years_experience > 0):
        missing_fields.append("experience")
    return missing_fields
