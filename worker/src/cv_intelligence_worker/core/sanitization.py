from __future__ import annotations


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
