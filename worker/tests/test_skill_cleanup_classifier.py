from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from pydantic import ValidationError

from cv_intelligence_worker.config import WorkerConfig
from cv_intelligence_worker.llm import LLMClient, LLMResponseError
from cv_intelligence_worker.llm_models import SkillClassificationBatch
from scripts import clean_candidate_skill_map


def classifier_with_sdk(sdk_client: MagicMock) -> clean_candidate_skill_map.SkillClassifier:
    config = WorkerConfig(
        model_api_key="secret",
        extraction_model="test-model",
        extraction_max_attempts=3,
    )
    return clean_candidate_skill_map.SkillClassifier(
        batch_size=10,
        max_workers=1,
        config=config,
        client=LLMClient(config, client=sdk_client),
    )


def test_skill_classification_rejects_unknown_and_inconsistent_fields() -> None:
    with pytest.raises(ValidationError):
        SkillClassificationBatch.model_validate({"items": [{"id": 0, "action": "keep", "canonical": "React", "nme": "invalid"}]})
    with pytest.raises(ValidationError):
        SkillClassificationBatch.model_validate({"items": [{"id": 0, "action": "drop", "canonical": "React"}]})
    with pytest.raises(ValidationError):
        SkillClassificationBatch.model_validate(
            {
                "items": [
                    {"id": 0, "action": "keep", "canonical": "React"},
                    {"id": 0, "action": "drop", "canonical": None},
                ]
            }
        )


def test_classifier_uses_sdk_structured_output_and_validates_ids() -> None:
    sdk_client = MagicMock()
    parsed = SkillClassificationBatch.model_validate(
        {
            "items": [
                {"id": 0, "action": "keep", "canonical": "  React   JS  "},
                {"id": 1, "action": "drop", "canonical": None},
            ]
        }
    )
    sdk_client.chat.completions.parse.return_value = SimpleNamespace(
        choices=[SimpleNamespace(message=SimpleNamespace(parsed=parsed, refusal=None))]
    )
    classifier = classifier_with_sdk(sdk_client)

    result = classifier.request_batch(
        [
            {"id": 0, "label": "React.js", "count": 2},
            {"id": 1, "label": "https", "count": 1},
        ]
    )

    assert result == {
        0: {"action": "keep", "canonical": "React JS"},
        1: {"action": "drop", "canonical": None},
    }
    request = sdk_client.chat.completions.parse.call_args.kwargs
    assert request["model"] == "test-model"
    assert request["response_format"] is SkillClassificationBatch


def test_classifier_rejects_missing_or_unexpected_ids() -> None:
    sdk_client = MagicMock()
    parsed = SkillClassificationBatch.model_validate({"items": [{"id": 7, "action": "keep", "canonical": "React"}]})
    sdk_client.chat.completions.parse.return_value = SimpleNamespace(
        choices=[SimpleNamespace(message=SimpleNamespace(parsed=parsed, refusal=None))]
    )

    with pytest.raises(LLMResponseError, match="IDs do not match"):
        classifier_with_sdk(sdk_client).request_batch([{"id": 0, "label": "React.js", "count": 2}])


def test_classifier_fails_closed_without_call_site_retries(tmp_path, monkeypatch) -> None:
    sdk_client = MagicMock()
    with pytest.raises(ValidationError) as validation:
        SkillClassificationBatch.model_validate({"items": [{"id": 0, "action": "keep", "canonical": None}]})
    sdk_client.chat.completions.parse.side_effect = validation.value
    monkeypatch.setattr(clean_candidate_skill_map, "CACHE_PATH", tmp_path / "cache.json")
    cache: dict[str, object] = {}

    with pytest.raises(LLMResponseError, match="failed validation"):
        classifier_with_sdk(sdk_client).classify([("React.js", 2)], cache)

    assert cache == {}
    sdk_client.chat.completions.parse.assert_called_once()


def test_cleanup_plan_rejects_incomplete_mapping() -> None:
    with pytest.raises(ValueError, match="mapping is incomplete"):
        clean_candidate_skill_map.build_plan([{"canonical_skill": "React"}], {})
