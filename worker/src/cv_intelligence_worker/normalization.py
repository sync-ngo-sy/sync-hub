from __future__ import annotations

import re
from dataclasses import replace
from datetime import datetime, timezone

from .schema import CandidateProfile, ExperienceEntry
from .utils import dedupe_keep_order, slugify


SKILL_ALIASES = {
    "nodejs": "Node.js",
    "node-js": "Node.js",
    "node": "Node.js",
    "nestjs": "NestJS",
    "nextjs": "Next.js",
    "asp-net-core": "ASP.NET Core",
    "asp-net": "ASP.NET",
    "dotnet": ".NET",
    "csharp": "C#",
    "postgres": "PostgreSQL",
    "postgresql": "PostgreSQL",
    "js": "JavaScript",
    "ts": "TypeScript",
    "graphql": "GraphQL",
    "reactjs": "React",
    "angularjs": "Angular",
    "k8s": "Kubernetes",
    "gcp": "Google Cloud",
    "aws": "AWS",
}

ROLE_PATTERNS = {
    "backend": ["backend", "api", "microservice", "node.js", "nest", ".net", "django", "flask"],
    "frontend": ["frontend", "react", "angular", "vue", "css", "html", "webflow"],
    "full-stack": ["full stack", "full-stack"],
    "mobile": ["android", "ios", "flutter", "react native"],
    "devops": ["devops", "kubernetes", "docker", "terraform", "ci/cd"],
    "data": ["data", "machine learning", "pandas", "numpy", "analytics"],
    "qa": ["qa", "testing", "automation"],
    "security": ["security", "cybersecurity", "siem", "soc"],
}

YEARS_PATTERN = re.compile(r"(\d+)\+?\s+years?")
DATE_RANGE_PATTERN = re.compile(
    r"(?P<start>(?:\d{1,2}/)?\d{4}|present|current)\s*[-–]\s*(?P<end>(?:\d{1,2}/)?\d{4}|present|current)",
    re.IGNORECASE,
)


def canonical_skill(value: str) -> str:
    slug = slugify(value)
    if slug in SKILL_ALIASES:
        return SKILL_ALIASES[slug]
    if value.isupper() and len(value) <= 5:
        return value
    return value.strip()


def infer_seniority(profile: CandidateProfile) -> str:
    haystack = f"{profile.current_title} {profile.headline} {' '.join(skill.lower() for skill in profile.skills)}".lower()
    if any(term in haystack for term in ("principal", "staff", "lead", "architect", "head of")):
        return "staff-plus"
    if any(term in haystack for term in ("senior", "sr.")) or profile.years_experience >= 7:
        return "senior"
    if any(term in haystack for term in ("junior", "intern")) or profile.years_experience < 2:
        return "junior"
    if profile.years_experience >= 3:
        return "mid"
    return "unclassified"


def infer_role_tags(profile: CandidateProfile) -> list[str]:
    haystack = f"{profile.current_title} {profile.headline} {' '.join(profile.skills)} {' '.join(entry.description for entry in profile.experience)}".lower()
    roles = [role for role, patterns in ROLE_PATTERNS.items() if any(pattern in haystack for pattern in patterns)]
    if not roles and "engineer" in haystack:
        roles.append("backend")
    return roles or ["generalist"]


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
    if profile.years_experience > 0:
        return profile.years_experience
    haystack = f"{profile.summary}\n{profile.headline}\n{profile.raw_text}"
    match = YEARS_PATTERN.search(haystack.lower())
    if match:
        return float(match.group(1))
    return experience_years_from_entries(profile.experience)


def normalize_profile(profile: CandidateProfile) -> CandidateProfile:
    skills = dedupe_keep_order(canonical_skill(skill) for skill in profile.skills)
    role_tags = dedupe_keep_order(infer_role_tags(profile))
    years_experience = infer_years_experience(profile)
    seniority = profile.seniority if profile.seniority != "unclassified" else infer_seniority(profile)
    current_title = profile.current_title or (profile.experience[0].title if profile.experience else "")
    headline = profile.headline or current_title
    aliases = {canonical: [raw for raw in profile.skills if canonical_skill(raw).lower() == canonical.lower()] for canonical in skills}
    aliases = {key: dedupe_keep_order(values) for key, values in aliases.items()}
    return replace(
        profile,
        current_title=current_title,
        headline=headline,
        skills=skills,
        skill_aliases=aliases,
        role_tags=role_tags,
        years_experience=years_experience,
        seniority=seniority,
    )
