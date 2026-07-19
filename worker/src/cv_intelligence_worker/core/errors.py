from __future__ import annotations


def format_error_message(exc: Exception) -> str:
    return f"{type(exc).__name__}: {exc}"
