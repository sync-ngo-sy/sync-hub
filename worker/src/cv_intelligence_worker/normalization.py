from __future__ import annotations

import re
from collections import defaultdict
from dataclasses import replace
from datetime import datetime

from .candidate_normalization.experience import (
    _resolve_as_of,
    experience_years_from_entries as experience_years_from_entries,
    has_dated_education_entries as has_dated_education_entries,
    infer_years_experience,
)
from .candidate_normalization.titles import (
    count_work_like_experience_entries as count_work_like_experience_entries,
)
from .candidate_normalization.titles import is_title_like as _is_title_like
from .schema import CandidateProfile
from .utils import compact_whitespace, dedupe_keep_order, skill_slugify, slugify
from .normalization_constants import (
    BLOCKED_LOCATION_PHRASES,
    BLOCKED_LOCATION_TOKENS,
    CITY_ALIASES,
    CONTACT_PATTERN,
    COUNTRY_ALIASES,
    DATE_FRAGMENT_RE,
    GEO_ACRONYMS,
    IMPLICIT_COUNTRY_BY_CITY,
    JOB_FAMILY_RULES,
    JOB_FAMILY_TAXONOMY_VERSION,
    JUNIOR_SIGNAL_RE,
    LOCATION_CONNECTOR_TOKENS,
    LOCATION_SEGMENT_PATTERN,
    LOCATION_WORD_RE,
    ROLE_HINT_RE,
    ROLE_PATTERNS,
    ROLE_TAG_ALIASES,
    SENIORITY_ALIASES,
    SENIOR_SIGNAL_RE,
    SKILL_ALIASES,
    SKILL_CONTACT_RE,
    SKILL_DATE_RANGE_RE,
    SKILL_DROP_EXACT,
    SKILL_PHRASE_ALIASES,
    SKILL_ROLE_ONLY_RE,
    WORK_EXPERIENCE_TITLE_RE,
)


def canonical_skill(value: object) -> str:
    if not isinstance(value, str):
        return ""
    normalized = compact_whitespace(value)
    if not normalized:
        return ""
    normalized = re.sub(r"^[▪•●◦\-*]+\s*", "", normalized).strip(" ;:,")
    normalized = re.sub(
        r"^(?:good at|basic knowledge of|basic knowledge in|knowledge of|familiarity with|proficiency in|experience in)\s*:?\s+",
        "",
        normalized,
        flags=re.IGNORECASE,
    )
    normalized = re.sub(r"^(?:backend|frontend)\s*:\s+", "", normalized, flags=re.IGNORECASE)
    slug = skill_slugify(normalized)
    if slug in SKILL_DROP_EXACT:
        return ""
    if SKILL_CONTACT_RE.search(normalized) and slug not in {"github", "gitlab"}:
        return ""
    if re.fullmatch(r"[\d\W_]+", normalized):
        return ""
    if re.fullmatch(r"(?:19|20)\d{2}(?:\s*[-/.]\s*\d{1,2})?\.?", normalized):
        return ""
    if SKILL_DATE_RANGE_RE.match(normalized):
        return ""
    if normalized.count("!") >= 2:
        return ""
    if slug in SKILL_ALIASES:
        return SKILL_ALIASES[slug]
    for pattern, canonical in SKILL_PHRASE_ALIASES:
        if pattern.search(normalized):
            return canonical
    if SKILL_ROLE_ONLY_RE.match(normalized):
        return ""
    if len(normalized) > 90:
        return ""
    if normalized.isupper() and len(normalized) <= 5:
        return normalized
    return normalized


def _normalize_role_tag(value: object) -> str:
    if not isinstance(value, str):
        return ""
    token = slugify(value)
    return ROLE_TAG_ALIASES.get(token, "")


def _normalize_seniority_label(value: object) -> str:
    if not isinstance(value, str):
        return "unclassified"
    lowered = compact_whitespace(value).lower()
    if not lowered:
        return "unclassified"
    token = slugify(lowered)
    if token in SENIORITY_ALIASES:
        return SENIORITY_ALIASES[token]
    if any(term in lowered for term in ("principal", "staff", "lead", "architect", "head of")):
        return "staff-plus"
    if "senior" in lowered or lowered.startswith("sr"):
        return "senior"
    if "mid" in lowered:
        return "mid"
    if "junior" in lowered or "intern" in lowered or "entry" in lowered:
        return "junior"
    return "unclassified"


