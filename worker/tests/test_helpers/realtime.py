from typing import Any

from cv_intelligence_worker.llm_models import RealtimeCandidateExtraction


def realtime_extraction(**overrides: Any) -> RealtimeCandidateExtraction:
    values = {
        "name": "Jane Doe",
        "current_title": "Backend Engineer",
        "headline": "Backend Engineer",
        "location": None,
        "email": None,
        "phone": None,
        "links": [],
        "years_experience": 6.0,
        "seniority": "senior",
        "role_tags": ["backend engineer"],
        "skills": [
            {
                "name": "Python",
                "proficiency": "Advanced",
                "years_of_experience": 6.0,
                "last_used": 2026,
            }
        ],
        "languages": ["English"],
        "certifications": [],
        "experience": [],
        "education": [],
        "projects": [],
        "summary": "Backend engineer.",
        "confidence": 0.9,
        "field_confidence": {"name": 95},
    }
    values.update(overrides)
    return RealtimeCandidateExtraction.model_validate(values)
