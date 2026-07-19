from __future__ import annotations

import re

from ..normalization_constants import (
    BLOCKED_LOCATION_PHRASES,
    BLOCKED_LOCATION_TOKENS,
    CITY_ALIASES,
    CONTACT_PATTERN,
    COUNTRY_ALIASES,
    DATE_FRAGMENT_RE,
    GEO_ACRONYMS,
    LOCATION_CONNECTOR_TOKENS,
    LOCATION_SEGMENT_PATTERN,
    LOCATION_WORD_RE,
)
from ..utils import compact_whitespace, slugify


INVALID_LOCATION_SEPARATORS = frozenset("/|;:")
MAX_LOCATION_LENGTH = 60
MAX_LOCATION_SEGMENTS = 3


def _is_allowed_location_word(word: str) -> bool:
    token = word.lower()
    return token in LOCATION_CONNECTOR_TOKENS or token not in BLOCKED_LOCATION_TOKENS


def _titlecase_location_token(token: str) -> str:
    lowered = token.lower()
    if lowered in LOCATION_CONNECTOR_TOKENS:
        return "St" if lowered == "st" else lowered
    parts = re.split(r"([-'’])", token)
    return "".join(part if part in {"-", "'", "’"} else part[:1].upper() + part[1:].lower() for part in parts if part)


def _split_location_segments(cleaned: str) -> list[str]:
    segments = [compact_whitespace(segment) for segment in cleaned.split(",") if compact_whitespace(segment)]
    if len(segments) != 1:
        return segments
    words = segments[0].split()
    for size in range(min(3, len(words) - 1), 0, -1):
        country_candidate = " ".join(words[-size:])
        if slugify(country_candidate) in COUNTRY_ALIASES:
            city_candidate = compact_whitespace(" ".join(words[:-size]))
            if city_candidate:
                return [city_candidate, country_candidate]
    return segments


def _canonical_location_segment(segment: str) -> str:
    cleaned = compact_whitespace(segment.strip(" -"))
    if not cleaned:
        return ""
    slug = slugify(cleaned)
    if slug in COUNTRY_ALIASES:
        return COUNTRY_ALIASES[slug]
    if slug in CITY_ALIASES:
        return CITY_ALIASES[slug]
    return " ".join(_titlecase_location_token(token) for token in cleaned.split())


def _is_location_segment(segment: str) -> bool:
    cleaned = compact_whitespace(segment.strip(" -"))
    if not cleaned or not LOCATION_SEGMENT_PATTERN.match(cleaned):
        return False
    lowered = cleaned.lower()
    if any(phrase in lowered for phrase in BLOCKED_LOCATION_PHRASES):
        return False
    words = LOCATION_WORD_RE.findall(cleaned)
    if not words or len(words) > 5:
        return False
    acronym = re.sub(r"[^A-Za-z]", "", cleaned).lower()
    if cleaned.isupper():
        return acronym in GEO_ACRONYMS
    return all(_is_allowed_location_word(word) for word in words)


def _is_invalid_location_input(value: str) -> bool:
    return (
        not value
        or len(value) > MAX_LOCATION_LENGTH
        or bool(CONTACT_PATTERN.search(value))
        or bool(DATE_FRAGMENT_RE.search(value))
        or any(character in value for character in INVALID_LOCATION_SEPARATORS)
    )


def _canonicalize_segments(segments: list[str]) -> list[str]:
    canonical_segments: list[str] = []
    seen: set[str] = set()
    for segment in segments:
        canonical = _canonical_location_segment(segment)
        if not canonical or not _is_location_segment(canonical):
            return []
        key = slugify(canonical)
        if key not in seen:
            seen.add(key)
            canonical_segments.append(canonical)
    return canonical_segments


def normalize_location(value: object) -> str:
    if not isinstance(value, str):
        return ""
    cleaned = compact_whitespace(value).strip(" |,-")
    if _is_invalid_location_input(cleaned):
        return ""
    segments = _split_location_segments(cleaned)
    if not segments or len(segments) > MAX_LOCATION_SEGMENTS:
        return ""
    canonical_segments = _canonicalize_segments(segments)
    return ", ".join(canonical_segments)
