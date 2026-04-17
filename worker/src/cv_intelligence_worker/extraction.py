from __future__ import annotations

import json
import re
import urllib.error
import urllib.request
from dataclasses import replace
from typing import Any

from .config import WorkerConfig
from .normalization import normalize_profile
from .schema import CandidateProfile, DocumentSource, DocumentText, EducationEntry, ExperienceEntry, ProjectEntry
from .utils import compact_whitespace, dedupe_keep_order, stable_uuid


EMAIL_RE = re.compile(r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}")
PHONE_RE = re.compile(r"(\+\d[\d\s().-]{7,}\d)")
URL_RE = re.compile(r"https?://\S+|linkedin\.com/\S+")
DATE_RANGE_RE = re.compile(
    r"(?P<start>[A-Za-z]{3,9}\s+\d{4}|\d{1,2}/\d{4}|\d{4})\s*[-–]\s*(?P<end>Present|Current|[A-Za-z]{3,9}\s+\d{4}|\d{1,2}/\d{4}|\d{4})",
    re.IGNORECASE,
)
YEAR_RANGE_RE = re.compile(r"\b(?:19|20)\d{2}\b")
COMPANY_HINT_RE = re.compile(
    r"\b(inc|llc|ltd|corp|company|bank|agency|group|systems|solutions|suite|university|college|hospital|labs|studio|technologies|technology|soft|health)\b",
    re.IGNORECASE,
)
LOCATION_HINT_RE = re.compile(r"^[A-Za-z .'-]+,\s*[A-Za-z .'-]+$")
NOISE_LINE_RE = re.compile(r"^(achievements/?tasks|responsibilities|contact\s*:?\s*-?)$", re.IGNORECASE)
TECH_KEYWORDS = [
    "Python",
    "JavaScript",
    "TypeScript",
    "Node.js",
    "NestJS",
    "GraphQL",
    "React",
    "Angular",
    "Vue",
    "PostgreSQL",
    "MongoDB",
    "Redis",
    "Kafka",
    "Docker",
    "Kubernetes",
    "AWS",
    "Azure",
    "GCP",
    ".NET",
    "C#",
    "ASP.NET Core",
    "SQL",
    "WordPress",
    "Webflow",
    "Shopify",
    "SEO",
    "Pandas",
    "NumPy",
    "Matplotlib",
]
SECTION_ALIASES = {
    "summary": {"summary", "about", "profile", "about me"},
    "experience": {"experience", "work experience", "employment", "professional experience"},
    "education": {"education", "education and training"},
    "skills": {"skills", "technical skills", "digital skills", "tech stack"},
    "projects": {"projects", "selected projects", "personal projects"},
    "certifications": {"certifications", "certificates"},
    "languages": {"languages", "language skills"},
    "leadership": {"leadership"},
    "interests": {"interests"},
}
SECTION_STOPPERS = {"summary", "experience", "education", "skills", "projects", "certifications", "languages", "leadership", "interests"}


def _split_lines(text: str) -> list[str]:
    lines: list[str] = []
    for raw_line in text.splitlines():
        line = compact_whitespace(raw_line)
        if not line:
            continue
        matches = _match_section_headers(line)
        if len(matches) > 1 and len(line.split()) <= 6:
            lines.extend(match.upper() for match in matches)
        else:
            lines.append(line)
    return lines


def _normalize_header(line: str) -> str:
    return re.sub(r"[^a-z]+", " ", line.lower()).strip()


def _match_section_headers(line: str) -> list[str]:
    normalized = _normalize_header(line)
    matches: list[str] = []
    for section_name, aliases in SECTION_ALIASES.items():
        for alias in aliases:
            remainder = normalized.replace(alias, "").strip()
            if normalized == alias or (alias in normalized and len(normalized.split()) <= 5 and not remainder):
                matches.append(section_name)
                break
    return matches


