from __future__ import annotations

import re
from collections.abc import Callable
from dataclasses import dataclass

from ..normalization_constants import (
    JOB_FAMILY_RULES,
    JUNIOR_SIGNAL_RE,
    ROLE_PATTERNS,
    ROLE_TAG_ALIASES,
    SENIORITY_ALIASES,
    SENIOR_SIGNAL_RE,
)
from ..schema import CandidateProfile
from ..utils import compact_whitespace, slugify


STAFF_SIGNAL_RE = re.compile(r"\b(principal|staff|lead|architect|head of)\b")
SENIOR_TEXT_RE = re.compile(r"\bsenior\b")

ROLE_SOURCE_WEIGHTS = (
    ("title", 6.0),
    ("headline", 4.0),
    ("skills", 2.5),
    ("experience", 1.75),
    ("summary", 1.25),
)
EXPLICIT_ROLE_TAG_WEIGHT = 1.5
ROLE_RANKING_MINIMUM = 2.0
ROLE_RANKING_RATIO = 0.45

JOB_ROLE_WEIGHT = 90.0
JOB_TITLE_WEIGHT = 55.0
JOB_SKILL_WEIGHT = 12.0
JOB_SKILL_WEIGHT_CAP = 60.0
JOB_FAMILY_MINIMUM_SCORE = 40.0
FULL_STACK_MINIMUM_SCORE = 120.0


@dataclass(frozen=True)
class SeniorityLabelRule:
    label: str
    keywords: tuple[str, ...]
    prefixes: tuple[str, ...] = ()

    def matches(self, value: str) -> bool:
        return any(keyword in value for keyword in self.keywords) or value.startswith(self.prefixes)


SENIORITY_LABEL_RULES = (
    SeniorityLabelRule("staff-plus", ("principal", "staff", "lead", "architect", "head of")),
    SeniorityLabelRule("senior", ("senior",), ("sr",)),
    SeniorityLabelRule("mid", ("mid",)),
    SeniorityLabelRule("junior", ("junior", "intern", "entry")),
)


@dataclass(frozen=True)
class SeniorityContext:
    text: str
    years_experience: float
    has_senior_signal: bool
    has_junior_signal: bool
    experience_entry_count: int


SeniorityPredicate = Callable[[SeniorityContext], bool]


def _is_staff_plus(context: SeniorityContext) -> bool:
    return bool(STAFF_SIGNAL_RE.search(context.text))


def _is_senior(context: SeniorityContext) -> bool:
    return bool(SENIOR_TEXT_RE.search(context.text)) or context.years_experience >= 6


def _is_junior(context: SeniorityContext) -> bool:
    return context.has_junior_signal or 0 < context.years_experience < 2


def _is_mid(context: SeniorityContext) -> bool:
    return "mid" in context.text or context.years_experience >= 3


INFERRED_SENIORITY_RULES: tuple[tuple[str, SeniorityPredicate], ...] = (
    ("staff-plus", _is_staff_plus),
    ("senior", _is_senior),
    ("junior", _is_junior),
    ("mid", _is_mid),
)


def _normalize_role_tag(value: object) -> str:
    if not isinstance(value, str):
        return ""
    return ROLE_TAG_ALIASES.get(slugify(value), "")


def _normalize_seniority_label(value: object) -> str:
    if not isinstance(value, str):
        return "unclassified"
    normalized = compact_whitespace(value).lower()
    if not normalized:
        return "unclassified"
    alias = SENIORITY_ALIASES.get(slugify(normalized))
    if alias:
        return alias
    matched_rule = next((rule for rule in SENIORITY_LABEL_RULES if rule.matches(normalized)), None)
    return matched_rule.label if matched_rule else "unclassified"


def _seniority_context(profile: CandidateProfile, years_experience: float) -> SeniorityContext:
    text = " ".join(
        (
            profile.current_title,
            profile.headline,
            " ".join(skill.lower() for skill in profile.skills),
            profile.summary,
        )
    ).lower()
    return SeniorityContext(
        text=text,
        years_experience=years_experience,
        has_senior_signal=bool(SENIOR_SIGNAL_RE.search(text)),
        has_junior_signal=bool(JUNIOR_SIGNAL_RE.search(text)),
        experience_entry_count=len(profile.experience),
    )


def _correct_explicit_seniority(label: str, context: SeniorityContext) -> str:
    if label in {"senior", "staff-plus"}:
        if context.has_senior_signal or context.years_experience >= 6:
            return label
        if context.years_experience <= 0 and context.experience_entry_count < 2:
            return "unclassified"
        return "mid"
    if label == "junior" and context.years_experience >= 4 and not context.has_junior_signal:
        return "mid"
    return label


