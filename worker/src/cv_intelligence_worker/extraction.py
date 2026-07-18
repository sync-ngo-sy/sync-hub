from __future__ import annotations

import re
from dataclasses import replace
from typing import Any

from .candidate_extraction import build_candidate_system_prompt, build_job_family_prompt, build_job_family_system_prompt
from .config import WorkerConfig
from .extraction_constants import (
    COMPANY_HINT_RE,
    DATE_RANGE_RE,
    EMAIL_RE,
    JOB_TITLE_HINT_RE,
    KNOWN_CITY_LOCATIONS,
    LOCATION_HINT_RE,
    NOISE_LINE_RE,
    NON_NAME_TOKENS,
    PAGE_NOISE_RE,
    PHONE_RE,
    SECTION_ALIASES,
    SECTION_ALIAS_PATTERNS,
    SECTION_RENDER_ORDER,
    SOCIAL_NOISE_RE,
    TECH_KEYWORDS,
    URL_RE,
)
from .llm import LLMClient, LLMResponseError
from .llm_models import CandidateExtraction, JobFamilyExtraction
from .normalization import normalize_location, normalize_profile
from .normalization_constants import JOB_FAMILY_TAXONOMY_VERSION
from .schema import CandidateProfile, DocumentSource, DocumentText, EducationEntry, ExperienceEntry, ProjectEntry
from .utils import compact_whitespace, dedupe_keep_order, format_error_message, normalize_email, stable_uuid


def _split_lines(text: str) -> list[str]:
    lines: list[str] = []
    for raw_line in text.splitlines():
        line = compact_whitespace(raw_line)
        if not line:
            continue
        for split_line in _split_embedded_section_headers(line):
            matches = _match_section_headers(split_line)
            if len(matches) > 1 and len(split_line.split()) <= 6:
                lines.extend(match.upper() for match in matches)
            else:
                lines.append(split_line)
    return lines


def _normalize_header(line: str) -> str:
    return re.sub(r"[^a-z]+", " ", line.lower()).strip()


def _header_label(section_name: str) -> str:
    return section_name.upper()


def _is_loud_header_match(value: str) -> bool:
    return value.isupper() or value.istitle()


def _split_embedded_section_headers(line: str) -> list[str]:
    best_match: tuple[str, re.Match[str]] | None = None
    for section_name, _alias, pattern in SECTION_ALIAS_PATTERNS:
        match = pattern.search(line)
        if not match:
            continue
        matched_text = line[match.start():match.end()]
        prefix = compact_whitespace(line[: match.start()].strip(" |:-–"))
        suffix = compact_whitespace(line[match.end():].strip(" |:-–"))
        if match.start() == 0:
            if suffix and len(suffix.split()) > 10 and not _is_loud_header_match(matched_text):
                continue
            best_match = (section_name, match)
            break
        if matched_text.isupper():
            best_match = (section_name, match)
            break
    if not best_match:
        return [line]

    section_name, match = best_match
    prefix = compact_whitespace(line[: match.start()].strip(" |:-–"))
    suffix = compact_whitespace(line[match.end():].strip(" |:-–"))
    pieces: list[str] = []
    if prefix:
        pieces.append(prefix)
    pieces.append(_header_label(section_name))
    if suffix:
        pieces.extend(_split_embedded_section_headers(suffix))
    return pieces


def _match_section_headers(line: str) -> list[str]:
    normalized = _normalize_header(line)
    matches: list[str] = []
    for section_name, aliases in SECTION_ALIASES.items():
        for alias in aliases:
            remainder = normalized.replace(alias, "").strip()
            if normalized == alias:
                matches.append(section_name)
                break
            if alias in normalized and len(normalized.split()) <= 5 and not remainder:
                matches.append(section_name)
                break
            if alias in normalized and len(normalized.split()) <= 4 and set(remainder.split()).issubset({"contact", "cv", "resume"}):
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


