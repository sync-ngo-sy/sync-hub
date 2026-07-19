from __future__ import annotations

import re

from ..utils import compact_whitespace


LEADING_BULLET_RE = re.compile(r"^[▪•●◦\-*]+\s*")
CONTACT_RE = re.compile(r"@|https?://|www\.", re.IGNORECASE)
DATE_RE = re.compile(r"^(?:19|20)\d{2}(?:\s*[-–/]\s*(?:19|20)?\d{2}|\s*[-–]\s*(?:present|current))?$", re.IGNORECASE)
CONTROL_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
ALPHANUMERIC_RE = re.compile(r"[A-Za-z0-9]")
MAX_SKILL_LENGTH = 90


def canonical_skill(value: object) -> str:
    if not isinstance(value, str):
        return ""
    normalized = LEADING_BULLET_RE.sub("", compact_whitespace(value)).strip(" ;:,")
    if not normalized or len(normalized) > MAX_SKILL_LENGTH or not ALPHANUMERIC_RE.search(normalized):
        return ""
    if CONTACT_RE.search(normalized) or DATE_RE.fullmatch(normalized) or CONTROL_RE.search(normalized):
        return ""
    return normalized
