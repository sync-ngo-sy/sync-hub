from __future__ import annotations

import hashlib
import json
import re
import ssl
from datetime import datetime, timezone
from typing import Iterable
from urllib import request as urllib_request
from uuid import NAMESPACE_URL, uuid5


NON_ALNUM_RE = re.compile(r"[^a-z0-9]+")
_SSL_CONTEXT: ssl.SSLContext | None = None


def build_ssl_context() -> ssl.SSLContext:
    global _SSL_CONTEXT
    if _SSL_CONTEXT is not None:
        return _SSL_CONTEXT
    try:
        import certifi  # type: ignore
    except Exception:
        _SSL_CONTEXT = ssl.create_default_context()
    else:
        _SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where())
    return _SSL_CONTEXT


def urlopen(request: urllib_request.Request, *, timeout: int):
    return urllib_request.urlopen(request, timeout=timeout, context=build_ssl_context())


def slugify(value: str) -> str:
    return NON_ALNUM_RE.sub("-", value.lower()).strip("-")


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


def strip_nul_bytes(value):
    if isinstance(value, str):
        return value.replace("\x00", "")
    if isinstance(value, list):
        return [strip_nul_bytes(item) for item in value]
    if isinstance(value, tuple):
        return [strip_nul_bytes(item) for item in value]
    if isinstance(value, dict):
        return {key: strip_nul_bytes(item) for key, item in value.items()}
    return value


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


def format_error_message(exc: Exception) -> str:
    return f"{type(exc).__name__}: {exc}"

