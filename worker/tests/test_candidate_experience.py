from datetime import datetime, timezone

from cv_intelligence_worker.candidate_normalization import (
    count_work_like_experience_entries,
    experience_years_from_entries,
)
from cv_intelligence_worker.schema import ExperienceEntry


def test_overlapping_experience_ranges_are_counted_once() -> None:
    entries = [
        ExperienceEntry(
            company="First",
            title="Backend Engineer",
            start_date="2020-01",
            end_date="2021-12",
        ),
        ExperienceEntry(
            company="Second",
            title="Software Engineer",
            start_date="2021-01",
            end_date="2022-12",
        ),
    ]

    assert experience_years_from_entries(entries) == 3.0


def test_generic_experience_heading_is_not_a_work_entry() -> None:
    entries = [ExperienceEntry(company="", title="Work Experience", start_date="2020", end_date="2024")]

    assert count_work_like_experience_entries(entries) == 0


def test_present_date_uses_explicit_reference_time() -> None:
    entries = [
        ExperienceEntry(
            company="Current",
            title="Software Engineer",
            start_date="2023-07",
            end_date="Present",
        )
    ]

    years = experience_years_from_entries(
        entries,
        as_of=datetime(2024, 6, 1, tzinfo=timezone.utc),
    )

    assert years == 1.0
