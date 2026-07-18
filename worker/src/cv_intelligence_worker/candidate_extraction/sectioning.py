from __future__ import annotations

import re

from ..extraction_constants import (
    DATE_RANGE_RE,
    LOCATION_HINT_RE,
    SECTION_ALIASES,
    SECTION_ALIAS_PATTERNS,
    SECTION_RENDER_ORDER,
)
from ..utils import compact_whitespace


def split_lines(text: str) -> list[str]:
    lines: list[str] = []
    for raw_line in text.splitlines():
        line = compact_whitespace(raw_line)
        if not line:
            continue
        for split_line in _split_embedded_section_headers(line):
            matches = match_section_headers(split_line)
            if len(matches) > 1 and len(split_line.split()) <= 6:
                lines.extend(match.upper() for match in matches)
            else:
                lines.append(split_line)
    return lines


def match_section_headers(line: str) -> list[str]:
    normalized = re.sub(r"[^a-z]+", " ", line.lower()).strip()
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


def extract_sections(text: str) -> dict[str, list[str]]:
    current = "header"
    sections: dict[str, list[str]] = {"header": []}
    for line in split_lines(text):
        matches = match_section_headers(line)
        if matches:
            current = matches[0]
            sections.setdefault(current, [])
            continue
        sections.setdefault(current, []).append(line)
    return sections


def render_sectioned_cv_text(sections: dict[str, list[str]], max_chars: int = 16000) -> str:
    rendered_sections = {key: list(value) for key, value in sections.items()}
    summary_lines, pre_experience_hints = _split_pre_experience_date_hints(rendered_sections.get("summary", []))
    if summary_lines != rendered_sections.get("summary", []):
        rendered_sections["summary"] = summary_lines
    if pre_experience_hints:
        rendered_sections["pre_experience_date_hints"] = pre_experience_hints

    order = [
        "header",
        "summary",
        "pre_experience_date_hints",
        *[name for name in SECTION_RENDER_ORDER if name not in {"header", "summary"}],
    ]
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


def is_date_line(line: str) -> bool:
    return bool(DATE_RANGE_RE.search(line))


def _split_embedded_section_headers(line: str) -> list[str]:
    best_match: tuple[str, re.Match[str]] | None = None
    for section_name, _alias, pattern in SECTION_ALIAS_PATTERNS:
        match = pattern.search(line)
        if not match:
            continue
        matched_text = line[match.start() : match.end()]
        suffix = compact_whitespace(line[match.end() :].strip(" |:-–"))
        if match.start() == 0:
            if suffix and len(suffix.split()) > 10 and not (matched_text.isupper() or matched_text.istitle()):
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
    suffix = compact_whitespace(line[match.end() :].strip(" |:-–"))
    pieces: list[str] = []
    if prefix:
        pieces.append(prefix)
    pieces.append(section_name.upper())
    if suffix:
        pieces.extend(_split_embedded_section_headers(suffix))
    return pieces


def _split_pre_experience_date_hints(summary_lines: list[str]) -> tuple[list[str], list[str]]:
    cleaned = [compact_whitespace(line) for line in summary_lines if compact_whitespace(line)]
    if not cleaned:
        return [], []

    hints: list[str] = []
    while cleaned:
        candidate = cleaned[-1]
        if is_date_line(candidate) or LOCATION_HINT_RE.match(candidate):
            hints.insert(0, candidate)
            cleaned.pop()
            continue
        break
    return cleaned, hints
