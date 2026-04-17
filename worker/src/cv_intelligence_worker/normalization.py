from __future__ import annotations

import re
from collections import defaultdict
from dataclasses import replace
from datetime import datetime, timezone

from .schema import CandidateProfile, ExperienceEntry
from .utils import compact_whitespace, dedupe_keep_order, slugify


SKILL_ALIASES = {
    "angularjs": "Angular",
    "api": "APIs",
    "apis": "APIs",
    "asp-net": "ASP.NET",
    "asp-net-core": "ASP.NET Core",
    "aws": "AWS",
    "azure": "Azure",
    "c#": "C#",
    "css": "CSS",
    "cyber-security": "Cybersecurity",
    "docker": "Docker",
    "dotnet": ".NET",
    "firebase": "Firebase",
    "flutter": "Flutter",
    "gcp": "Google Cloud",
    "gitlab": "GitLab",
    "golang": "Go",
    "graphql": "GraphQL",
    "html": "HTML",
    "javascript": "JavaScript",
    "jira": "Jira",
    "js": "JavaScript",
    "k8s": "Kubernetes",
    "mongodb": "MongoDB",
    "mui": "MUI",
    "mysql": "MySQL",
    "next": "Next.js",
    "nextjs": "Next.js",
    "node": "Node.js",
    "node-js": "Node.js",
    "node.js": "Node.js",
    "nodejs": "Node.js",
    "postgres": "PostgreSQL",
    "postgresql": "PostgreSQL",
    "python": "Python",
    "react-native": "React Native",
    "reactjs": "React",
    "redux-toolkit": "Redux Toolkit",
    "rest-api": "REST APIs",
    "rest-apis": "REST APIs",
    "seo": "SEO",
    "sql": "SQL",
    "tailwind": "Tailwind CSS",
    "tailwindcss": "Tailwind CSS",
    "ts": "TypeScript",
    "typescript": "TypeScript",
    "ui-ux": "UI/UX",
    "ux-ui": "UI/UX",
    "wordpress": "WordPress",
}

ROLE_PATTERNS = {
    "full-stack": ["full stack", "full-stack"],
    "mobile": ["mobile", "flutter", "android", "ios", "react native", "swift", "kotlin"],
    "frontend": ["frontend", "front-end", "front end", "react", "next.js", "angular", "vue", "html", "css", "ui/ux", "webflow"],
    "backend": ["backend", "back-end", "back end", "api", "microservice", "node.js", "nestjs", ".net", "asp.net", "django", "flask", "fastapi", "laravel"],
    "devops": ["devops", "sre", "terraform", "kubernetes", "docker", "ci/cd", "cloud infrastructure"],
    "data": ["data engineer", "analytics", "etl", "pandas", "numpy", "bi", "data analysis"],
    "ml": ["machine learning", "ml", "ai engineer", "llm", "tensorflow", "pytorch", "scikit-learn"],
    "qa": ["qa", "quality assurance", "automation testing", "test automation", "selenium"],
    "security": ["security", "cybersecurity", "siem", "soc", "threat detection", "penetration testing", "vulnerability"],
}

ROLE_TAG_ALIASES = {
    "fullstack": "full-stack",
    "full-stack": "full-stack",
    "frontend": "frontend",
    "front-end": "frontend",
    "backend": "backend",
    "back-end": "backend",
    "mobile": "mobile",
    "devops": "devops",
    "sre": "devops",
    "data": "data",
    "ml": "ml",
    "ai": "ml",
    "qa": "qa",
    "security": "security",
    "cybersecurity": "security",
}

SENIORITY_ALIASES = {
    "entry-level": "junior",
    "entry-levels": "junior",
    "intern": "junior",
    "junior": "junior",
    "jr": "junior",
    "junior-level": "junior",
    "mid": "mid",
    "middle": "mid",
    "mid-level": "mid",
    "midlevel": "mid",
    "mid-senior": "senior",
    "senior": "senior",
    "sr": "senior",
    "sr.": "senior",
    "lead": "staff-plus",
    "principal": "staff-plus",
    "staff": "staff-plus",
    "architect": "staff-plus",
    "head": "staff-plus",
    "staff-plus": "staff-plus",
    "unclassified": "unclassified",
    "unknown": "unclassified",
}

ROLE_HINT_RE = re.compile(
    r"\b(front[\s-]?end|back[\s-]?end|full[\s-]?stack|mobile|flutter|android|ios|developer|engineer|architect|designer|manager|analyst|specialist|consultant|administrator|seo|security|devops|sre|qa)\b",
    re.IGNORECASE,
)
LOCATION_PATTERN = re.compile(r"^[A-Za-z .'-]+,\s*[A-Za-z .'-]+$")
CONTACT_PATTERN = re.compile(r"@|https?://|linkedin|github|portfolio|\+\d")
DATE_FRAGMENT_RE = re.compile(r"\b(?:19|20)\d{2}\b")
YEARS_PATTERN = re.compile(r"(\d+)\+?\s+years?")
TITLE_VERB_RE = re.compile(r"\b(collaborated|implemented|developed|built|worked|improved|led|designed|optimized|conducted)\b", re.IGNORECASE)
DATE_RANGE_PATTERN = re.compile(
    r"(?P<start>(?:\d{1,2}/)?\d{4}|present|current)\s*[-–]\s*(?P<end>(?:\d{1,2}/)?\d{4}|present|current)",
    re.IGNORECASE,
)
ACADEMIC_HINTS = (
    "information technology",
    "computer engineering",
    "software engineering",
    "artificial intelligence",
    "informatics",
    "bachelor",
    "degree",
    "student",
)


