from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime, timezone
from typing import Iterable
from uuid import NAMESPACE_URL, uuid5


NON_ALNUM_RE = re.compile(r"[^a-z0-9]+")


def slugify(value: str) -> str:
    return NON_ALNUM_RE.sub("-", value.lower()).strip("-")


def stable_uuid(*parts: str) -> str:
    material = ":".join(part for part in parts if part)
    return str(uuid5(NAMESPACE_URL, material))


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def compact_whitespace(value: str) -> str:
    return " ".join(value.split()).strip()


def approximate_token_count(value: str) -> int:
    return max(1, len(value.split()))


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def json_dumps(value: object) -> str:
    return json.dumps(value, ensure_ascii=True, sort_keys=True)


def dedupe_keep_order(values: Iterable[str]) -> list[str]:
    seen: set[str] = set()
    items: list[str] = []
    for raw in values:
        value = raw.strip()
        if not value:
            continue
        lowered = value.lower()
        if lowered in seen:
            continue
        seen.add(lowered)
        items.append(value)
    return items
