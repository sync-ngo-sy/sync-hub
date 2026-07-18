from __future__ import annotations

import re
from enum import Enum
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from .normalization_constants import JOB_FAMILY_LABELS


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
    years_experience: float | None
    seniority: Literal["junior", "mid", "senior", "staff-plus", "unclassified"] | None
    role_tags: list[str]
    skills: list[str]
    languages: list[str]
    certifications: list[str]
    experience: list[ExtractedExperience]
    education: list[ExtractedEducation]
    projects: list[ExtractedProject]
    summary: str | None


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


class DraftValidationExtraction(LLMOutput):
    is_valid: bool
    reason: str = Field(max_length=500)

    @model_validator(mode="after")
    def require_rejection_reason(self) -> "DraftValidationExtraction":
        if not self.is_valid and not self.reason.strip():
            raise ValueError("rejected draft validation requires a reason")
        return self