def _split_pre_experience_date_hints(summary_lines: list[str]) -> tuple[list[str], list[str]]:
    cleaned = [compact_whitespace(line) for line in summary_lines if compact_whitespace(line)]
    if not cleaned:
        return [], []

    hints: list[str] = []
    while cleaned:
        candidate = cleaned[-1]
        if _is_date_line(candidate) or LOCATION_HINT_RE.match(candidate):
            hints.insert(0, candidate)
            cleaned.pop()
            continue
        break
    return cleaned, hints


def _render_sectioned_cv_text(sections: dict[str, list[str]], max_chars: int = 16000) -> str:
    rendered_sections = {key: list(value) for key, value in sections.items()}
    summary_lines, pre_experience_hints = _split_pre_experience_date_hints(rendered_sections.get("summary", []))
    if summary_lines != rendered_sections.get("summary", []):
        rendered_sections["summary"] = summary_lines
    if pre_experience_hints:
        rendered_sections["pre_experience_date_hints"] = pre_experience_hints

    order = ["header", "summary", "pre_experience_date_hints", *[name for name in SECTION_RENDER_ORDER if name not in {"header", "summary"}]]
    blocks: list[str] = []
    for section_name in order:
        lines = [compact_whitespace(line) for line in rendered_sections.get(section_name, []) if compact_whitespace(line)]
        if not lines:
            continue
        label = section_name.upper()
        blocks.append(f"<{label}>\n" + "\n".join(lines) + f"\n</{label}>")

    rendered = "\n\n".join(blocks).strip()
    if len(rendered) <= max_chars:
        return rendered
    return rendered[:max_chars].rstrip()


def _extract_name(lines: list[str], source: DocumentSource) -> str:
    for line in lines[:12]:
        cleaned = _clean_content_line(line)
        if not cleaned or PAGE_NOISE_RE.match(cleaned):
            continue
        if _match_section_headers(cleaned) or LOCATION_HINT_RE.match(cleaned) or _location_from_known_city(cleaned):
            continue
        if "@" in cleaned or URL_RE.search(cleaned) or PHONE_RE.search(cleaned) or any(char.isdigit() for char in cleaned):
            continue
        if JOB_TITLE_HINT_RE.search(cleaned) or SOCIAL_NOISE_RE.search(cleaned):
            continue
        if _looks_like_person_name(cleaned):
            return cleaned.title() if cleaned.isupper() else cleaned
    stem = source.original_filename.rsplit(".", 1)[0]
    stem = stem.replace("%20", " ").replace("-", " ").replace("_", " ")
    if " " not in stem and "20" in stem:
        stem = stem.replace("20", " ")
    stem = re.sub(r"\([^)]*\)", " ", stem)
    stem = re.sub(r"\b(?:cv|resume|curriculum vitae|new|final|copy)\b", " ", stem, flags=re.IGNORECASE)
    stem = re.sub(r"\b\d{4}(?:[-_ ]?\d{1,2}){0,2}\b", " ", stem)
    return compact_whitespace(stem).title()


def _looks_like_person_name(line: str) -> bool:
    cleaned = compact_whitespace(line.strip("."))
    words = cleaned.split()
    if not 2 <= len(words) <= 5:
        return False
    if not re.fullmatch(r"[A-Za-z][A-Za-z .'-]*", cleaned):
        return False
    lowered_words = {word.strip(".").lower() for word in words}
    if lowered_words & NON_NAME_TOKENS:
        return False
    if JOB_TITLE_HINT_RE.search(cleaned):
        return False
    return True


def _extract_title(lines: list[str]) -> str:
    for line in lines[1:12]:
        cleaned = _clean_content_line(line)
        if not cleaned or PAGE_NOISE_RE.match(cleaned):
            continue
        if _match_section_headers(cleaned) or LOCATION_HINT_RE.match(cleaned) or _location_from_known_city(cleaned):
            continue
        if "@" in cleaned or URL_RE.search(cleaned) or PHONE_RE.search(cleaned):
            continue
        if cleaned.endswith("."):
            continue
        if JOB_TITLE_HINT_RE.search(cleaned) and 1 <= len(cleaned.split()) <= 12:
            return cleaned
    return ""


