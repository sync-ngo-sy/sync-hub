from __future__ import annotations

from dataclasses import replace

from ..llm_models import CandidateExtraction, ExtractedEducation, ExtractedExperience, ExtractedProject
from ..normalization import normalize_location, normalize_profile
from ..schema import CandidateProfile, DocumentSource, DocumentText, EducationEntry, ExperienceEntry, ProjectEntry
from ..utils import compact_whitespace, dedupe_keep_order, normalize_email, stable_uuid
from .quality import calculate_profile_confidence, missing_profile_fields


def profile_from_extraction(
    source: DocumentSource,
    document_text: DocumentText,
    extracted: CandidateExtraction,
) -> CandidateProfile:
    email = normalize_email(string_value(extracted.email))
    links = string_list(extracted.links)
    phone = string_value(extracted.phone)
    profile = normalize_profile(
        CandidateProfile(
            tenant_id=source.tenant_id,
            candidate_id=candidate_id_for_profile(source, email=email, phone=phone, links=links),
            source_document_id=source.document_id,
            source_sha256=source.document_sha256,
            name=string_value(extracted.name),
            current_title=string_value(extracted.current_title),
            headline=string_value(extracted.headline),
            location=normalize_location(string_value(extracted.location)),
            email=email,
            phone=phone,
            links=links,
            years_experience=extracted.years_experience or 0.0,
            seniority=extracted.seniority or "unclassified",
            role_tags=string_list(extracted.role_tags),
            skills=string_list(extracted.skills),
            skill_aliases={},
            experience=_experience_entries(extracted.experience),
            education=_education_entries(extracted.education),
            projects=_project_entries(extracted.projects),
            languages=string_list(extracted.languages),
            certifications=string_list(extracted.certifications),
            summary=string_value(extracted.summary),
            raw_text=document_text.raw_text,
            metadata={"extraction_source": "llm"},
            confidence=0.0,
            missing_fields=[],
            parse_warnings=list(document_text.warnings),
        )
    )
    profile = replace(
        profile,
        missing_fields=missing_profile_fields(profile),
        confidence=calculate_profile_confidence(profile, document_text),
    )
    _validate_profile(profile)
    return profile


def string_value(value: object) -> str:
    return compact_whitespace(value) if isinstance(value, str) else ""


def string_list(values: list[str]) -> list[str]:
    return dedupe_keep_order(string_value(item) for item in values)


def candidate_id_for_profile(
    source: DocumentSource,
    *,
    email: str,
    phone: str = "",
    links: list[str] | None = None,
) -> str:
    normalized_email = normalize_email(email)
    if normalized_email:
        return stable_uuid(source.tenant_id, normalized_email)
    links = links or []
    return stable_uuid(source.tenant_id, phone or (links[0] if links else source.document_id))


def _experience_entries(values: list[ExtractedExperience]) -> list[ExperienceEntry]:
    entries: list[ExperienceEntry] = []
    for item in values:
        company = string_value(item.company)
        title = string_value(item.title)
        description = string_value(item.description)
        if not (company or title or description):
            continue
        entries.append(
            ExperienceEntry(
                company=company,
                title=title,
                start_date=string_value(item.start_date) or None,
                end_date=string_value(item.end_date) or None,
                description=description,
                location=normalize_location(string_value(item.location)) or None,
            )
        )
    return entries


def _education_entries(values: list[ExtractedEducation]) -> list[EducationEntry]:
    entries: list[EducationEntry] = []
    for item in values:
        institution = string_value(item.institution)
        degree = string_value(item.degree)
        field = string_value(item.field)
        description = string_value(item.description)
        if not (institution or degree or field or description):
            continue
        entries.append(
            EducationEntry(
                institution=institution,
                degree=degree,
                field=field,
                start_date=string_value(item.start_date) or None,
                end_date=string_value(item.end_date) or None,
                description=description,
            )
        )
    return entries


def _project_entries(values: list[ExtractedProject]) -> list[ProjectEntry]:
    entries: list[ProjectEntry] = []
    for item in values:
        name = string_value(item.name)
        description = string_value(item.description)
        technologies = string_list(item.technologies)
        if name or description or technologies:
            entries.append(ProjectEntry(name=name, description=description, technologies=technologies))
    return entries


def _validate_profile(profile: CandidateProfile) -> None:
    missing_core = []
    if not profile.name:
        missing_core.append("name")
    if not (profile.current_title or profile.experience or profile.skills):
        missing_core.append("professional_profile")
    if missing_core:
        raise ValueError(f"structured extractor returned incomplete profile: {', '.join(missing_core)}")