def infer_seniority(profile: CandidateProfile, years_experience: float) -> str:
    context = _seniority_context(profile, years_experience)
    explicit = _normalize_seniority_label(profile.seniority)
    if explicit != "unclassified":
        return _correct_explicit_seniority(explicit, context)
    inferred = next((label for label, predicate in INFERRED_SENIORITY_RULES if predicate(context)), None)
    return inferred or "unclassified"


def _role_expressions(patterns: list[str]) -> tuple[re.Pattern[str], ...]:
    return tuple(
        re.compile(rf"(^|[^a-z0-9+#.]){re.escape(pattern.lower())}([^a-z0-9+#.]|$)")
        for pattern in patterns
    )


ROLE_EXPRESSIONS = {
    role: _role_expressions(patterns)
    for role, patterns in ROLE_PATTERNS.items()
}


def _role_sources(profile: CandidateProfile) -> dict[str, str]:
    return {
        "title": compact_whitespace(profile.current_title).lower(),
        "headline": compact_whitespace(profile.headline).lower(),
        "summary": compact_whitespace(profile.summary).lower(),
        "skills": " ".join(profile.skills).lower(),
        "experience": " ".join(
            f"{entry.title} {entry.company} {entry.description}"
            for entry in profile.experience
        ).lower(),
    }


def _role_score(
    sources: dict[str, str],
    expressions: tuple[re.Pattern[str], ...],
) -> float:
    return sum(
        sum(bool(expression.search(sources[source])) for expression in expressions) * weight
        for source, weight in ROLE_SOURCE_WEIGHTS
    )


def infer_role_tags(profile: CandidateProfile) -> list[str]:
    sources = _role_sources(profile)
    scores = {
        role: score
        for role, expressions in ROLE_EXPRESSIONS.items()
        if (score := _role_score(sources, expressions)) > 0
    }
    for raw_tag in profile.role_tags:
        normalized = _normalize_role_tag(raw_tag)
        if normalized:
            scores[normalized] = scores.get(normalized, 0.0) + EXPLICIT_ROLE_TAG_WEIGHT
    if not scores:
        return ["generalist"]
    top_score = max(scores.values())
    threshold = max(ROLE_RANKING_MINIMUM, top_score * ROLE_RANKING_RATIO)
    ranked = [
        role
        for role, score in sorted(scores.items(), key=lambda item: (-item[1], item[0]))
        if score >= threshold
    ]
    return ranked or ["generalist"]


def _contains_any(haystack: str, needles: tuple[str, ...]) -> bool:
    return any(needle and needle in haystack for needle in needles)


def _job_family_score(
    role_text: str,
    title_text: str,
    skill_text: str,
    role_tags: tuple[str, ...],
    title_signals: tuple[str, ...],
    skill_signals: tuple[str, ...],
) -> float:
    role_score = JOB_ROLE_WEIGHT if _contains_any(role_text, role_tags) else 0.0
    title_score = JOB_TITLE_WEIGHT if _contains_any(title_text, title_signals) else 0.0
    matched_skill_count = sum(1 for skill in skill_signals if skill in skill_text)
    skill_score = min(JOB_SKILL_WEIGHT_CAP, matched_skill_count * JOB_SKILL_WEIGHT)
    return role_score + title_score + skill_score


def infer_job_family(profile: CandidateProfile) -> tuple[str, float]:
    role_text = " ".join([*profile.role_tags, profile.current_title, profile.headline]).lower()
    title_text = " ".join([profile.current_title, profile.headline]).lower()
    skill_text = " ".join(profile.skills).lower()
    scores = {
        family: _job_family_score(
            role_text,
            title_text,
            skill_text,
            role_tags,
            title_signals,
            skill_signals,
        )
        for family, role_tags, title_signals, skill_signals in JOB_FAMILY_RULES
    }
    if "backend" in profile.role_tags and "frontend" in profile.role_tags:
        current_score = scores.get("Full-Stack Engineering", 0.0)
        scores["Full-Stack Engineering"] = max(current_score, FULL_STACK_MINIMUM_SCORE)
    family, score = max(scores.items(), key=lambda item: (item[1], item[0]))
    if score < JOB_FAMILY_MINIMUM_SCORE:
        return "Unclassified", 0.0
    confidence = min(0.98, 0.55 + (score / 240.0))
    return family, round(confidence, 3)