def _extract_sections(text: str) -> dict[str, list[str]]:
    current = "header"
    sections: dict[str, list[str]] = {"header": []}
    for line in _split_lines(text):
        matches = _match_section_headers(line)
        if matches:
            current = matches[0]
            sections.setdefault(current, [])
            continue
        sections.setdefault(current, []).append(line)
    return sections


def _extract_name(lines: list[str], source: DocumentSource) -> str:
    for line in lines[:5]:
        if "@" in line or any(char.isdigit() for char in line):
            continue
        if len(line.split()) >= 2:
            return line.title() if line.isupper() else line
    stem = source.original_filename.rsplit(".", 1)[0].replace("-", " ").replace("_", " ")
    return compact_whitespace(stem).title()


def _extract_title(lines: list[str]) -> str:
    for line in lines[1:6]:
        if "@" in line or "linkedin" in line.lower():
            continue
        if 2 <= len(line.split()) <= 12:
            return line
    return ""


def _find_first(pattern: re.Pattern[str], text: str) -> str:
    match = pattern.search(text)
    return match.group(1) if match and match.groups() else match.group(0) if match else ""


def _extract_location(lines: list[str], all_text: str) -> str:
    for line in lines[:10]:
        if "@" in line or PHONE_RE.search(line):
            cleaned = EMAIL_RE.sub("", line)
            cleaned = PHONE_RE.sub("", cleaned)
            cleaned = URL_RE.sub("", cleaned)
            cleaned = compact_whitespace(cleaned.strip(" |,-"))
            if LOCATION_HINT_RE.match(cleaned):
                return cleaned
    for match in re.finditer(r"\b[A-Z][A-Za-z .'-]+,\s*[A-Z][A-Za-z .'-]+\b", all_text):
        candidate = compact_whitespace(match.group(0))
        if not EMAIL_RE.search(candidate):
            return candidate
    return ""


def _extract_summary(sections: dict[str, list[str]], header_lines: list[str]) -> str:
    if sections.get("summary"):
        return " ".join(sections["summary"][:8])
    narrative_lines = [
        line
        for line in header_lines[2:10]
        if "@" not in line and not PHONE_RE.search(line) and not URL_RE.search(line) and len(line.split()) >= 6
    ]
    return " ".join(narrative_lines[:4])


def _extract_skills(text: str, skill_lines: list[str]) -> list[str]:
    corpus = "\n".join(skill_lines) if skill_lines else text
    found = [keyword for keyword in TECH_KEYWORDS if keyword.lower() in corpus.lower()]
    for line in skill_lines:
        if "•" in line or "," in line or "|" in line or "/" in line:
            for part in re.split(r"[•,/|]", line):
                token = compact_whitespace(part)
                if 1 < len(token) <= 40:
                    found.append(token)
    return dedupe_keep_order(found)


def _is_date_line(line: str) -> bool:
    return bool(DATE_RANGE_RE.search(line))


def _parse_date_line(line: str) -> tuple[str | None, str | None, str | None]:
    match = DATE_RANGE_RE.search(line)
    if not match:
        return None, None, None
    start_date = match.group("start")
    end_date = match.group("end")
    remainder = compact_whitespace(line[match.end():].strip(" ,|-"))
    location = remainder if LOCATION_HINT_RE.match(remainder) else None
    return start_date, end_date, location


def _clean_content_line(line: str) -> str:
    return compact_whitespace(line.lstrip("•-* ").strip())


def _looks_like_company(line: str) -> bool:
    return bool(COMPANY_HINT_RE.search(line)) or line.isupper()


def _extract_header_pair(lines: list[str]) -> tuple[str, str]:
    cleaned = [_clean_content_line(line) for line in lines if _clean_content_line(line) and not NOISE_LINE_RE.match(_clean_content_line(line))]
    if not cleaned:
        return "", ""
    if len(cleaned) == 1:
        if " | " in cleaned[0]:
            parts = [part.strip() for part in cleaned[0].split("|") if part.strip()]
            if len(parts) >= 2:
                return parts[0], parts[1]
        return cleaned[0], ""

    first, second = cleaned[-2], cleaned[-1]
    if _looks_like_company(first) and not _looks_like_company(second):
        return second, first
    return first, second