def _titlecase_location_token(token: str) -> str:
    lowered = token.lower()
    if lowered in LOCATION_CONNECTOR_TOKENS:
        if lowered == "st":
            return "St"
        return lowered
    parts = re.split(r"([-'’])", token)
    rebuilt: list[str] = []
    for part in parts:
        if not part:
            continue
        if part in {"-", "'", "’"}:
            rebuilt.append(part)
            continue
        rebuilt.append(part[:1].upper() + part[1:].lower())
    return "".join(rebuilt)


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
    if not cleaned:
        return False
    if not LOCATION_SEGMENT_PATTERN.match(cleaned):
        return False
    lowered = cleaned.lower()
    if any(phrase in lowered for phrase in BLOCKED_LOCATION_PHRASES):
        return False
    if ROLE_HINT_RE.search(cleaned) or WORK_EXPERIENCE_TITLE_RE.search(cleaned):
        return False
    words = LOCATION_WORD_RE.findall(cleaned)
    if not words or len(words) > 5:
        return False
    acronym = re.sub(r"[^A-Za-z]", "", cleaned).lower()
    if cleaned.isupper():
        return acronym in GEO_ACRONYMS
    for word in words:
        token = word.lower()
        if token in LOCATION_CONNECTOR_TOKENS:
            continue
        if token in BLOCKED_LOCATION_TOKENS:
            return False
    return True


def normalize_location(value: object) -> str:
    if not isinstance(value, str):
        return ""
    cleaned = compact_whitespace(value).strip(" |,-")
    if not cleaned:
        return ""
    if CONTACT_PATTERN.search(cleaned):
        return ""
    if DATE_FRAGMENT_RE.search(cleaned):
        return ""
    if len(cleaned) > 60:
        return ""
    if any(character in cleaned for character in ("/", "|", ";", ":")):
        return ""
    segments = _split_location_segments(cleaned)
    if not segments or len(segments) > 3:
        return ""
    canonical_segments: list[str] = []
    seen: set[str] = set()
    for segment in segments:
        canonical = _canonical_location_segment(segment)
        if not canonical or not _is_location_segment(canonical):
            return ""
        key = slugify(canonical)
        if key in seen:
            continue
        seen.add(key)
        canonical_segments.append(canonical)
    if not canonical_segments:
        return ""
    if len(canonical_segments) == 1:
        inferred_country = IMPLICIT_COUNTRY_BY_CITY.get(slugify(canonical_segments[0]))
        if inferred_country:
            canonical_segments.append(inferred_country)
    return ", ".join(canonical_segments)


def infer_seniority(profile: CandidateProfile, years_experience: float) -> str:
    explicit = _normalize_seniority_label(profile.seniority)
    haystack = f"{profile.current_title} {profile.headline} {' '.join(skill.lower() for skill in profile.skills)} {profile.summary}".lower()
    has_senior_signal = bool(SENIOR_SIGNAL_RE.search(haystack))
    has_junior_signal = bool(JUNIOR_SIGNAL_RE.search(haystack))
    experience_entry_count = len(profile.experience)

    if explicit != "unclassified":
        if explicit in {"senior", "staff-plus"} and years_experience <= 0 and not has_senior_signal:
            explicit = "mid" if experience_entry_count >= 2 else "unclassified"
        elif explicit in {"senior", "staff-plus"} and 0 < years_experience < 6:
            if not has_senior_signal:
                explicit = "mid"
        if explicit == "junior" and years_experience >= 4:
            if not has_junior_signal:
                explicit = "mid"
        return explicit

    if re.search(r"\b(principal|staff|lead|architect|head of)\b", haystack):
        return "staff-plus"
    if re.search(r"\bsenior\b", haystack) or years_experience >= 6:
        return "senior"
    if has_junior_signal or (0 < years_experience < 2):
        return "junior"
    if "mid" in haystack or years_experience >= 3:
        return "mid"
    return "unclassified"


