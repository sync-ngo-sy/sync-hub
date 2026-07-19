from __future__ import annotations

from datetime import datetime, timedelta, timezone


def queued_or_stale_status_filter(
    *,
    status_column: str,
    queued_status: str,
    processing_status: str,
    retry_stale_minutes: int,
    now: datetime | None = None,
) -> dict[str, str]:
    if retry_stale_minutes <= 0:
        return {status_column: f"eq.{queued_status}"}

    reference_time = now or datetime.now(timezone.utc)
    stale_before = (
        (reference_time - timedelta(minutes=retry_stale_minutes))
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z")
    )
    return {
        "or": (
            f"({status_column}.eq.{queued_status},"
            f"and({status_column}.eq.{processing_status},"
            f"updated_at.lt.{stale_before}))"
        )
    }
