from __future__ import annotations

import re

from ..core.text import compact_whitespace


CONTACT_RE = re.compile(r"@|https?://|www\.|\+\d", re.IGNORECASE)
DATE_RE = re.compile(r"\b(?:19|20)\d{2}\b")
INVALID_SEPARATORS = frozenset("/|;:")
ALLOWED_PUNCTUATION = frozenset(" .'-’")
MAX_LOCATION_LENGTH = 60
MAX_LOCATION_SEGMENTS = 3


def _valid_segment(value: str) -> bool:
    return bool(value) and any(character.isalpha() for character in value) and all(
        character.isalpha() or character in ALLOWED_PUNCTUATION for character in value
    )


def normalize_location(value: object) -> str:
    if not isinstance(value, str):
        return ""
    normalized = compact_whitespace(value).strip(" |,-")
    if not normalized or len(normalized) > MAX_LOCATION_LENGTH:
        return ""
    if CONTACT_RE.search(normalized) or DATE_RE.search(normalized) or any(separator in normalized for separator in INVALID_SEPARATORS):
        return ""
    segments = [segment.strip() for segment in normalized.split(",")]
    if len(segments) > MAX_LOCATION_SEGMENTS or not all(_valid_segment(segment) for segment in segments):
        return ""
    return ", ".join(segments)
