from __future__ import annotations

import json
from typing import Any

from ...job_family_taxonomy import JOB_FAMILY_LABELS, JOB_FAMILY_TAXONOMY_VERSION
from ...schema import CandidateProfile
from ...utils import compact_whitespace
from .loader import load_prompt_template


def _build_candidate_system_prompt(response_specific_rules: str = "") -> str:
    return load_prompt_template("candidate_system").render(
        response_specific_rules=f"{response_specific_rules}\n\n" if response_specific_rules else "",
    )


def build_candidate_system_prompt() -> str:
    return _build_candidate_system_prompt()


def build_realtime_candidate_system_prompt() -> str:
    rules = load_prompt_template("realtime_candidate_rules").render()
    return _build_candidate_system_prompt(rules)


def build_job_family_system_prompt() -> str:
    return load_prompt_template("job_family_system").render(
        job_family_labels=json.dumps(list(JOB_FAMILY_LABELS), ensure_ascii=True),
    )


def build_job_family_prompt(profile: CandidateProfile) -> dict[str, Any]:
    return {
        "taxonomy_version": JOB_FAMILY_TAXONOMY_VERSION,
        "candidate_profile": {
            "current_title": profile.current_title,
            "headline": profile.headline,
            "seniority": profile.seniority,
            "role_tags": profile.role_tags,
            "skills": profile.skills[:80],
            "summary": compact_whitespace(profile.summary)[:1200],
            "experience": [
                {
                    "title": entry.title,
                    "company": entry.company,
                    "description": compact_whitespace(entry.description)[:500],
                }
                for entry in profile.experience[:6]
            ],
            "projects": [
                {
                    "name": project.name,
                    "description": compact_whitespace(project.description)[:300],
                    "technologies": project.technologies[:20],
                }
                for project in profile.projects[:4]
            ],
        },
    }