def _estimate_upcoming_header_count(lines: list[str]) -> int:
    tail = [_clean_content_line(line) for line in lines[-3:] if _clean_content_line(line)]
    if not tail:
        return 0
    count = 0
    for candidate in reversed(tail):
        if len(candidate.split()) <= 8 and (not candidate.endswith(".") or _looks_like_company(candidate)):
            count += 1
        else:
            break
    return min(count, 2)


def _extract_experience(experience_lines: list[str]) -> list[ExperienceEntry]:
    entries: list[ExperienceEntry] = []
    lines = []
    for line in experience_lines:
        cleaned = _clean_content_line(line)
        if not cleaned or NOISE_LINE_RE.match(cleaned):
            continue
        if _match_section_headers(cleaned):
            break
        lines.append(cleaned)

    date_indices = [index for index, line in enumerate(lines) if _is_date_line(line)]
    if not date_indices:
        title, company = _extract_header_pair(lines[:3])
        if title or company:
            entries.append(ExperienceEntry(company=company, title=title, description=" ".join(lines[2:]).strip()))
        return entries[:12]

    for index, date_index in enumerate(date_indices):
        previous_boundary = date_indices[index - 1] + 1 if index > 0 else 0
        header_lines = lines[previous_boundary:date_index]
        title, company = _extract_header_pair(header_lines[-3:])
        start_date, end_date, location = _parse_date_line(lines[date_index])
        next_date_index = date_indices[index + 1] if index + 1 < len(date_indices) else len(lines)
        next_segment = lines[date_index + 1:next_date_index]
        next_header_count = _estimate_upcoming_header_count(next_segment) if next_date_index < len(lines) else 0
        description_lines = next_segment[:-next_header_count] if next_header_count else next_segment
        entries.append(
            ExperienceEntry(
                company=company,
                title=title,
                start_date=start_date,
                end_date=end_date,
                description=" ".join(description_lines).strip(),
                location=location,
            )
        )
    return entries[:12]


def _extract_education(lines: list[str]) -> list[EducationEntry]:
    entries: list[EducationEntry] = []
    header_buffer: list[str] = []
    current: dict[str, Any] | None = None
    for line in lines:
        cleaned = _clean_content_line(line)
        if not cleaned or NOISE_LINE_RE.match(cleaned):
            continue
        if _match_section_headers(cleaned):
            break
        if _is_date_line(cleaned):
            if current:
                entries.append(_education_entry_from_state(current))
            degree, institution = _extract_education_header(header_buffer)
            start_date, end_date, _ = _parse_date_line(cleaned)
            current = {
                "degree": degree,
                "institution": institution,
                "start_date": start_date,
                "end_date": end_date,
                "description_lines": [],
            }
            header_buffer = []
            continue
        if current is None:
            header_buffer.append(cleaned)
            header_buffer = header_buffer[-4:]
            continue
        current["description_lines"].append(cleaned)
    if current:
        entries.append(_education_entry_from_state(current))
    elif header_buffer:
        degree, institution = _extract_education_header(header_buffer)
        if degree or institution:
            entries.append(EducationEntry(institution=institution, degree=degree))
    return [entry for entry in entries if entry.institution or entry.degree][:6]


def _extract_education_header(lines: list[str]) -> tuple[str, str]:
    cleaned = [_clean_content_line(line) for line in lines if _clean_content_line(line)]
    if not cleaned:
        return "", ""
    degree = cleaned[0]
    institution_parts = cleaned[1:] if len(cleaned) > 1 else []
    institution = " ".join(institution_parts)
    if not institution:
        institution = next((line for line in cleaned if re.search(r"\b(?:university|college|school|institute|academy|hiast)\b", line.lower())), "")
    return degree, institution


