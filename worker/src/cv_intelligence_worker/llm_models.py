from __future__ import annotations

import re
from enum import Enum
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from .job_family_taxonomy import JOB_FAMILY_LABELS


class LLMOutput(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


EmbeddingValue = Annotated[float, Field(strict=True, allow_inf_nan=False)]


class EmbeddingVector(LLMOutput):
    index: Annotated[int, Field(ge=0)] | None
    embedding: list[EmbeddingValue] = Field(min_length=1)


class ExtractedExperience(LLMOutput):
    company: str | None
    title: str | None
    start_date: str | None
    end_date: str | None
    location: str | None
    description: str | None


class ExtractedEducation(LLMOutput):
    institution: str | None
    degree: str | None
    field: str | None
    start_date: str | None
    end_date: str | None
    description: str | None


class ExtractedProject(LLMOutput):
    name: str | None
    description: str | None
    technologies: list[str]


class CandidateExtraction(LLMOutput):
    name: str | None
    current_title: str | None
    headline: str | None
    location: str | None
    email: str | None
    phone: str | None
    links: list[str]
    years_experience: Annotated[float, Field(ge=0, le=80)] | None
    seniority: Literal["junior", "mid", "senior", "staff-plus", "unclassified"] | None
    role_tags: list[str]
    skills: list[str]
    languages: list[str]
    certifications: list[str]
    experience: list[ExtractedExperience]
    education: list[ExtractedEducation]
    projects: list[ExtractedProject]
    summary: str | None
    confidence: Annotated[float, Field(ge=0, le=1)]


def _enum_member_name(label: str) -> str:
    return re.sub(r"[^A-Z0-9]+", "_", label.upper()).strip("_")


JobFamily = Enum(
    "JobFamily",
    {_enum_member_name(label): label for label in JOB_FAMILY_LABELS},
    type=str,
)


class JobFamilyExtraction(LLMOutput):
    job_family: JobFamily
    confidence: float = Field(ge=0, le=1)
    rationale: str
    matched_role_tags: list[str]
    matched_skills: list[str]
    alternate_job_family: JobFamily | None

    @model_validator(mode="after")
    def require_distinct_alternate(self) -> JobFamilyExtraction:
        if self.alternate_job_family == self.job_family:
            raise ValueError("alternate job family must differ from the primary family")
        return self


class DraftValidationExtraction(LLMOutput):
    is_valid: bool
    reason: str = Field(max_length=500)

    @model_validator(mode="after")
    def require_rejection_reason(self) -> "DraftValidationExtraction":
        if not self.is_valid and not self.reason.strip():
            raise ValueError("rejected draft validation requires a reason")
        return self


class RealtimeExperience(ExtractedExperience):
    employment_type: Literal["Full-time", "Part-time", "Contract", "Freelance"] | None
    work_mode: Literal["Onsite", "Remote", "Hybrid"] | None
    technologies: list[str]


class RealtimeProject(ExtractedProject):
    role: str | None
    link: str | None


class RealtimeCertification(LLMOutput):
    name: str = Field(min_length=1)
    issuing_body: str | None
    issue_date: str | None
    expiry_date: str | None


class RealtimeSkill(LLMOutput):
    name: str = Field(min_length=1)
    proficiency: Literal["Beginner", "Intermediate", "Advanced", "Expert"] | None
    years_of_experience: Annotated[float, Field(ge=0)] | None
    last_used: Annotated[int, Field(ge=1900, le=2100)] | None


ConfidenceScore = Annotated[int, Field(ge=0, le=100)]


class RealtimeCandidateExtraction(CandidateExtraction):
    skills: list[RealtimeSkill]
    certifications: list[RealtimeCertification]
    experience: list[RealtimeExperience]
    projects: list[RealtimeProject]
    field_confidence: dict[str, ConfidenceScore]


class SkillClassificationItem(LLMOutput):
    id: int = Field(ge=0)
    action: Literal["keep", "drop"]
    canonical: str | None

    @field_validator("canonical")
    @classmethod
    def normalize_canonical(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = " ".join(value.split())
        if not normalized:
            raise ValueError("canonical skill cannot be blank")
        return normalized

    @model_validator(mode="after")
    def require_canonical_for_kept_skills(self) -> "SkillClassificationItem":
        if self.action == "keep" and self.canonical is None:
            raise ValueError("kept skill requires a canonical value")
        if self.action == "drop" and self.canonical is not None:
            raise ValueError("dropped skill requires a null canonical value")
        return self


class SkillClassificationBatch(LLMOutput):
    items: list[SkillClassificationItem] = Field(min_length=1)

    @model_validator(mode="after")
    def require_unique_ids(self) -> "SkillClassificationBatch":
        ids = [item.id for item in self.items]
        if len(ids) != len(set(ids)):
            raise ValueError("skill classification IDs must be unique")
        return self
