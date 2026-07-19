from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from pydantic import ValidationError

from cv_intelligence_worker.config import WorkerConfig
from cv_intelligence_worker.llm import LLMClient, LLMResponseError
from cv_intelligence_worker.llm_models import SkillClassificationBatch
from cv_intelligence_worker.skill_cleanup import SkillClassifier, build_plan


def classifier_with_sdk(
    sdk_client: MagicMock,
    *,
    cache_writer: MagicMock | None = None,
    progress_reporter: MagicMock | None = None,
) -> SkillClassifier:
    config = WorkerConfig(
        model_api_key="secret",
        extraction_model="test-model",
        extraction_max_attempts=3,
    )
    return SkillClassifier(
        batch_size=10,
        max_workers=1,
        config=config,
        client=LLMClient(config, client=sdk_client),
        cache_writer=cache_writer,
        progress_reporter=progress_reporter,
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


def test_classifier_fails_closed_without_call_site_retries() -> None:
    sdk_client = MagicMock()
    with pytest.raises(ValidationError) as validation:
        SkillClassificationBatch.model_validate({"items": [{"id": 0, "action": "keep", "canonical": None}]})
    sdk_client.chat.completions.parse.side_effect = validation.value
    cache_writer = MagicMock()
    cache: dict[str, object] = {}

    with pytest.raises(LLMResponseError, match="failed validation"):
        classifier_with_sdk(sdk_client, cache_writer=cache_writer).classify([("React.js", 2)], cache)

    assert cache == {}
    cache_writer.assert_not_called()
    sdk_client.chat.completions.parse.assert_called_once()


def test_classifier_reports_and_persists_completed_batches() -> None:
    sdk_client = MagicMock()
    parsed = SkillClassificationBatch.model_validate({"items": [{"id": 0, "action": "keep", "canonical": "React"}]})
    sdk_client.chat.completions.parse.return_value = SimpleNamespace(
        choices=[SimpleNamespace(message=SimpleNamespace(parsed=parsed, refusal=None))]
    )
    cache_writer = MagicMock()
    progress_reporter = MagicMock()
    classifier = classifier_with_sdk(
        sdk_client,
        cache_writer=cache_writer,
        progress_reporter=progress_reporter,
    )
    cache: dict[str, object] = {}

    result = classifier.classify([("React.js", 2)], cache)

    assert result == {"React.js": {"action": "keep", "canonical": "React"}}
    cache_writer.assert_called_with(result)
    progress_reporter.assert_called_once_with(1, 1)


def test_cleanup_plan_rejects_incomplete_mapping() -> None:
    with pytest.raises(ValueError, match="mapping is incomplete"):
        build_plan([{"canonical_skill": "React"}], {})


def test_cleanup_plan_keeps_canonical_row_and_merges_alias_evidence() -> None:
    rows = [
        {
            "id": "old-alias",
            "tenant_id": "tenant-1",
            "candidate_id": "candidate-1",
            "skill_slug": "react-js",
            "canonical_skill": "React.js",
            "evidence": {"aliases": ["ReactJS"]},
            "created_at": "2024-01-01",
        },
        {
            "id": "canonical",
            "tenant_id": "tenant-1",
            "candidate_id": "candidate-1",
            "skill_slug": "react",
            "canonical_skill": "React",
            "evidence": {},
            "created_at": "2024-02-01",
        },
    ]
    mapping = {
        "React.js": {"action": "keep", "canonical": "React"},
        "React": {"action": "keep", "canonical": "React"},
    }

    plan = build_plan(rows, mapping)

    assert plan["delete_ids"] == ["old-alias"]
    assert plan["duplicate_rows"] == [rows[0]]
    assert plan["final_rows"] == 1
    assert plan["upserts"] == [
        {
            "id": "canonical",
            "tenant_id": "tenant-1",
            "candidate_id": "candidate-1",
            "skill_slug": "react",
            "canonical_skill": "React",
            "evidence": {"aliases": ["ReactJS", "React.js"]},
        }
    ]
