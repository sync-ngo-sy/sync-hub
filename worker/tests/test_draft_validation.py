import pytest
from unittest.mock import patch

from cv_intelligence_worker.config import WorkerConfig
from cv_intelligence_worker.draft_validation import validate_user_overrides_with_llm

from dataclasses import replace

@pytest.fixture
def config():
    return replace(
        WorkerConfig(),
        job_family_provider="llm",
        job_family_model="gpt-4",
        extraction_model="gpt-4",
        extraction_provider="openai-compatible"
    )

@patch("cv_intelligence_worker.draft_validation._call_ollama_json")
@patch("cv_intelligence_worker.draft_validation._call_openai_compatible_json")
def test_validate_user_overrides_no_overrides(mock_openai, mock_ollama, config):
    is_valid, reason = validate_user_overrides_with_llm({"name": "Test"}, {}, config)
    assert is_valid is True
    assert reason == ""
    mock_openai.assert_not_called()
    mock_ollama.assert_not_called()

@patch("cv_intelligence_worker.draft_validation._call_ollama_json")
@patch("cv_intelligence_worker.draft_validation._call_openai_compatible_json")
def test_validate_user_overrides_disabled_provider(mock_openai, mock_ollama, config):
    config = replace(config, job_family_provider="off")
    is_valid, reason = validate_user_overrides_with_llm({"name": "Test"}, {"name": "Test 2"}, config)
    assert is_valid is True
    assert reason == ""
    mock_openai.assert_not_called()

@patch("cv_intelligence_worker.draft_validation._call_ollama_json")
@patch("cv_intelligence_worker.draft_validation._call_openai_compatible_json")
def test_validate_user_overrides_valid(mock_openai, mock_ollama, config):
    mock_openai.return_value = {"is_valid": True, "reason": ""}

    is_valid, reason = validate_user_overrides_with_llm(
        {"title": "SE"}, {"title": "Senior <b>SE</b>"}, config
    )

    assert is_valid is True
    mock_openai.assert_called_once()

    # Verify prompt contains XML payload protection
    prompt_arg = mock_openai.call_args[0][3]
    assert "<user_data>" in prompt_arg["payload"]
    assert "</user_data>" in prompt_arg["payload"]
    assert "Senior &lt;b&gt;SE&lt;/b&gt;" in prompt_arg["payload"]

@patch("cv_intelligence_worker.draft_validation._call_ollama_json")
@patch("cv_intelligence_worker.draft_validation._call_openai_compatible_json")
def test_validate_user_overrides_invalid(mock_openai, mock_ollama, config):
    mock_openai.return_value = {"is_valid": False, "reason": "Unrealistic title change"}

    is_valid, reason = validate_user_overrides_with_llm(
        {"title": "Intern"}, {"title": "CEO"}, config
    )

    assert is_valid is False
    assert reason == "Unrealistic title change"

@patch("cv_intelligence_worker.draft_validation._call_openai_compatible_json")
def test_validate_user_overrides_llm_failure_fails_open(mock_openai, config):
    mock_openai.side_effect = RuntimeError("LLM down")

    is_valid, reason = validate_user_overrides_with_llm(
        {"title": "Intern"}, {"title": "CEO"}, config
    )

    assert is_valid is True
    assert "LLM validation unavailable" in reason

@patch("cv_intelligence_worker.draft_validation._call_ollama_json")
@patch("cv_intelligence_worker.draft_validation._call_openai_compatible_json")
def test_validate_user_overrides_ollama(mock_openai, mock_ollama, config):
    config = replace(config, job_family_provider="ollama")
    mock_ollama.return_value = {"is_valid": True, "reason": ""}

    is_valid, reason = validate_user_overrides_with_llm(
        {"title": "SE"}, {"title": "Senior SE"}, config
    )

    assert is_valid is True
    mock_ollama.assert_called_once()
    mock_openai.assert_not_called()