def _role_signal_score(text: str, patterns: list[str], weight: float) -> float:
    normalized = text.lower()
    score = 0.0
    for pattern in patterns:
        expression = re.compile(rf"(^|[^a-z0-9+#.]){re.escape(pattern.lower())}([^a-z0-9+#.]|$)")
        if expression.search(normalized):
            score += weight
    return score


def infer_role_tags(profile: CandidateProfile) -> list[str]:
    scores: dict[str, float] = defaultdict(float)
    title = compact_whitespace(profile.current_title).lower()
    headline = compact_whitespace(profile.headline).lower()
    summary = compact_whitespace(profile.summary).lower()
    skills = " ".join(profile.skills).lower()
    experience = " ".join(f"{entry.title} {entry.company} {entry.description}" for entry in profile.experience).lower()

    for role, patterns in ROLE_PATTERNS.items():
        scores[role] += _role_signal_score(title, patterns, 6.0)
        scores[role] += _role_signal_score(headline, patterns, 4.0)
        scores[role] += _role_signal_score(skills, patterns, 2.5)
        scores[role] += _role_signal_score(experience, patterns, 1.75)
        scores[role] += _role_signal_score(summary, patterns, 1.25)

    for raw_tag in profile.role_tags:
        normalized = _normalize_role_tag(raw_tag)
        if normalized:
            scores[normalized] += 1.5

    if "engineer" in title and not scores:
        scores["backend"] += 1.0

    if not scores:
        return ["generalist"]

    top_score = max(scores.values())
    threshold = max(2.0, top_score * 0.45)
    ranked = [
        role
        for role, score in sorted(scores.items(), key=lambda item: (-item[1], item[0]))
        if score >= threshold
    ]
    return ranked or ["generalist"]


def infer_additional_skills(profile: CandidateProfile) -> list[str]:
    corpus = "\n".join(
        compact_whitespace(part)
        for part in (
            profile.current_title,
            profile.headline,
            profile.summary,
            profile.raw_text,
            " ".join(entry.title for entry in profile.experience),
            " ".join(project.name for project in profile.projects),
        )
        if isinstance(part, str) and part.strip()
    ).lower()
    inferred: list[str] = []
    for alias, canonical in sorted(SKILL_ALIASES.items(), key=lambda item: len(item[0]), reverse=True):
        expression = re.compile(rf"(^|[^a-z0-9+#.]){re.escape(alias.lower())}([^a-z0-9+#.]|$)")
        if expression.search(corpus):
            inferred.append(canonical)
    return dedupe_keep_order(inferred)


def _contains_any(haystack: str, needles: tuple[str, ...]) -> bool:
    return any(needle and needle in haystack for needle in needles)


def infer_job_family(profile: CandidateProfile) -> tuple[str, float]:
    role_text = " ".join([*profile.role_tags, profile.current_title, profile.headline]).lower()
    title_text = " ".join([profile.current_title, profile.headline]).lower()
    skill_text = " ".join(profile.skills).lower()
    scores: dict[str, float] = {}

    for family, role_tags, title_signals, skill_signals in JOB_FAMILY_RULES:
        score = 0.0
        if _contains_any(role_text, role_tags):
            score += 90.0
        if _contains_any(title_text, title_signals):
            score += 55.0
        matched_skill_count = sum(1 for skill in skill_signals if skill in skill_text)
        score += min(60.0, matched_skill_count * 12.0)
        scores[family] = score

    if "backend" in profile.role_tags and "frontend" in profile.role_tags:
        scores["Full-Stack Engineering"] = max(scores.get("Full-Stack Engineering", 0.0), 120.0)

    family, score = max(scores.items(), key=lambda item: (item[1], item[0]))
    if score < 40.0:
        return "Unclassified", 0.0
    confidence = min(0.98, 0.55 + (score / 240.0))
    return family, round(confidence, 3)