def canonical_skill(value: object) -> str:
    if not isinstance(value, str):
        return ""
    normalized = compact_whitespace(value)
    if not normalized:
        return ""
    slug = slugify(normalized)
    if slug in SKILL_ALIASES:
        return SKILL_ALIASES[slug]
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


def _year_from_fragment(value: str) -> int | None:
    match = re.search(r"(\d{4})", value)
    if not match:
        return None
    year = int(match.group(1))
    if 1980 <= year <= datetime.now(timezone.utc).year + 1:
        return year
    return None


def experience_years_from_entries(entries: list[ExperienceEntry]) -> float:
    ranges: list[tuple[int, int]] = []
    current_year = datetime.now(timezone.utc).year
    for entry in entries:
        start_year = _year_from_fragment(entry.start_date or "")
        end_text = (entry.end_date or "").lower()
        end_year = current_year if "present" in end_text or "current" in end_text else _year_from_fragment(end_text)
        if start_year and end_year and end_year >= start_year:
            ranges.append((start_year, end_year))
            continue
        merged = f"{entry.start_date or ''} - {entry.end_date or ''} {entry.description}"
        match = DATE_RANGE_PATTERN.search(merged)
        if not match:
            continue
        start_year = _year_from_fragment(match.group("start"))
        end_year = current_year if match.group("end").lower() in {"present", "current"} else _year_from_fragment(match.group("end"))
        if start_year and end_year and end_year >= start_year:
            ranges.append((start_year, end_year))
    if not ranges:
        return 0.0
    min_year = min(start for start, _ in ranges)
    max_year = max(end for _, end in ranges)
    return float(max_year - min_year)


def infer_years_experience(profile: CandidateProfile) -> float:
    explicit_years = profile.years_experience if profile.years_experience > 0 else 0.0
    range_years = experience_years_from_entries(profile.experience)
    haystack = f"{profile.summary}\n{profile.headline}\n{profile.raw_text}"
    regex_match = YEARS_PATTERN.search(haystack.lower())
    regex_years = float(regex_match.group(1)) if regex_match else 0.0

    candidates = [value for value in (range_years, regex_years) if value > 0]
    if explicit_years > 0:
        reference = max(candidates) if candidates else 0.0
        if reference == 0.0 or explicit_years <= reference + 3:
            candidates.append(explicit_years)
    return max(candidates, default=0.0)


def infer_seniority(profile: CandidateProfile, years_experience: float) -> str:
    explicit = _normalize_seniority_label(profile.seniority)
    haystack = f"{profile.current_title} {profile.headline} {' '.join(skill.lower() for skill in profile.skills)} {profile.summary}".lower()

    if explicit != "unclassified":
        if explicit in {"senior", "staff-plus"} and 0 < years_experience < 6:
            if not any(term in haystack for term in ("senior", "principal", "staff", "lead", "architect", "head of")):
                explicit = "mid"
        if explicit == "junior" and years_experience >= 4:
            if not any(term in haystack for term in ("junior", "intern", "entry level")):
                explicit = "mid"
        return explicit

    if any(term in haystack for term in ("principal", "staff", "lead", "architect", "head of")):
        return "staff-plus"
    if "senior" in haystack or years_experience >= 6:
        return "senior"
    if any(term in haystack for term in ("junior", "intern")) or (0 < years_experience < 2):
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


def _is_title_like(value: str, *, allow_long: bool = False) -> bool:
    text = compact_whitespace(value)
    if not text:
        return False
    if "years of experience" in text.lower():
        return False
    if TITLE_VERB_RE.search(text):
        return False
    if CONTACT_PATTERN.search(text):
        return False
    if LOCATION_PATTERN.match(text):
        return False
    if text.lower().startswith("generated by "):
        return False
    if DATE_FRAGMENT_RE.search(text):
        return False
    if any(term in text.lower() for term in ACADEMIC_HINTS) and not ROLE_HINT_RE.search(text):
        return False
    max_words = 14 if allow_long else 10
    if len(text.split()) > max_words and not ROLE_HINT_RE.search(text):
        return False
    return bool(ROLE_HINT_RE.search(text))


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
    return current_title or (experience_titles[0] if experience_titles else "")


def normalize_profile(profile: CandidateProfile) -> CandidateProfile:
    years_experience = infer_years_experience(profile)
    current_title = choose_current_title(profile)
    headline = compact_whitespace(profile.headline) or current_title
    skills = dedupe_keep_order(
        canonical_skill(skill)
        for skill in [*profile.skills, *infer_additional_skills(replace(profile, current_title=current_title, headline=headline))]
    )
    role_tags = dedupe_keep_order(infer_role_tags(replace(profile, current_title=current_title, headline=headline, skills=skills)))
    seniority = infer_seniority(replace(profile, current_title=current_title, headline=headline, skills=skills), years_experience)
    aliases = {
        canonical: [raw for raw in profile.skills if canonical_skill(raw).lower() == canonical.lower()]
        for canonical in skills
    }
    aliases = {key: dedupe_keep_order(values) for key, values in aliases.items()}
    return replace(
        profile,
        current_title=current_title,
        headline=headline or current_title,
        skills=skills,
        skill_aliases=aliases,
        role_tags=role_tags,
        years_experience=years_experience,
        seniority=seniority,
    )
