from dataclasses import replace
from unittest.mock import patch

import pytest

from cv_intelligence_worker.config import WorkerConfig
from cv_intelligence_worker.draft_validation import validate_user_overrides_with_llm
from cv_intelligence_worker.llm import LLMResponseError
from cv_intelligence_worker.llm_models import DraftValidationExtraction


@pytest.fixture
def config() -> WorkerConfig:
    return replace(
        WorkerConfig(),
        extraction_model="test-model",
        extraction_provider="openai-compatible",
    )


@patch("cv_intelligence_worker.draft_validation.LLMClient")
def test_validate_user_overrides_skips_empty_overrides(client, config: WorkerConfig) -> None:
    assert validate_user_overrides_with_llm({"name": "Test"}, {}, config) == (True, "")
    client.assert_not_called()


@pytest.mark.parametrize("provider", ["off", "disabled", "deterministic", "rules"])
def test_validate_user_overrides_fails_closed_without_provider(provider: str, config: WorkerConfig) -> None:
    with pytest.raises(LLMResponseError, match="not configured"):
        validate_user_overrides_with_llm(
            {"name": "Test"},
            {"name": "Test 2"},
            replace(config, extraction_provider=provider),
        )


def test_validate_user_overrides_fails_closed_without_model(config: WorkerConfig) -> None:
    with pytest.raises(LLMResponseError, match="not configured"):
        validate_user_overrides_with_llm(
            {"name": "Test"},
            {"name": "Test 2"},
            replace(config, extraction_model=""),
        )


@patch("cv_intelligence_worker.draft_validation.LLMClient.parse")
def test_validate_user_overrides_accepts_valid_result(parse, config: WorkerConfig) -> None:
    parse.return_value = DraftValidationExtraction(is_valid=True, reason="Minor correction")

    result = validate_user_overrides_with_llm(
        {"title": "SE"},
        {"title": "Senior <b>SE</b>"},
        config,
    )

    assert result == (True, "Minor correction")
    prompt = parse.call_args.kwargs["prompt"]["payload"]
    assert "<user_data>" in prompt
    assert "Senior &lt;b&gt;SE&lt;/b&gt;" in prompt


@patch("cv_intelligence_worker.draft_validation.LLMClient.parse")
def test_validate_user_overrides_rejects_invalid_result(parse, config: WorkerConfig) -> None:
    parse.return_value = DraftValidationExtraction(is_valid=False, reason="Unrealistic title change")

    result = validate_user_overrides_with_llm(
        {"title": "Intern"},
        {"title": "CEO"},
        config,
    )

    assert result == (False, "Unrealistic title change")


@patch("cv_intelligence_worker.draft_validation.LLMClient.parse")
def test_validate_user_overrides_fails_closed_on_client_error(parse, config: WorkerConfig) -> None:
    parse.side_effect = LLMResponseError("LLM down")

    with pytest.raises(LLMResponseError, match="LLM down"):
        validate_user_overrides_with_llm(
            {"title": "Intern"},
            {"title": "CEO"},
            config,
        )


@patch("cv_intelligence_worker.draft_validation.LLMClient")
def test_validate_user_overrides_uses_ollama_compatibility(client, config: WorkerConfig) -> None:
    client.return_value.parse.return_value = DraftValidationExtraction(is_valid=True, reason="Supported")
    ollama_config = replace(config, extraction_provider="ollama")

    assert validate_user_overrides_with_llm({"title": "SE"}, {"title": "Senior SE"}, ollama_config)[0] is True
    client.assert_called_once_with(ollama_config, provider="ollama")