def _education_entry_from_state(state: dict[str, Any]) -> EducationEntry:
    return EducationEntry(
        institution=state["institution"],
        degree=state["degree"],
        start_date=state["start_date"],
        end_date=state["end_date"],
        description=" ".join(state["description_lines"]).strip(),
    )


def _extract_projects(lines: list[str]) -> list[ProjectEntry]:
    projects: list[ProjectEntry] = []
    current_name = ""
    current_desc: list[str] = []
    for line in lines:
        if _match_section_headers(line):
            break
        if not current_name:
            current_name = line.lstrip("•- ")
            continue
        if line.startswith(("•", "-", "*")) and current_desc:
            projects.append(ProjectEntry(name=current_name, description=" ".join(current_desc)))
            current_name = line.lstrip("•- ")
            current_desc = []
            continue
        current_desc.append(line.lstrip("•- "))
    if current_name:
        projects.append(ProjectEntry(name=current_name, description=" ".join(current_desc)))
    return projects[:10]


def _extract_languages(lines: list[str]) -> list[str]:
    languages: list[str] = []
    for line in lines:
        if _match_section_headers(line):
            break
        pieces = re.split(r"[•,|/]", line)
        for piece in pieces:
            token = compact_whitespace(piece)
            if 1 < len(token) <= 30:
                languages.append(token)
    return dedupe_keep_order(languages)


class OpenAICompatibleExtractor:
    def __init__(self, config: WorkerConfig) -> None:
        self.config = config

    def extract(self, source: DocumentSource, document_text: DocumentText) -> CandidateProfile:
        prompt = {
            "task": "Extract a structured candidate profile from CV text. Return JSON only.",
            "schema": {
                "name": "string",
                "current_title": "string",
                "headline": "string",
                "location": "string",
                "email": "string",
                "phone": "string",
                "links": ["string"],
                "years_experience": "number",
                "seniority": "string",
                "role_tags": ["string"],
                "skills": ["string"],
                "languages": ["string"],
                "certifications": ["string"],
                "experience": [
                    {
                        "company": "string",
                        "title": "string",
                        "start_date": "string",
                        "end_date": "string",
                        "location": "string",
                        "description": "string",
                    }
                ],
                "education": [
                    {
                        "institution": "string",
                        "degree": "string",
                        "field": "string",
                        "start_date": "string",
                        "end_date": "string",
                        "description": "string",
                    }
                ],
                "projects": [
                    {
                        "name": "string",
                        "description": "string",
                        "technologies": ["string"],
                    }
                ],
                "summary": "string",
            },
            "cv_text": document_text.raw_text[:16000],
        }
        payload = {
            "model": self.config.extraction_model,
            "messages": [
                {"role": "system", "content": "You are a CV parser. Return strict JSON only."},
                {"role": "user", "content": json.dumps(prompt)},
            ],
            "temperature": 0,
            "response_format": {"type": "json_object"},
        }
        request = urllib.request.Request(
            f"{self.config.model_base_url.rstrip('/')}/chat/completions",
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self.config.model_api_key}",
            },
            method="POST",
        )
        with urllib.request.urlopen(request, timeout=self.config.request_timeout_seconds) as response:
            body = json.loads(response.read().decode("utf-8"))
        content = body["choices"][0]["message"]["content"]
        if isinstance(content, list):
            content = "".join(part.get("text", "") for part in content if isinstance(part, dict))
        content = str(content).strip()
        if content.startswith("```"):
            content = re.sub(r"^```(?:json)?", "", content).strip()
            content = re.sub(r"```$", "", content).strip()
        extracted = json.loads(content)
        profile = heuristic_extract_profile(source, document_text)
        return normalize_profile(
            replace(
                profile,
                name=extracted.get("name") or profile.name,
                current_title=extracted.get("current_title") or profile.current_title,
                headline=extracted.get("headline") or profile.headline,
                location=extracted.get("location") or profile.location,
                email=extracted.get("email") or profile.email,
                phone=extracted.get("phone") or profile.phone,
                links=dedupe_keep_order(extracted.get("links") or profile.links),
                years_experience=float(extracted.get("years_experience") or profile.years_experience or 0),
                seniority=extracted.get("seniority") or profile.seniority,
                role_tags=dedupe_keep_order(extracted.get("role_tags") or profile.role_tags),
                skills=dedupe_keep_order(extracted.get("skills") or profile.skills),
                languages=dedupe_keep_order(extracted.get("languages") or profile.languages),
                certifications=dedupe_keep_order(extracted.get("certifications") or profile.certifications),
                experience=[
                    ExperienceEntry(
                        company=item.get("company", ""),
                        title=item.get("title", ""),
                        start_date=item.get("start_date"),
                        end_date=item.get("end_date"),
                        description=item.get("description", ""),
                        location=item.get("location"),
                    )
                    for item in (extracted.get("experience") or [])
                    if isinstance(item, dict)
                ] or profile.experience,
                education=[
                    EducationEntry(
                        institution=item.get("institution", ""),
                        degree=item.get("degree", ""),
                        field=item.get("field", ""),
                        start_date=item.get("start_date"),
                        end_date=item.get("end_date"),
                        description=item.get("description", ""),
                    )
                    for item in (extracted.get("education") or [])
                    if isinstance(item, dict)
                ] or profile.education,
                projects=[
                    ProjectEntry(
                        name=item.get("name", ""),
                        description=item.get("description", ""),
                        technologies=list(item.get("technologies", [])),
                    )
                    for item in (extracted.get("projects") or [])
                    if isinstance(item, dict)
                ] or profile.projects,
                summary=extracted.get("summary") or profile.summary,
                confidence=0.9,
            )
        )


