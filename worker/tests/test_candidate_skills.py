import pytest

from cv_intelligence_worker.candidate_normalization import canonical_skill


@pytest.mark.parametrize(
    ("raw_skill", "expected"),
    [
        ("React", "React"),
        ("• Node.js", "Node.js"),
        ("TypeScript", "TypeScript"),
        ("ASP.NET Core", "ASP.NET Core"),
        ("AWS", "AWS"),
    ],
)
def test_canonical_skill_preserves_validated_model_values(raw_skill: object, expected: str) -> None:
    assert canonical_skill(raw_skill) == expected


@pytest.mark.parametrize(
    "raw_skill",
    [
        None,
        "candidate@example.com",
        "2024-01",
        "https://example.com/skills/python",
        "!!!",
        "a" * 91,
    ],
)
def test_canonical_skill_rejects_noise(raw_skill: object) -> None:
    assert canonical_skill(raw_skill) == ""
