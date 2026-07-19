import pytest

from cv_intelligence_worker.candidate_normalization import normalize_location


@pytest.mark.parametrize(
    ("raw_location", "expected"),
    [
        ("Damascus, Syria", "Damascus, Syria"),
        ("Dubai, United Arab Emirates", "Dubai, United Arab Emirates"),
        ("Montréal, Canada", "Montréal, Canada"),
        ("  Aleppo,   Syria  ", "Aleppo, Syria"),
    ],
)
def test_normalize_location_preserves_validated_model_values(raw_location: str, expected: str) -> None:
    assert normalize_location(raw_location) == expected


@pytest.mark.parametrize(
    "raw_location",
    [
        None,
        "candidate@example.com",
        "2024-01",
        "Damascus/Syria",
        "Dubai 2024",
        "a" * 61,
    ],
)
def test_normalize_location_rejects_non_locations(raw_location: object) -> None:
    assert normalize_location(raw_location) == ""
