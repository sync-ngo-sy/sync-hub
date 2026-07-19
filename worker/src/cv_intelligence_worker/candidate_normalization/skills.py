from __future__ import annotations

import re
from collections.abc import Callable

from ..normalization_constants import (
    SKILL_ALIASES,
    SKILL_CONTACT_RE,
    SKILL_DATE_RANGE_RE,
    SKILL_DROP_EXACT,
    SKILL_PHRASE_ALIASES,
    SKILL_ROLE_ONLY_RE,
)
from ..utils import compact_whitespace, skill_slugify


LEADING_BULLET_RE = re.compile(r"^[▪•●◦\-*]+\s*")
QUALIFIER_PREFIX_RE = re.compile(
    (
        r"^(?:good at|basic knowledge of|basic knowledge in|knowledge of|"
        r"familiarity with|proficiency in|experience in)\s*:?\s+"
    ),
    re.IGNORECASE,
)
AREA_PREFIX_RE = re.compile(r"^(?:backend|frontend)\s*:\s+", re.IGNORECASE)
NUMERIC_ONLY_RE = re.compile(r"[\d\W_]+")
YEAR_ONLY_RE = re.compile(r"(?:19|20)\d{2}(?:\s*[-/.]\s*\d{1,2})?\.?", re.IGNORECASE)

ALLOWED_CONTACT_SKILL_SLUGS = frozenset({"github", "gitlab"})
MAX_SKILL_LENGTH = 90
MAX_ACRONYM_LENGTH = 5

SkillRejectionRule = Callable[[str, str], bool]


def _is_known_noise(_value: str, slug: str) -> bool:
    return slug in SKILL_DROP_EXACT


def _is_contact_noise(value: str, slug: str) -> bool:
    return bool(SKILL_CONTACT_RE.search(value)) and slug not in ALLOWED_CONTACT_SKILL_SLUGS


def _is_numeric_or_date_noise(value: str, _slug: str) -> bool:
    return bool(NUMERIC_ONLY_RE.fullmatch(value) or YEAR_ONLY_RE.fullmatch(value) or SKILL_DATE_RANGE_RE.match(value))


def _is_ocr_noise(value: str, _slug: str) -> bool:
    return value.count("!") >= 2


def _is_role_only(value: str, _slug: str) -> bool:
    return bool(SKILL_ROLE_ONLY_RE.match(value))


def _is_too_long(value: str, _slug: str) -> bool:
    return len(value) > MAX_SKILL_LENGTH


SKILL_REJECTION_RULES: tuple[SkillRejectionRule, ...] = (
    _is_known_noise,
    _is_contact_noise,
    _is_numeric_or_date_noise,
    _is_ocr_noise,
    _is_role_only,
    _is_too_long,
)


def _normalize_skill_text(value: str) -> str:
    normalized = compact_whitespace(value)
    normalized = LEADING_BULLET_RE.sub("", normalized).strip(" ;:,")
    normalized = QUALIFIER_PREFIX_RE.sub("", normalized)
    return AREA_PREFIX_RE.sub("", normalized)


def _resolved_alias(value: str, slug: str) -> str:
    direct_alias = SKILL_ALIASES.get(slug)
    if direct_alias:
        return direct_alias
    for pattern, canonical in SKILL_PHRASE_ALIASES:
        if pattern.search(value):
            return canonical
    return ""


def canonical_skill(value: object) -> str:
    if not isinstance(value, str):
        return ""
    normalized = _normalize_skill_text(value)
    if not normalized:
        return ""
    slug = skill_slugify(normalized)
    if any(rule(normalized, slug) for rule in SKILL_REJECTION_RULES):
        return ""
    alias = _resolved_alias(normalized, slug)
    if alias:
        return alias
    if normalized.isupper() and len(normalized) <= MAX_ACRONYM_LENGTH:
        return normalized
    return normalized
