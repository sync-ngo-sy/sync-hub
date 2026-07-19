from __future__ import annotations

from collections import defaultdict
from typing import Any

from ..core.text import compact_whitespace, skill_slugify


def normalize_evidence(group: list[dict[str, Any]], canonical: str) -> dict[str, Any]:
    aliases: list[str] = []
    for row in group:
        evidence = row.get("evidence")
        if isinstance(evidence, dict):
            raw_aliases = evidence.get("aliases")
            if isinstance(raw_aliases, list):
                aliases.extend(str(alias) for alias in raw_aliases if str(alias).strip())
        aliases.append(str(row.get("canonical_skill") or ""))

    deduped: list[str] = []
    seen: set[str] = set()
    for alias in aliases:
        alias = compact_whitespace(alias)
        key = alias.casefold()
        if not alias or key == canonical.casefold() or key in seen:
            continue
        seen.add(key)
        deduped.append(alias)
    return {"aliases": deduped[:25]}


def _row_rank(
    row: dict[str, Any],
    row_targets: dict[str, tuple[str, str]],
) -> tuple[int, int, str]:
    canonical, slug = row_targets[row["id"]]
    current_label = compact_whitespace(str(row.get("canonical_skill") or ""))
    current_slug = compact_whitespace(str(row.get("skill_slug") or ""))
    return (
        0 if current_slug == slug else 1,
        0 if current_label.casefold() == canonical.casefold() else 1,
        str(row.get("created_at") or row["id"]),
    )


def _changed_row(
    row: dict[str, Any],
    canonical: str,
    slug: str,
    evidence: dict[str, Any],
) -> bool:
    return (
        compact_whitespace(str(row.get("skill_slug") or "")) != slug
        or compact_whitespace(str(row.get("canonical_skill") or "")).casefold() != canonical.casefold()
        or row.get("evidence") != evidence
    )


def build_plan(rows: list[dict[str, Any]], mapping: dict[str, Any]) -> dict[str, Any]:
    drops: list[dict[str, Any]] = []
    keep_groups: dict[tuple[str, str, str], list[dict[str, Any]]] = defaultdict(list)
    row_targets: dict[str, tuple[str, str]] = {}
    for row in rows:
        raw_label = compact_whitespace(str(row.get("canonical_skill") or ""))
        decision = mapping.get(raw_label)
        if decision is None:
            raise ValueError("skill mapping is incomplete")
        canonical = compact_whitespace(str(decision.get("canonical") or ""))
        action = decision.get("action")
        target_slug = skill_slugify(canonical) if canonical else ""
        if action == "drop" or not canonical or not target_slug:
            drops.append(row)
            continue
        row_targets[row["id"]] = (canonical, target_slug)
        keep_groups[(row["tenant_id"], row["candidate_id"], target_slug)].append(row)

    delete_ids = [row["id"] for row in drops]
    upserts: list[dict[str, Any]] = []
    duplicate_rows: list[dict[str, Any]] = []
    for _group_key, group in keep_groups.items():
        keeper = sorted(group, key=lambda row: _row_rank(row, row_targets))[0]
        duplicate_rows.extend(row for row in group if row["id"] != keeper["id"])
        canonical, slug = row_targets[keeper["id"]]
        evidence = normalize_evidence(group, canonical)
        upsert = {
            "id": keeper["id"],
            "tenant_id": keeper["tenant_id"],
            "candidate_id": keeper["candidate_id"],
            "skill_slug": slug,
            "canonical_skill": canonical,
            "evidence": evidence,
        }
        if _changed_row(keeper, canonical, slug, evidence):
            upserts.append(upsert)

    delete_ids.extend(row["id"] for row in duplicate_rows)
    return {
        "delete_ids": delete_ids,
        "drop_rows": drops,
        "duplicate_rows": duplicate_rows,
        "upserts": upserts,
        "final_rows": len(rows) - len(delete_ids),
    }
