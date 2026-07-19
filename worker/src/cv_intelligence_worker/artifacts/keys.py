from __future__ import annotations

from ..core.identifiers import sha256_text


def comparison_key(tenant_id: str, candidate_ids: list[str], query: str = "") -> str:
    canonical = "|".join(sorted(candidate_ids)) + "|" + query.strip().lower()
    return sha256_text(f"{tenant_id}:{canonical}")