def heuristic_extract_profile(source: DocumentSource, document_text: DocumentText) -> CandidateProfile:
    sections = _extract_sections(document_text.raw_text)
    header_lines = sections.get("header", [])
    all_text = document_text.raw_text
    name = _extract_name(header_lines, source)
    title = _extract_title(header_lines)
    email = _find_first(EMAIL_RE, all_text)
    phone = _find_first(PHONE_RE, all_text)
    links = dedupe_keep_order(match.group(0) for match in URL_RE.finditer(all_text))
    summary = _extract_summary(sections, header_lines)
    skills = _extract_skills(all_text, sections.get("skills", []))
    experience = _extract_experience(sections.get("experience", []))
    education = _extract_education(sections.get("education", []))
    projects = _extract_projects(sections.get("projects", []))
    languages = _extract_languages(sections.get("languages", []))
    candidate_id = stable_uuid(source.tenant_id, email or phone or (links[0] if links else source.document_id))
    missing_fields = [field for field, value in {"name": name, "current_title": title, "email": email, "skills": skills}.items() if not value]
    profile = CandidateProfile(
        tenant_id=source.tenant_id,
        candidate_id=candidate_id,
        source_document_id=source.document_id,
        source_sha256=source.document_sha256,
        name=name,
        current_title=title,
        headline=title,
        location=_extract_location(header_lines, all_text),
        email=email,
        phone=phone,
        links=links,
        years_experience=0.0,
        seniority="unclassified",
        role_tags=[],
        skills=skills,
        skill_aliases={},
        experience=experience,
        education=education,
        projects=projects,
        languages=languages,
        certifications=sections.get("certifications", []),
        summary=summary,
        raw_text=document_text.raw_text,
        metadata={"sections": list(sections.keys())},
        confidence=0.55,
        missing_fields=missing_fields,
        parse_warnings=list(document_text.warnings),
    )
    return normalize_profile(profile)


def extract_candidate_profile(source: DocumentSource, document_text: DocumentText, config: WorkerConfig) -> CandidateProfile:
    if config.extraction_model:
        try:
            return OpenAICompatibleExtractor(config).extract(source, document_text)
        except (urllib.error.URLError, KeyError, ValueError, json.JSONDecodeError):
            if not config.allow_heuristic_fallback:
                raise
    return heuristic_extract_profile(source, document_text)