def _extract_title_from_text(text: str) -> str:
    role_terms = r"developer|engineer|designer|specialist|manager|analyst|consultant|administrator|architect|tester"
    patterns = [
        rf"\b(?:i am|i'm|as|work as|working as)\s+(?:an?\s+|the\s+)?(?P<title>[A-Za-z][A-Za-z0-9+#/& .-]{{2,70}}\b(?:{role_terms})\b)",
        rf"\b(?P<title>[A-Za-z][A-Za-z0-9+#/& .-]{{2,50}}\b(?:{role_terms})\b)\s+with\b",
    ]
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if not match:
            continue
        title = compact_whitespace(match.group("title").strip(" .,-"))
        if _looks_like_job_title(title):
            return title
    return ""


def _find_first(pattern: re.Pattern[str], text: str) -> str:
    match = pattern.search(text)
    return match.group(1) if match and match.groups() else match.group(0) if match else ""


def _location_from_known_city(text: str) -> str:
    lowered = text.lower()
    for city, location in KNOWN_CITY_LOCATIONS.items():
        if re.search(rf"\b{re.escape(city)}\b", lowered):
            return location
    return ""


def _location_candidates_from_line(line: str) -> list[str]:
    cleaned = EMAIL_RE.sub(" ", line)
    cleaned = PHONE_RE.sub(" ", cleaned)
    cleaned = URL_RE.sub(" ", cleaned)
    cleaned = SOCIAL_NOISE_RE.sub(" ", cleaned)
    cleaned = compact_whitespace(cleaned.strip(" |,-"))
    city_location = _location_from_known_city(cleaned)
    if not cleaned or ("," not in cleaned and not city_location):
        return [city_location] if city_location else []
    candidates = [city_location] if city_location else []
    candidates.append(cleaned)
    for delimiter in ("|", "•", ";"):
        candidates.extend(compact_whitespace(part) for part in cleaned.split(delimiter) if compact_whitespace(part))
    for match in re.finditer(r"\b([A-Z][A-Za-z .'-]{1,40}),\s*([A-Z][A-Za-z .'-]{1,40})", cleaned):
        city = compact_whitespace(match.group(1))
        country_words = compact_whitespace(match.group(2)).split()
        for size in range(1, len(country_words) + 1):
            candidates.append(f"{city}, {' '.join(country_words[:size])}")
    return candidates


def _extract_location(lines: list[str], all_text: str) -> str:
    for line in lines[:20]:
        for candidate in _location_candidates_from_line(line):
            normalized = normalize_location(candidate)
            if normalized:
                return normalized
    for match in re.finditer(r"\b[A-Z][A-Za-z .'-]{1,40},\s*[A-Z][A-Za-z .'-]{1,40}\b", all_text):
        candidate = compact_whitespace(match.group(0))
        known_city_location = _location_from_known_city(candidate)
        if known_city_location:
            return known_city_location
        normalized = normalize_location(candidate)
        if normalized:
            return normalized
    known_city_location = _location_from_known_city("\n".join(lines[:20]))
    if known_city_location:
        return known_city_location
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


def _parse_date_line_parts(line: str) -> tuple[str | None, str | None, str | None, str, str]:
    match = DATE_RANGE_RE.search(line)
    if not match:
        return None, None, None, "", ""
    start_date = match.group("start")
    end_date = match.group("end")
    prefix = compact_whitespace(line[: match.start()].strip(" ,|-–"))
    remainder = compact_whitespace(line[match.end():].strip(" ,|-"))
    location = normalize_location(remainder) if remainder else ""
    return start_date, end_date, location or None, prefix, remainder


def _parse_date_line(line: str) -> tuple[str | None, str | None, str | None]:
    start_date, end_date, location, _prefix, _remainder = _parse_date_line_parts(line)
    return start_date, end_date, location


def _clean_content_line(line: str) -> str:
    return compact_whitespace(line.lstrip("•-* ").strip())


def _looks_like_company(line: str) -> bool:
    return bool(COMPANY_HINT_RE.search(line)) or line.isupper()


def _looks_like_job_title(line: str) -> bool:
    return bool(JOB_TITLE_HINT_RE.search(line))


