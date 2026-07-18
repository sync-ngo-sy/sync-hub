from types import SimpleNamespace
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from pydantic import ValidationError

from cv_intelligence_worker.config import WorkerConfig
from cv_intelligence_worker.llm import LLMClient, LLMResponseError
from cv_intelligence_worker.llm_models import CandidateExtraction, DraftValidationExtraction


def candidate_extraction(**overrides: object) -> CandidateExtraction:
    values = {
        "name": "Jane Doe",
        "current_title": None,
        "headline": None,
        "location": None,
        "email": None,
        "phone": None,
        "links": [],
        "years_experience": None,
        "seniority": None,
        "role_tags": [],
        "skills": [],
        "languages": [],
        "certifications": [],
        "experience": [],
        "education": [],
        "projects": [],
        "summary": None,
    }
    values.update(overrides)
    return CandidateExtraction.model_validate(values)


def test_candidate_extraction_rejects_unknown_fields() -> None:
    with pytest.raises(ValidationError):
        CandidateExtraction.model_validate({"nme": "Jane Doe", "skills": []})


def test_draft_validation_rejects_coerced_and_malformed_fields() -> None:
    with pytest.raises(ValidationError):
        DraftValidationExtraction.model_validate({"is_valid": "false", "reason": []})


def test_draft_validation_requires_rejection_reason() -> None:
    with pytest.raises(ValidationError, match="requires a reason"):
        DraftValidationExtraction(is_valid=False, reason="  ")


def test_client_configures_sdk_retries_timeout_and_provider_url() -> None:
    parsed = candidate_extraction()
    sdk_client = MagicMock()
    sdk_client.chat.completions.parse.return_value = SimpleNamespace(
        choices=[SimpleNamespace(message=SimpleNamespace(parsed=parsed, refusal=None))]
    )
    config = WorkerConfig(
        model_api_key="secret",
        model_base_url="http://127.0.0.1:11434",
        extraction_provider="ollama",
        extraction_max_attempts=3,
        request_timeout_seconds=45,
    )

    with patch("cv_intelligence_worker.llm.OpenAI", return_value=sdk_client) as openai:
        result = LLMClient(config).parse(
            model="test-model",
            system_prompt="Extract a profile.",
            prompt={"cv": "Jane Doe"},
            response_model=CandidateExtraction,
        )

    assert result is parsed
    openai.assert_called_once_with(
        api_key="secret",
        base_url="http://127.0.0.1:11434/v1",
        timeout=45,
        max_retries=2,
    )


def test_client_rejects_missing_parsed_output() -> None:
    sdk_client = MagicMock()
    sdk_client.chat.completions.parse.return_value = SimpleNamespace(
        choices=[SimpleNamespace(message=SimpleNamespace(parsed=None, refusal=None))]
    )

    with pytest.raises(LLMResponseError, match="no validated structured output"):
        LLMClient(WorkerConfig(), client=sdk_client).parse(
            model="test-model",
            system_prompt="Extract a profile.",
            prompt={"cv": "Jane Doe"},
            response_model=CandidateExtraction,
        )


def test_client_does_not_expose_invalid_model_output() -> None:
    sdk_client = MagicMock()
    with pytest.raises(ValidationError) as validation:
        DraftValidationExtraction.model_validate({"is_valid": "private CV content", "reason": []})
    sdk_client.chat.completions.parse.side_effect = validation.value

    with pytest.raises(LLMResponseError) as error:
        LLMClient(WorkerConfig(), client=sdk_client).parse(
            model="test-model",
            system_prompt="Validate a draft.",
            prompt={"draft": "private CV content"},
            response_model=DraftValidationExtraction,
        )

    assert str(error.value) == "structured model response failed validation"
    assert error.value.__cause__ is validation.value


def test_client_does_not_expose_refusal_content() -> None:
    sdk_client = MagicMock()
    sdk_client.chat.completions.parse.return_value = SimpleNamespace(
        choices=[SimpleNamespace(message=SimpleNamespace(parsed=None, refusal="private CV content"))]
    )

    with pytest.raises(LLMResponseError) as error:
        LLMClient(WorkerConfig(), client=sdk_client).parse(
            model="test-model",
            system_prompt="Extract a profile.",
            prompt={"cv": "private CV content"},
            response_model=CandidateExtraction,
        )

    assert str(error.value) == "model refused structured output"


def test_client_rejects_empty_completion() -> None:
    sdk_client = MagicMock()
    sdk_client.chat.completions.parse.return_value = SimpleNamespace(choices=[])

    with pytest.raises(LLMResponseError, match="no completion choices"):
        LLMClient(WorkerConfig(), client=sdk_client).parse(
            model="test-model",
            system_prompt="Extract a profile.",
            prompt={"cv": "Jane Doe"},
            response_model=CandidateExtraction,
        )


def test_async_client_uses_validated_structured_output() -> None:
    parsed = candidate_extraction()
    sdk_client = MagicMock()
    sdk_client.chat.completions.parse = AsyncMock(
        return_value=SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(parsed=parsed, refusal=None))])
    )

    result = asyncio.run(
        LLMClient(WorkerConfig(), async_client=sdk_client).parse_async(
            model="test-model",
            system_prompt="Extract a profile.",
            prompt={"cv": "Jane Doe"},
            response_model=CandidateExtraction,
        )
    )

    assert result is parsed
    sdk_client.chat.completions.parse.assert_awaited_once()
