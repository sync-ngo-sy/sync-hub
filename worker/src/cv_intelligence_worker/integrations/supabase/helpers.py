from __future__ import annotations

import json
from typing import Any, Iterable

from ...core.sanitization import strip_nul_bytes


def vector_literal(values: list[float]) -> str:
    return "[" + ",".join(f"{value:.8f}" for value in values) + "]"


def is_jwt(value: str) -> bool:
    return value.count(".") == 2


def chunks(values: list[Any], size: int) -> Iterable[list[Any]]:
    size = max(1, size)
    for index in range(0, len(values), size):
        yield values[index : index + size]


def json_payload_size(value: Any) -> int:
    return len(json.dumps(strip_nul_bytes(value), separators=(",", ":"), ensure_ascii=True).encode("utf-8"))


def dedupe_rows(rows: list[dict[str, Any]], key_fields: tuple[str, ...]) -> list[dict[str, Any]]:
    keyed: dict[tuple[Any, ...], dict[str, Any]] = {}
    for row in rows:
        key = tuple(row.get(field) for field in key_fields)
        keyed[key] = row
    return list(keyed.values())


def format_bytes(value: int) -> str:
    units = ("B", "KiB", "MiB", "GiB", "TiB")
    size = float(max(0, value))
    for unit in units:
        if size < 1024 or unit == units[-1]:
            return f"{size:.1f} {unit}" if unit != "B" else f"{int(size)} {unit}"
        size /= 1024
    return f"{value} B"


def bounded_years_experience(value: Any) -> float:
    try:
        years = float(value or 0.0)
    except (TypeError, ValueError):
        return 0.0
    return round(max(0.0, min(80.0, years)), 2)


def is_retryable_supabase_error(error: Exception) -> bool:
    message = str(error).lower()
    return any(
        marker in message
        for marker in (
            "57014",
            "statement timeout",
            "timeout",
            "temporarily unavailable",
            "connection reset",
        )
    )