def _split_inline_title_company(line: str) -> tuple[str, str]:
    cleaned = _clean_content_line(line)
    if not cleaned:
        return "", ""
    for separator in (" | ", " - ", " – ", " — ", " at "):
        if separator not in cleaned:
            continue
        parts = [part.strip() for part in cleaned.split(separator, 1) if part.strip()]
        if len(parts) != 2:
            continue
        left, right = parts
        if _looks_like_job_title(left) and not _looks_like_job_title(right):
            return left, right
        if _looks_like_job_title(right) and not _looks_like_job_title(left):
            return right, left
        return left, right
    return cleaned, ""


def _extract_header_pair(lines: list[str]) -> tuple[str, str]:
    cleaned = [_clean_content_line(line) for line in lines if _clean_content_line(line) and not NOISE_LINE_RE.match(_clean_content_line(line))]
    if not cleaned:
        return "", ""
    if len(cleaned) == 1:
        return _split_inline_title_company(cleaned[0])

    first, second = cleaned[-2], cleaned[-1]
    if _looks_like_job_title(second) and not _looks_like_job_title(first):
        return second, first
    if _looks_like_job_title(first) and not _looks_like_job_title(second):
        return first, second
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


def _extract_undated_experience_entry(lines: list[str]) -> ExperienceEntry | None:
    title_index = next((index for index, line in enumerate(lines[:12]) if _looks_like_job_title(line)), -1)
    if title_index < 0:
        return None
    title = lines[title_index]
    company = ""
    description_start = title_index + 1
    if title_index > 0 and not _looks_like_job_title(lines[title_index - 1]):
        company = lines[title_index - 1]
    elif title_index + 1 < len(lines) and not _looks_like_job_title(lines[title_index + 1]):
        company = lines[title_index + 1]
        description_start = title_index + 2
    return ExperienceEntry(company=company, title=title, description=" ".join(lines[description_start:]).strip())


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
        undated_entry = _extract_undated_experience_entry(lines)
        if undated_entry:
            entries.append(undated_entry)
            return entries[:12]
        title, company = _extract_header_pair(lines[:3])
        if title or company:
            entries.append(ExperienceEntry(company=company, title=title, description=" ".join(lines[2:]).strip()))
        return entries[:12]

    for index, date_index in enumerate(date_indices):
        previous_boundary = date_indices[index - 1] + 1 if index > 0 else 0
        header_lines = lines[previous_boundary:date_index]
        start_date, end_date, location, date_prefix, date_remainder = _parse_date_line_parts(lines[date_index])
        header_candidates = [*header_lines[-3:], *([date_prefix] if date_prefix else [])]
        title, company = _extract_header_pair(header_candidates[-4:])
        next_date_index = date_indices[index + 1] if index + 1 < len(date_indices) else len(lines)
        next_segment = lines[date_index + 1:next_date_index]
        if next_segment:
            first_next = _clean_content_line(next_segment[0])
            if first_next and _looks_like_job_title(first_next) and not _looks_like_job_title(title):
                company = company or title or date_prefix
                title = first_next
                next_segment = next_segment[1:]
            elif first_next and _looks_like_job_title(title) and not company and not _looks_like_job_title(first_next) and len(first_next.split()) <= 8:
                company = first_next
                next_segment = next_segment[1:]
        next_header_count = _estimate_upcoming_header_count(next_segment) if next_date_index < len(lines) else 0
        description_lines = next_segment[:-next_header_count] if next_header_count else next_segment
        if date_remainder and not location:
            description_lines = [date_remainder, *description_lines]
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
    if entries and not any(_looks_like_job_title(entry.title) for entry in entries):
        undated_entry = _extract_undated_experience_entry(lines)
        if undated_entry:
            return [undated_entry]
    return entries[:12]


