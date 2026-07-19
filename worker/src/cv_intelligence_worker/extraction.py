from __future__ import annotations

from dataclasses import replace
from typing import Any

from .candidate_extraction import (
    build_candidate_prompt,
    build_candidate_system_prompt,
    build_job_family_prompt,
    build_job_family_system_prompt,
    profile_from_extraction,
)
from .config import WorkerConfig
from .llm import LLMClient, LLMResponseError
from .llm_models import CandidateExtraction, JobFamilyExtraction
from .job_family_taxonomy import JOB_FAMILY_TAXONOMY_VERSION
from .schema import CandidateProfile, DocumentSource, DocumentText
from .utils import compact_whitespace, dedupe_keep_order, format_error_message


def _validated_job_family_result(value: JobFamilyExtraction, profile: CandidateProfile, config: WorkerConfig) -> dict[str, Any] | None:
    family = value.job_family.value
    confidence = value.confidence
    if confidence < max(0.0, min(1.0, config.job_family_min_confidence)):
        return None
    matched_role_tags = dedupe_keep_order(value.matched_role_tags)
    matched_skills = dedupe_keep_order(value.matched_skills)
    if not set(matched_role_tags).issubset(profile.role_tags) or not set(matched_skills).issubset(profile.skills):
        return None
    auto_accept_confidence = max(config.job_family_min_confidence, min(1.0, config.job_family_auto_accept_confidence))
    review_reasons: list[str] = []
    if confidence < auto_accept_confidence:
        review_reasons.append("llm_confidence_below_auto_accept_threshold")
    if family == "Unclassified":
        review_reasons.append("llm_returned_unclassified")
    review_status = "needs_review" if review_reasons else "auto_accepted"
    return {
        "job_family": family,
        "job_family_confidence": round(confidence, 3),
        "job_family_taxonomy_version": JOB_FAMILY_TAXONOMY_VERSION,
        "job_family_source": "llm",
        "job_family_review_status": review_status,
        "job_family_review_reason": ",".join(review_reasons) if review_reasons else "accepted",
        "job_family_rationale": compact_whitespace(value.rationale)[:500],
        "job_family_matched_role_tags": matched_role_tags,
        "job_family_matched_skills": matched_skills,
        "job_family_alternate": value.alternate_job_family.value if value.alternate_job_family else "",
    }


def classify_job_family_with_llm(profile: CandidateProfile, config: WorkerConfig, *, client: LLMClient | None = None) -> CandidateProfile:
    provider = config.job_family_provider.lower()
    model = config.job_family_model or config.extraction_model
    if provider in {"off", "disabled"} or not model:
        return profile

    try:
        effective_provider = config.extraction_provider.lower() if provider == "llm" else provider
        if client is None or client.provider != effective_provider:
            client = LLMClient(config, provider=effective_provider)
        result = client.parse(
            model=model,
            system_prompt=build_job_family_system_prompt(),
            prompt=build_job_family_prompt(profile),
            response_model=JobFamilyExtraction,
        )
        validated = _validated_job_family_result(result, profile, config)
        if not validated:
            return replace(
                profile,
                metadata={
                    **profile.metadata,
                    "job_family_review_status": "needs_review",
                    "job_family_review_reason": "llm_rejected_invalid_label_or_low_confidence",
                    "job_family_llm_status": "rejected",
                    "job_family_llm_rejection_reason": "invalid_label_or_low_confidence",
                },
            )
        return replace(
            profile,
            metadata={
                **profile.metadata,
                **validated,
            },
        )
    except LLMResponseError as exc:
        return replace(
            profile,
            metadata={
                **profile.metadata,
                "job_family": "Unclassified",
                "job_family_confidence": 0.0,
                "job_family_source": "unclassified",
                "job_family_review_status": "needs_review",
                "job_family_review_reason": "llm_failed_unclassified",
                "job_family_llm_status": "failed",
                "job_family_llm_error": format_error_message(exc)[:300],
            },
        )


def _merge_draft_profile_json(original: Any, overrides: Any) -> Any:
    if isinstance(original, dict) and isinstance(overrides, dict):
        merged = dict(original)
        for key, value in overrides.items():
            if key in merged:
                merged[key] = _merge_draft_profile_json(merged[key], value)
            else:
                merged[key] = value
        return merged
    if isinstance(original, list) and isinstance(overrides, list):
        return overrides if overrides else original
    return overrides if overrides is not None else original


class LLMProfileExtractor:
    def __init__(self, config: WorkerConfig, client: LLMClient) -> None:
        self.config = config
        self.client = client

    def extract(self, source: DocumentSource, document_text: DocumentText) -> CandidateProfile:
        extracted = self.client.parse(
            model=self.config.extraction_model,
            system_prompt=build_candidate_system_prompt(),
            prompt=build_candidate_prompt(document_text),
            response_model=CandidateExtraction,
        )
        return profile_from_extraction(source, document_text, extracted)


def extract_candidate_profile(source: DocumentSource, document_text: DocumentText, config: WorkerConfig) -> CandidateProfile:
    if source.metadata.get("is_draft"):
        from .draft_validation import validate_user_overrides_with_llm
        from .schema import candidate_profile_from_dict

        draft_data = source.metadata.get("draft_data", {})
        original_profile = draft_data.get("parsed_profile_json") or {}
        user_overrides = draft_data.get("user_overrides_json") or {}

        merged_profile_json = _merge_draft_profile_json(original_profile, user_overrides)

        is_valid, reason = validate_user_overrides_with_llm(original_profile, user_overrides, config)
        if not is_valid:
            raise ValueError(f"AI Validation Rejected: {reason}")

        profile = candidate_profile_from_dict(merged_profile_json)
        return classify_job_family_with_llm(profile, config)

    if not config.extraction_model:
        raise RuntimeError("CV extraction model is not configured; refusing to parse without LLM extraction")

    provider = config.extraction_provider.lower()
    client = LLMClient(config, provider=provider)
    profile = LLMProfileExtractor(config, client).extract(source, document_text)
    return classify_job_family_with_llm(profile, config, client=client)
