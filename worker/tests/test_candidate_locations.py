import pytest

from cv_intelligence_worker.candidate_normalization import normalize_location


@pytest.mark.parametrize(
    ("raw_location", "expected"),
    [
        ("Damscus", "Damascus"),
        ("Damascus syria", "Damascus, Syria"),
        ("Damascus, syria", "Damascus, Syria"),
        ("Dubai, UAE", "Dubai, United Arab Emirates"),
    ],
)
def test_normalize_location_canonicalizes_known_places(raw_location: str, expected: str) -> None:
    assert normalize_location(raw_location) == expected


@pytest.mark.parametrize(
    "raw_location",
    [
        None,
        "candidate@example.com",
        "2024-01",
        "ERP, CRM",
        "Damascus/Syria",
    ],
)
def test_normalize_location_rejects_non_locations(raw_location: object) -> None:
    assert normalize_location(raw_location) == ""
