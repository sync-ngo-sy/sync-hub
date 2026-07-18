from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime, timezone

from ..normalization_constants import (
    DATE_RANGE_PATTERN,
    MAX_REASONABLE_YEARS_EXPERIENCE,
    YEARS_PATTERN,
)
from ..schema import CandidateProfile, ExperienceEntry
from ..utils import compact_whitespace
from .titles import count_work_like_experience_entries, is_countable_experience_entry


MONTH_NAME_TO_NUMBER = {
    "jan": 1,
    "january": 1,
    "feb": 2,
    "february": 2,
    "mar": 3,
    "march": 3,
    "apr": 4,
    "april": 4,
    "may": 5,
    "jun": 6,
    "june": 6,
    "jul": 7,
    "july": 7,
    "aug": 8,
    "august": 8,
    "sep": 9,
    "sept": 9,
    "september": 9,
    "oct": 10,
    "october": 10,
    "nov": 11,
    "november": 11,
    "dec": 12,
    "december": 12,
}

NUMBER_WORDS = {
    "one": 1.0,
    "two": 2.0,
    "three": 3.0,
    "four": 4.0,
    "five": 5.0,
    "six": 6.0,
    "seven": 7.0,
    "eight": 8.0,
    "nine": 9.0,
    "ten": 10.0,
}

MIN_EXPERIENCE_YEAR = 1980


@dataclass(frozen=True)
class NumericDatePattern:
    expression: re.Pattern[str]
    year_group: int
    month_group: int


NUMERIC_DATE_PATTERNS = (
    NumericDatePattern(re.compile(r"\b\d{1,2}/(\d{1,2})/(\d{4})\b"), 2, 1),
    NumericDatePattern(re.compile(r"\b(\d{1,2})/(\d{4})\b"), 2, 1),
    NumericDatePattern(re.compile(r"\b(\d{4})-(\d{1,2})\b"), 1, 2),
)


def _resolve_as_of(as_of: datetime | None) -> datetime:
    if as_of is None:
        return datetime.now(timezone.utc)
    if as_of.tzinfo is None:
        return as_of.replace(tzinfo=timezone.utc)
    return as_of.astimezone(timezone.utc)


def _is_valid_year(year: int, as_of: datetime) -> bool:
    return MIN_EXPERIENCE_YEAR <= year <= as_of.year + 1


def _year_from_fragment(value: str, *, as_of: datetime) -> int | None:
    match = re.search(r"(\d{4})", value)
    if not match:
        return None
    year = int(match.group(1))
    return year if _is_valid_year(year, as_of) else None


def _month_index(year: int, month: int) -> int:
    return year * 12 + (month - 1)


def _month_index_from_fragment(
    value: str,
    *,
    as_of: datetime,
    default_month: int = 1,
) -> int | None:
    normalized = compact_whitespace(value).lower()
    if not normalized:
        return None
    if normalized in {"present", "current"}:
        return _month_index(as_of.year, as_of.month)

    for date_pattern in NUMERIC_DATE_PATTERNS:
        match = date_pattern.expression.search(normalized)
        if match:
            year = int(match.group(date_pattern.year_group))
            month = int(match.group(date_pattern.month_group))
            if 1 <= month <= 12 and _is_valid_year(year, as_of):
                return _month_index(year, month)

    month_name_match = re.search(r"\b([a-z]{3,9})\s+(\d{4})\b", normalized)
    if month_name_match:
        month = MONTH_NAME_TO_NUMBER.get(month_name_match.group(1))
        year = int(month_name_match.group(2))
        if month and _is_valid_year(year, as_of):
            return _month_index(year, month)

    year = _year_from_fragment(normalized, as_of=as_of)
    if year:
        return _month_index(year, default_month)
    return None


def has_dated_education_entries(
    profile: CandidateProfile,
    *,
    as_of: datetime | None = None,
) -> bool:
    reference_time = _resolve_as_of(as_of)
    for entry in profile.education:
        dates = (entry.start_date, entry.end_date)
        if any(_year_from_fragment(value or "", as_of=reference_time) for value in dates):
            return True
    return False


def experience_years_from_entries(
    entries: list[ExperienceEntry],
    *,
    as_of: datetime | None = None,
) -> float:
    reference_time = _resolve_as_of(as_of)
    ranges: list[tuple[int, int]] = []
    work_like_entries = [entry for entry in entries if is_countable_experience_entry(entry)]
    for entry in work_like_entries or entries:
        start_month = _month_index_from_fragment(
            entry.start_date or "",
            as_of=reference_time,
            default_month=1,
        )
        end_text = (entry.end_date or "").lower()
        end_month = _month_index_from_fragment(
            end_text,
            as_of=reference_time,
            default_month=12,
        )
        if start_month is not None and end_month is not None and end_month >= start_month:
            ranges.append((start_month, end_month))
            continue
        merged = f"{entry.start_date or ''} - {entry.end_date or ''} {entry.description}"
        match = DATE_RANGE_PATTERN.search(merged)
        if not match:
            continue
        start_month = _month_index_from_fragment(
            match.group("start"),
            as_of=reference_time,
            default_month=1,
        )
        end_month = _month_index_from_fragment(
            match.group("end"),
            as_of=reference_time,
            default_month=12,
        )
        if start_month is not None and end_month is not None and end_month >= start_month:
            ranges.append((start_month, end_month))
    if not ranges:
        return 0.0
    ranges.sort()
    merged_ranges: list[tuple[int, int]] = []
    for start_month, end_month in ranges:
        if not merged_ranges or start_month > merged_ranges[-1][1] + 1:
            merged_ranges.append((start_month, end_month))
        else:
            previous_start, previous_end = merged_ranges[-1]
            merged_ranges[-1] = (previous_start, max(previous_end, end_month))
    total_months = sum((end_month - start_month + 1) for start_month, end_month in merged_ranges)
    return round(total_months / 12.0, 2)


def infer_years_experience(
    profile: CandidateProfile,
    *,
    as_of: datetime | None = None,
) -> float:
    reference_time = _resolve_as_of(as_of)
    explicit_years = profile.years_experience if profile.years_experience > 0 else 0.0
    range_years = experience_years_from_entries(profile.experience, as_of=reference_time)
    haystack = f"{profile.summary}\n{profile.headline}\n{profile.raw_text}"
    regex_match = YEARS_PATTERN.search(haystack.lower())
    regex_years = 0.0
    if regex_match:
        count_text = regex_match.group("count").lower()
        if count_text.isdigit():
            regex_years = float(count_text)
        else:
            regex_years = NUMBER_WORDS.get(count_text, 0.0)
    valid_experience_count = count_work_like_experience_entries(profile.experience)
    has_dated_education = has_dated_education_entries(profile, as_of=reference_time)

    candidates = [value for value in (range_years, regex_years) if value > 0]
    if explicit_years > 0:
        reference = max(candidates) if candidates else 0.0
        tolerance = 1.0 if valid_experience_count >= 2 else 5.0
        if has_dated_education:
            tolerance = min(tolerance, 1.0)
        if reference == 0.0 or explicit_years <= reference + tolerance:
            candidates.append(explicit_years)
    return min(MAX_REASONABLE_YEARS_EXPERIENCE, max(candidates, default=0.0))