def _extract_experience_fallback(all_text: str) -> list[ExperienceEntry]:
    candidate_lines = [line for line in _split_lines(all_text) if not _match_section_headers(line)]
    entries = _extract_experience(candidate_lines)
    return [entry for entry in entries if _looks_like_job_title(entry.title)][:12]


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
            start_date, end_date, _, date_prefix, date_remainder = _parse_date_line_parts(cleaned)
            header_candidates = [*header_buffer, *([date_prefix] if date_prefix else [])]
            degree, institution = _extract_education_header(header_candidates)
            current = {
                "degree": degree,
                "institution": institution,
                "start_date": start_date,
                "end_date": end_date,
                "description_lines": [date_remainder] if date_remainder and not normalize_location(date_remainder) else [],
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
    institution_hint = re.compile(r"\b(?:university|college|school|institute|academy|hiast)\b", re.IGNORECASE)
    if len(cleaned) == 1 and institution_hint.search(cleaned[0]):
        return "", cleaned[0]
    hinted_institution = next((line for line in cleaned if institution_hint.search(line)), "")
    if hinted_institution:
        degree = " ".join(line for line in cleaned if line != hinted_institution)
        return degree, hinted_institution
    degree = cleaned[0]
    institution_parts = cleaned[1:] if len(cleaned) > 1 else []
    institution = " ".join(institution_parts)
    if not institution:
        institution = next((line for line in cleaned if institution_hint.search(line)), "")
    if institution == degree and len(cleaned) > 1:
        degree = next((line for line in cleaned if line != institution), degree)
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


def _profile_missing_fields(profile: CandidateProfile) -> list[str]:
    missing_fields: list[str] = []
    if not profile.name:
        missing_fields.append("name")
    if not profile.current_title:
        missing_fields.append("current_title")
    if not (profile.email or profile.phone or profile.links):
        missing_fields.append("contact")
    if not profile.skills:
        missing_fields.append("skills")
    if not _has_professional_activity(profile):
        missing_fields.append("experience")
    return missing_fields


def _has_professional_activity(profile: CandidateProfile) -> bool:
    if profile.experience or profile.projects or profile.years_experience > 0:
        return True
    if profile.education and "student" in profile.current_title.lower():
        return True
    return False


def _fraction_at_least(count: int, target: int) -> float:
    if target <= 0:
        return 1.0
    return min(1.0, count / target)


def _calculate_profile_confidence(profile: CandidateProfile, document_text: DocumentText) -> float:
    raw_text_length = len(document_text.raw_text.strip())
    identity_score = 1.0 if profile.name and profile.current_title else 0.55 if profile.name or profile.current_title else 0.0
    contact_score = (0.65 if profile.email else 0.0) + (0.35 if profile.phone else 0.0)
    skills_score = _fraction_at_least(len(profile.skills), 6)
    employment_score = 1.0 if len(profile.experience) >= 2 else 0.65 if profile.experience else 0.0
    project_score = 1.0 if len(profile.projects) >= 3 else 0.75 if profile.projects else 0.0
    stated_experience_score = 0.65 if profile.years_experience > 0 else 0.0
    education_activity_score = 0.65 if profile.education and "student" in profile.current_title.lower() else 0.0
    experience_score = max(employment_score, project_score, stated_experience_score, education_activity_score)
    education_score = 1.0 if profile.education else 0.0
    raw_text_score = 1.0 if raw_text_length >= 1200 else 0.55 if raw_text_length >= 300 else 0.0
    facets_score = 1.0 if profile.years_experience > 0 and profile.seniority and profile.role_tags else 0.55 if profile.years_experience > 0 or profile.role_tags else 0.0
    summary_score = 1.0 if len(profile.summary) >= 120 else 0.65 if profile.summary else 0.0
    supplemental_score = min(1.0, (len(profile.links) * 0.35) + (len(profile.projects) * 0.25) + (len(profile.certifications) * 0.2) + (len(profile.languages) * 0.1))
    weighted_scores = [
        (raw_text_score, 10),
        (identity_score, 16),
        (contact_score, 12),
        (skills_score, 16),
        (experience_score, 18),
        (education_score, 8),
        (1.0 if profile.location else 0.0, 5),
        (summary_score, 5),
        (facets_score, 8),
        (supplemental_score, 2),
    ]
    total_weight = sum(weight for _score, weight in weighted_scores)
    confidence = sum(score * weight for score, weight in weighted_scores) / total_weight
    warning_penalty = min(0.12, len(document_text.warnings) * 0.03)
    if raw_text_length < 300:
        confidence = min(confidence, 0.45)
    return round(max(0.0, min(0.99, confidence - warning_penalty)), 2)


def build_candidate_prompt(document_text: DocumentText) -> dict[str, Any]:
    sections = _extract_sections(document_text.raw_text)
    return {
        "sectioned_cv_text": _render_sectioned_cv_text(sections, max_chars=16000),
    }


def _string_value(value: Any) -> str:
    return compact_whitespace(value) if isinstance(value, str) else ""


def _string_list(values: Any) -> list[str]:
    if not isinstance(values, list):
        return []
    return dedupe_keep_order(_string_value(item) for item in values)


def _number_value(value: Any) -> float:
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        normalized = compact_whitespace(value)
        if not normalized:
            return 0.0
        match = re.search(r"\d+(?:\.\d+)?", normalized)
        if match:
            return float(match.group(0))
    return 0.0


def _candidate_id_for_profile(source: DocumentSource, *, email: str, phone: str = "", links: list[str] | None = None) -> str:
    normalized_email = normalize_email(email)
    if normalized_email:
        return stable_uuid(source.tenant_id, normalized_email)
    links = links or []
    return stable_uuid(source.tenant_id, phone or (links[0] if links else source.document_id))


def _experience_entries(values: Any) -> list[ExperienceEntry]:
    entries: list[ExperienceEntry] = []
    for item in values or []:
        if not isinstance(item, dict):
            continue
        company = _string_value(item.get("company"))
        title = _string_value(item.get("title"))
        description = _string_value(item.get("description"))
        if not (company or title or description):
            continue
        entries.append(
            ExperienceEntry(
                company=company,
                title=title,
                start_date=_string_value(item.get("start_date")) or None,
                end_date=_string_value(item.get("end_date")) or None,
                description=description,
                location=normalize_location(_string_value(item.get("location"))) or None,
            )
        )
    return entries


def _education_entries(values: Any) -> list[EducationEntry]:
    entries: list[EducationEntry] = []
    for item in values or []:
        if not isinstance(item, dict):
            continue
        institution = _string_value(item.get("institution"))
        degree = _string_value(item.get("degree"))
        field = _string_value(item.get("field"))
        description = _string_value(item.get("description"))
        if not (institution or degree or field or description):
            continue
        entries.append(
            EducationEntry(
                institution=institution,
                degree=degree,
                field=field,
                start_date=_string_value(item.get("start_date")) or None,
                end_date=_string_value(item.get("end_date")) or None,
                description=description,
            )
        )
    return entries


def _project_entries(values: Any) -> list[ProjectEntry]:
    entries: list[ProjectEntry] = []
    for item in values or []:
        if not isinstance(item, dict):
            continue
        name = _string_value(item.get("name"))
        description = _string_value(item.get("description"))
        technologies = _string_list(item.get("technologies"))
        if not (name or description or technologies):
            continue
        entries.append(ProjectEntry(name=name, description=description, technologies=technologies))
    return entries


def _validate_llm_profile(profile: CandidateProfile) -> None:
    missing_core = []
    if not profile.name:
        missing_core.append("name")
    if not (profile.current_title or profile.experience or profile.skills):
        missing_core.append("professional_profile")
    if missing_core:
        raise ValueError(f"structured extractor returned incomplete profile: {', '.join(missing_core)}")


def _validated_job_family_result(value: JobFamilyExtraction, profile: CandidateProfile, config: WorkerConfig) -> dict[str, Any] | None:
    family = value.job_family.value
    confidence = value.confidence
    if confidence < max(0.0, min(1.0, config.job_family_min_confidence)):
        return None
    deterministic_family = _string_value(profile.metadata.get("job_family")) or "Unclassified"
    deterministic_confidence = _number_value(profile.metadata.get("job_family_confidence"))
    auto_accept_confidence = max(config.job_family_min_confidence, min(1.0, config.job_family_auto_accept_confidence))
    review_reasons: list[str] = []
    if confidence < auto_accept_confidence:
        review_reasons.append("llm_confidence_below_auto_accept_threshold")
    if family == "Unclassified":
        review_reasons.append("llm_returned_unclassified")
    if family != deterministic_family and deterministic_confidence >= 0.78 and confidence < 0.9:
        review_reasons.append("llm_disagrees_with_high_confidence_rules")
    review_status = "needs_review" if review_reasons else "auto_accepted"
    return {
        "job_family": family,
        "job_family_confidence": round(confidence, 3),
        "job_family_taxonomy_version": JOB_FAMILY_TAXONOMY_VERSION,
        "job_family_source": "llm",
        "job_family_review_status": review_status,
        "job_family_review_reason": ",".join(review_reasons) if review_reasons else "accepted",
        "job_family_rules_baseline": deterministic_family,
        "job_family_rules_confidence": deterministic_confidence,
        "job_family_rationale": compact_whitespace(value.rationale)[:500],
        "job_family_matched_role_tags": dedupe_keep_order(value.matched_role_tags),
        "job_family_matched_skills": dedupe_keep_order(value.matched_skills),
        "job_family_alternate": value.alternate_job_family.value if value.alternate_job_family else "",
    }


def classify_job_family_with_llm(profile: CandidateProfile, config: WorkerConfig, *, client: LLMClient | None = None) -> CandidateProfile:
    provider = config.job_family_provider.lower()
    model = config.job_family_model or config.extraction_model
    if provider in {"rules", "deterministic", "off", "disabled"} or not model:
        return profile

    try:
        effective_provider = config.extraction_provider.lower() if provider == "llm" else provider
        if client is None or client.provider != effective_provider:
            client = LLMClient(config, provider=effective_provider)
        result = client.parse(
            model=model,
            system_prompt=build_job_family_system_prompt(),
            prompt=build_job_family_prompt(profile),
            response_model=JobFamilyExtraction,
        )
        validated = _validated_job_family_result(result, profile, config)
        if not validated:
            return replace(
                profile,
                metadata={
                    **profile.metadata,
                    "job_family_review_status": "needs_review",
                    "job_family_review_reason": "llm_rejected_invalid_label_or_low_confidence",
                    "job_family_rules_baseline": profile.metadata.get("job_family"),
                    "job_family_rules_confidence": profile.metadata.get("job_family_confidence"),
                    "job_family_llm_status": "rejected",
                    "job_family_llm_rejection_reason": "invalid_label_or_low_confidence",
                },
            )
        return replace(
            profile,
            metadata={
                **profile.metadata,
                **validated,
            },
        )
    except LLMResponseError as exc:
        return replace(
            profile,
            metadata={
                **profile.metadata,
                "job_family_review_status": "needs_review",
                "job_family_review_reason": "llm_failed_rules_fallback",
                "job_family_rules_baseline": profile.metadata.get("job_family"),
                "job_family_rules_confidence": profile.metadata.get("job_family_confidence"),
                "job_family_llm_status": "failed",
                "job_family_llm_error": format_error_message(exc)[:300],
            },
        )


def _merge_extracted_profile(source: DocumentSource, document_text: DocumentText, extracted: dict[str, Any]) -> CandidateProfile:
    email = normalize_email(_string_value(extracted.get("email")))
    links = _string_list(extracted.get("links"))
    phone = _string_value(extracted.get("phone"))
    profile = normalize_profile(
        CandidateProfile(
            tenant_id=source.tenant_id,
            candidate_id=_candidate_id_for_profile(source, email=email, phone=phone, links=links),
            source_document_id=source.document_id,
            source_sha256=source.document_sha256,
            name=_string_value(extracted.get("name")),
            current_title=_string_value(extracted.get("current_title")),
            headline=_string_value(extracted.get("headline")),
            location=normalize_location(_string_value(extracted.get("location"))),
            email=email,
            phone=phone,
            links=links,
            years_experience=_number_value(extracted.get("years_experience")),
            seniority=_string_value(extracted.get("seniority")) or "unclassified",
            role_tags=_string_list(extracted.get("role_tags")),
            skills=_string_list(extracted.get("skills")),
            skill_aliases={},
            experience=_experience_entries(extracted.get("experience")),
            education=_education_entries(extracted.get("education")),
            projects=_project_entries(extracted.get("projects")),
            languages=_string_list(extracted.get("languages")),
            certifications=_string_list(extracted.get("certifications")),
            summary=_string_value(extracted.get("summary")),
            raw_text=document_text.raw_text,
            metadata={"extraction_source": "llm"},
            confidence=0.0,
            missing_fields=[],
            parse_warnings=list(document_text.warnings),
        )
    )
    profile = replace(profile, missing_fields=_profile_missing_fields(profile), confidence=_calculate_profile_confidence(profile, document_text))
    _validate_llm_profile(profile)
    return profile


def _merge_draft_profile_json(original: Any, overrides: Any) -> Any:
    if isinstance(original, dict) and isinstance(overrides, dict):
        merged = dict(original)
        for key, value in overrides.items():
            if key in merged:
                merged[key] = _merge_draft_profile_json(merged[key], value)
            else:
                merged[key] = value
        return merged
    if isinstance(original, list) and isinstance(overrides, list):
        return overrides if overrides else original
    return overrides if overrides is not None else original


class LLMProfileExtractor:
    def __init__(self, config: WorkerConfig, client: LLMClient) -> None:
        self.config = config
        self.client = client

    def extract(self, source: DocumentSource, document_text: DocumentText) -> CandidateProfile:
        extracted = self.client.parse(
            model=self.config.extraction_model,
            system_prompt=build_candidate_system_prompt(),
            prompt=build_candidate_prompt(document_text),
            response_model=CandidateExtraction,
        )
        return _merge_extracted_profile(source, document_text, extracted.model_dump(mode="json"))


def heuristic_extract_profile(source: DocumentSource, document_text: DocumentText) -> CandidateProfile:
    sections = _extract_sections(document_text.raw_text)
    raw_lines = _split_lines(document_text.raw_text)
    header_lines = sections.get("header", []) or raw_lines[:16]
    all_text = document_text.raw_text
    name = _extract_name(header_lines, source)
    title = _extract_title(header_lines)
    email = normalize_email(_find_first(EMAIL_RE, all_text))
    phone = _find_first(PHONE_RE, all_text)
    links = dedupe_keep_order(match.group(0) for match in URL_RE.finditer(all_text))
    summary = _extract_summary(sections, header_lines)
    if not title:
        title = _extract_title_from_text(summary) or _extract_title_from_text(all_text)
    skills = _extract_skills(all_text, sections.get("skills", []))
    experience = _extract_experience(sections.get("experience", []))
    if not experience:
        experience = _extract_experience_fallback(all_text)
    education = _extract_education(sections.get("education", []))
    projects = _extract_projects(sections.get("projects", []))
    languages = _extract_languages(sections.get("languages", []))
    candidate_id = _candidate_id_for_profile(source, email=email, phone=phone, links=links)
    profile = normalize_profile(CandidateProfile(
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
        confidence=0.0,
        missing_fields=[],
        parse_warnings=list(document_text.warnings),
    ))
    return replace(
        profile,
        missing_fields=_profile_missing_fields(profile),
        confidence=_calculate_profile_confidence(profile, document_text),
    )


def extract_candidate_profile(source: DocumentSource, document_text: DocumentText, config: WorkerConfig) -> CandidateProfile:
    if source.metadata.get("is_draft"):
        from .draft_validation import validate_user_overrides_with_llm
        from .schema import candidate_profile_from_dict

        draft_data = source.metadata.get("draft_data", {})
        original_profile = draft_data.get("parsed_profile_json") or {}
        user_overrides = draft_data.get("user_overrides_json") or {}

        merged_profile_json = _merge_draft_profile_json(original_profile, user_overrides)

        is_valid, reason = validate_user_overrides_with_llm(original_profile, user_overrides, config)
        if not is_valid:
            raise ValueError(f"AI Validation Rejected: {reason}")

        profile = candidate_profile_from_dict(merged_profile_json)
        return classify_job_family_with_llm(profile, config)

    if not config.extraction_model:
        raise RuntimeError("CV extraction model is not configured; refusing to parse without LLM extraction")

    provider = config.extraction_provider.lower()
    client = LLMClient(config, provider=provider)
    profile = LLMProfileExtractor(config, client).extract(source, document_text)
    return classify_job_family_with_llm(profile, config, client=client)
