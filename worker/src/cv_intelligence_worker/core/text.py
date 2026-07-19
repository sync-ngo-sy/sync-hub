from __future__ import annotations

import re
from typing import Iterable


NON_ALNUM_RE = re.compile(r"[^a-z0-9]+")


def skill_slugify(value: str) -> str:
    token = compact_whitespace(value).lower()
    special = {
        ".net": "dotnet",
        "c#": "c-sharp",
        "c++": "cpp",
        "ci/cd": "ci-cd",
        "ui/ux": "ui-ux",
        "tcp/ip": "tcp-ip",
        "r&d": "r-and-d",
    }
    if token in special:
        return special[token]
    token = token.replace("c#", "c sharp")
    token = token.replace("c++", "c plus plus")
    token = token.replace("#", " sharp ")
    token = token.replace("&", " and ")
    token = token.replace("+", " plus ")
    token = NON_ALNUM_RE.sub("-", token).strip("-")
    token = re.sub(r"-+", "-", token)
    return special.get(token, token)


def normalize_email(value: str) -> str:
    return compact_whitespace(value).strip(" <>.,;:").lower()


def compact_whitespace(value: str) -> str:
    return " ".join(value.split()).strip()


def approximate_token_count(value: str) -> int:
    return max(1, len(value.split()))


def dedupe_keep_order(values: Iterable[object]) -> list[str]:
    seen: set[str] = set()
    items: list[str] = []
    for raw in values:
        if not isinstance(raw, str):
            continue
        value = raw.strip()
        if not value:
            continue
        lowered = value.lower()
        if lowered in seen:
            continue
        seen.add(lowered)
        items.append(value)
    return items
