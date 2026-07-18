from __future__ import annotations

import json
from typing import Any

from ..llm_models import CandidateExtraction, JobFamilyExtraction
from ..normalization_constants import JOB_FAMILY_LABELS, JOB_FAMILY_TAXONOMY_VERSION
from ..schema import CandidateProfile
from ..utils import compact_whitespace


def build_candidate_system_prompt() -> str:
    schema_text = json.dumps(CandidateExtraction.model_json_schema(), indent=2, ensure_ascii=True)
    return (
        "Transform the input CV or profile text into structured JSON that matches the provided schema.\n\n"
        "Requirements:\n"
        "- Return valid JSON only.\n"
        "- Do not return markdown, comments, or explanations.\n"
        "- Follow the schema exactly.\n"
        "- Do not hallucinate or infer unsupported facts.\n"
        "- If a value is missing, use null for scalar fields and [] for arrays.\n"
        "- Preserve meaning and keep extracted descriptions concise but faithful to the source.\n"
        "- Remove duplicates and trim whitespace.\n\n"
        "Extraction rules:\n"
        "- Use the document header and first visible lines for identity, title, email, phone, links, and location.\n"
        "- Contact details may appear on the same line as the candidate name or title.\n"
        "- Treat labeled sections such as EXPERIENCE, EDUCATION, PROJECTS, CERTIFICATIONS, SKILLS, and LANGUAGES as the primary source of truth.\n"
        "- When section labels are present, prefer them over inference.\n"
        "- If the CV has no explicit EXPERIENCE label, extract work history from clear role/company/date blocks anywhere in the document.\n"
        "- If the CV has no explicit SKILLS label, extract skills only from explicit skill lists, tool lists, technologies, or repeated concrete capabilities in role descriptions.\n"
        "- Do not mix data across clearly labeled sections.\n"
        "- Do not use education, certifications, training, or course dates as work experience dates.\n"
        "- Populate experience from the EXPERIENCE section when present; otherwise use clearly structured employment blocks.\n"
        "- Use PRE_EXPERIENCE_DATE_HINTS only if it appears immediately before the EXPERIENCE section.\n"
        "- Keep training, internships, courses, and degrees under education unless they are explicitly presented as employment or work experience.\n"
        "- Do not split one role into multiple jobs because of subheadings such as Project Leadership, Client Engagement, Responsibilities, Achievements, or similar labels.\n"
        "- Bind dates, location, and description content to the nearest relevant role or education entry.\n"
        "- If multiple distinct roles exist under the same company, create separate experience entries only when the title and/or dates clearly differ.\n\n"
        "Normalization rules:\n"
        "- Normalize dates when possible to YYYY-MM.\n"
        "- If normalization is not reliable, keep the original text.\n"
        '- For current roles, end_date may be "Present" if that is what the source says.\n'
        "- links should contain URLs only.\n"
        "- languages should contain spoken or human languages only.\n"
        "- skills should contain explicit professional or technical skills only.\n"
        "- certifications should contain named certifications only.\n"
        "- location must be a real geographic city, state, or country explicitly stated in the CV.\n"
        "- Normalize location to a canonical City, Country form when the place is clear from the CV.\n"
        "- Correct obvious location spelling and formatting variants when safe, for example Damscus, Damascus syria, and Damascus, syria should become Damascus, Syria.\n"
        "- If no explicit candidate location is present, set location to null.\n"
        "- Do not use skills, systems, industries, company names, or generic work modes such as ERP, CRM, Remote, Hybrid, or On-site as location.\n"
        "- role_tags should contain normalized job-role labels.\n"
        "- years_experience should be estimated from experience dates only.\n"
        "- seniority should be inferred from role titles and scope only when supported by the CV.\n\n"
        "Output schema:\n"
        f"{schema_text}"
    )


def build_job_family_system_prompt() -> str:
    return (
        "Classify the candidate into exactly one allowed job family.\n\n"
        "Rules:\n"
        "- Return valid JSON only.\n"
        "- Do not invent new family labels.\n"
        "- Use only the provided structured profile facts.\n"
        "- Prefer the most specific family when multiple families match.\n"
        "- Use Unclassified only when the evidence is too weak or contradictory.\n"
        "- confidence must be between 0 and 1.\n\n"
        f"Allowed job families: {json.dumps(list(JOB_FAMILY_LABELS), ensure_ascii=True)}\n\n"
        f"Output schema: {json.dumps(JobFamilyExtraction.model_json_schema(), ensure_ascii=True)}"
    )


def build_job_family_prompt(profile: CandidateProfile) -> dict[str, Any]:
    return {
        "taxonomy_version": JOB_FAMILY_TAXONOMY_VERSION,
        "deterministic_job_family": profile.metadata.get("job_family"),
        "deterministic_confidence": profile.metadata.get("job_family_confidence"),
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
