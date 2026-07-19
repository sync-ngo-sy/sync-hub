from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Protocol

from ..config import WorkerConfig
from ..integrations.llm import LLMClient, LLMResponseError
from ..prompts import load_prompt_template
from ..domain.models import CandidateProfile, ComparisonArtifact, ComparisonItem, SummaryArtifact, dataclass_to_dict
from .models import ComparisonArtifactOutput, SummaryArtifactOutput


class ArtifactGenerator(Protocol):
    def summarize(self, profile: CandidateProfile, artifact_version: str) -> SummaryArtifact: ...

    def compare(self, profiles: list[CandidateProfile], artifact_version: str, query: str = "") -> ComparisonArtifact: ...


@dataclass(frozen=True)
class ProfileArtifactInput:
    profile: dict[str, Any]
    evidence_refs: list[str]


def _artifact_input(profile: CandidateProfile) -> ProfileArtifactInput:
    profile_data = dataclass_to_dict(profile)
    included_fields = (
        "candidate_id",
        "name",
        "current_title",
        "headline",
        "location",
        "years_experience",
        "seniority",
        "role_tags",
        "skills",
        "experience",
        "education",
        "projects",
        "languages",
        "certifications",
        "summary",
        "confidence",
        "missing_fields",
        "parse_warnings",
    )
    evidence_refs = [f"profile.{field}" for field in included_fields if profile_data[field] not in (None, "", [], {})]
    evidence_refs.extend(f"experience[{index}]" for index in range(len(profile.experience)))
    evidence_refs.extend(f"education[{index}]" for index in range(len(profile.education)))
    evidence_refs.extend(f"projects[{index}]" for index in range(len(profile.projects)))
    return ProfileArtifactInput(
        profile={field: profile_data[field] for field in included_fields},
        evidence_refs=evidence_refs,
    )


def _validate_refs(actual: list[str], allowed: set[str]) -> None:
    if not set(actual).issubset(allowed):
        raise LLMResponseError("artifact response contains unsupported evidence references")


class LLMArtifactGenerator:
    def __init__(self, config: WorkerConfig, *, client: LLMClient | None = None) -> None:
        if not config.extraction_model:
            raise RuntimeError("artifact model is not configured; refusing to generate heuristic artifacts")
        self.config = config
        self.client = client or LLMClient(config, provider=config.extraction_provider)

    def summarize(self, profile: CandidateProfile, artifact_version: str) -> SummaryArtifact:
        artifact_input = _artifact_input(profile)
        output = self.client.parse(
            model=self.config.extraction_model,
            system_prompt=load_prompt_template("candidate_summary").render(),
            prompt={"profile": artifact_input.profile, "allowed_evidence_refs": artifact_input.evidence_refs},
            response_model=SummaryArtifactOutput,
        )
        _validate_refs(output.evidence_refs, set(artifact_input.evidence_refs))
        allowed_roles = set(profile.role_tags)
        allowed_roles.update(value for value in (profile.current_title, profile.headline) if value)
        if not set(output.recommended_roles).issubset(allowed_roles):
            raise LLMResponseError("summary response contains unsupported recommended roles")
        return SummaryArtifact(
            tenant_id=profile.tenant_id,
            candidate_id=profile.candidate_id,
            artifact_version=artifact_version,
            **output.model_dump(),
        )

    def compare(self, profiles: list[CandidateProfile], artifact_version: str, query: str = "") -> ComparisonArtifact:
        if not profiles:
            raise ValueError("at least one candidate is required for comparison")
        if len({profile.tenant_id for profile in profiles}) != 1:
            raise ValueError("all compared candidates must belong to one tenant")
        if len({profile.candidate_id for profile in profiles}) != len(profiles):
            raise ValueError("compared candidate IDs must be unique")

        inputs = [_artifact_input(profile) for profile in profiles]
        output = self.client.parse(
            model=self.config.extraction_model,
            system_prompt=load_prompt_template("candidate_comparison").render(),
            prompt={
                "criteria": query.strip() or None,
                "profiles": [item.profile for item in inputs],
                "allowed_evidence_refs": {item.profile["candidate_id"]: item.evidence_refs for item in inputs},
            },
            response_model=ComparisonArtifactOutput,
        )
        self._validate_comparison(output, inputs, has_criteria=bool(query.strip()))
        return ComparisonArtifact(
            tenant_id=profiles[0].tenant_id,
            candidate_ids=[item.candidate_id for item in output.items],
            overall_summary=output.overall_summary,
            items=[ComparisonItem(**item.model_dump()) for item in output.items],
            overlap=output.overlap,
            recommended_candidate_id=output.recommended_candidate_id or "",
            evidence_refs=output.evidence_refs,
            artifact_version=artifact_version,
        )

    @staticmethod
    def _validate_comparison(
        output: ComparisonArtifactOutput,
        inputs: list[ProfileArtifactInput],
        *,
        has_criteria: bool,
    ) -> None:
        allowed_by_candidate = {str(item.profile["candidate_id"]): set(item.evidence_refs) for item in inputs}
        if {item.candidate_id for item in output.items} != set(allowed_by_candidate):
            raise LLMResponseError("comparison response candidate IDs do not match the request")
        if output.recommended_candidate_id and output.recommended_candidate_id not in allowed_by_candidate:
            raise LLMResponseError("comparison response recommends an unknown candidate")
        if not has_criteria and output.recommended_candidate_id:
            raise LLMResponseError("comparison response cannot recommend a candidate without criteria")
        for item in output.items:
            _validate_refs(item.evidence_refs, allowed_by_candidate[item.candidate_id])
            profile_skills = set(next(value.profile["skills"] for value in inputs if value.profile["candidate_id"] == item.candidate_id))
            if not set(item.matched_skills).issubset(profile_skills):
                raise LLMResponseError("comparison response contains unsupported matched skills")
        shared_skills = set.intersection(*(set(item.profile["skills"]) for item in inputs))
        if not set(output.overlap).issubset(shared_skills):
            raise LLMResponseError("comparison response contains unsupported overlapping skills")
        _validate_refs(output.evidence_refs, set().union(*allowed_by_candidate.values()))
