from __future__ import annotations

import json
from html import escape as xml_escape
from typing import Any

from .config import WorkerConfig
from .llm import LLMClient, LLMResponseError
from .llm_models import DraftValidationExtraction
from .prompts import load_prompt_template


def build_draft_validation_system_prompt() -> str:
    return load_prompt_template("draft_validation").render()


def _validation_prompt(original_profile: dict[str, Any], user_overrides: dict[str, Any]) -> dict[str, str]:
    payload = json.dumps(
        {
            "original_extracted_profile": original_profile,
            "user_manual_edits": user_overrides,
        },
        ensure_ascii=True,
    )
    return {"payload": f"<user_data>\n{xml_escape(payload, quote=False)}\n</user_data>"}


def validate_user_overrides_with_llm(
    original_profile: dict[str, Any], user_overrides: dict[str, Any], config: WorkerConfig
) -> tuple[bool, str]:
    if not user_overrides:
        return True, ""

    provider = config.extraction_provider.lower()
    if provider in {"rules", "deterministic", "off", "disabled"} or not config.extraction_model:
        raise LLMResponseError("draft validation model is not configured")

    result = LLMClient(config, provider=provider).parse(
        model=config.extraction_model,
        system_prompt=build_draft_validation_system_prompt(),
        prompt=_validation_prompt(original_profile, user_overrides),
        response_model=DraftValidationExtraction,
    )
    return result.is_valid, result.reason.strip()
