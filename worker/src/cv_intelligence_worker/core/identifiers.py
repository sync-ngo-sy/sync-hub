from __future__ import annotations

import hashlib
from uuid import NAMESPACE_URL, uuid5


def stable_uuid(*parts: str) -> str:
    material = ":".join(part for part in parts if part)
    return str(uuid5(NAMESPACE_URL, material))


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()