def choose_current_title(profile: CandidateProfile) -> str:
    current_title = compact_whitespace(profile.current_title)
    headline = compact_whitespace(profile.headline)
    experience_titles = [
        compact_whitespace(entry.title)
        for entry in profile.experience
        if _is_title_like(entry.title)
    ]

    if _is_title_like(current_title):
        return current_title
    if _is_title_like(headline, allow_long=True) and len(headline.split()) <= 10:
        return headline
    if experience_titles:
        return experience_titles[0]
    if _is_title_like(headline, allow_long=True):
        return headline
    student_title = _student_title_from_education(profile)
    return current_title or student_title or (experience_titles[0] if experience_titles else "")


def _student_title_from_education(profile: CandidateProfile) -> str:
    for education in profile.education:
        end_date = compact_whitespace(education.end_date or "").lower()
        description = compact_whitespace(education.description).lower()
        text = " ".join(
            compact_whitespace(part)
            for part in (education.degree, education.field, education.institution, education.description)
            if compact_whitespace(part)
        ).lower()
        is_active = end_date in {"present", "current", "now"} or "5th year" in description or "final year" in description
        if not is_active:
            continue
        if "software engineering" in text:
            return "Software Engineering Student"
        if "computer engineering" in text:
            return "Computer Engineering Student"
        if "information technology" in text:
            return "Information Technology Student"
    raw_text = compact_whitespace(profile.raw_text).lower()
    if ("present" in raw_text or "5th year" in raw_text or "final year" in raw_text) and "bachelor" in raw_text:
        if "software engineering" in raw_text:
            return "Software Engineering Student"
        if "computer engineering" in raw_text:
            return "Computer Engineering Student"
        if "information technology" in raw_text:
            return "Information Technology Student"
    return ""


def normalize_profile(
    profile: CandidateProfile,
    *,
    as_of: datetime | None = None,
) -> CandidateProfile:
    reference_time = _resolve_as_of(as_of)
    years_experience = infer_years_experience(profile, as_of=reference_time)
    current_title = choose_current_title(profile)
    headline = compact_whitespace(profile.headline) or current_title
    normalized_experience = [
        replace(entry, location=normalize_location(entry.location) or None)
        for entry in profile.experience
    ]
    location = normalize_location(profile.location)
    if not location:
        for entry in normalized_experience:
            if entry.location:
                location = entry.location
                break
    skills = dedupe_keep_order(
        canonical_skill(skill)
        for skill in [
            *profile.skills,
            *infer_additional_skills(
                replace(
                    profile,
                    current_title=current_title,
                    headline=headline,
                    experience=normalized_experience,
                    location=location,
                )
            ),
        ]
    )
    role_tags = dedupe_keep_order(
        infer_role_tags(
            replace(
                profile,
                current_title=current_title,
                headline=headline,
                skills=skills,
                experience=normalized_experience,
                location=location,
            )
        )
    )
    seniority = infer_seniority(
        replace(
            profile,
            current_title=current_title,
            headline=headline,
            skills=skills,
            experience=normalized_experience,
            location=location,
        ),
        years_experience,
    )
    job_family, job_family_confidence = infer_job_family(
        replace(
            profile,
            current_title=current_title,
            headline=headline,
            skills=skills,
            experience=normalized_experience,
            location=location,
            role_tags=role_tags,
        )
    )
    metadata = {
        **profile.metadata,
        "job_family": job_family,
        "job_family_confidence": job_family_confidence,
        "job_family_taxonomy_version": JOB_FAMILY_TAXONOMY_VERSION,
        "job_family_source": "production_role_tags_skills",
        "job_family_inferred_at": reference_time.isoformat(),
    }
    aliases = {
        canonical: [raw for raw in profile.skills if canonical_skill(raw).lower() == canonical.lower()]
        for canonical in skills
    }
    aliases = {key: dedupe_keep_order(values) for key, values in aliases.items()}
    return replace(
        profile,
        current_title=current_title,
        headline=headline or current_title,
        location=location,
        skills=skills,
        skill_aliases=aliases,
        experience=normalized_experience,
        role_tags=role_tags,
        years_experience=years_experience,
        seniority=seniority,
        metadata=metadata,
    )
