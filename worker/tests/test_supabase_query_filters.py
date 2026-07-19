from __future__ import annotations

from datetime import datetime, timezone

from cv_intelligence_worker.integrations.supabase.query_filters import (
    queued_or_stale_status_filter,
)


def test_filter_selects_only_queued_rows_when_stale_retries_are_disabled() -> None:
    result = queued_or_stale_status_filter(
        status_column="parse_status",
        queued_status="pending_validation",
        processing_status="parsing",
        retry_stale_minutes=0,
    )

    assert result == {"parse_status": "eq.pending_validation"}


def test_filter_includes_queued_and_stale_processing_rows() -> None:
    result = queued_or_stale_status_filter(
        status_column="resume_ingestion_status",
        queued_status="queued",
        processing_status="parsing",
        retry_stale_minutes=45,
        now=datetime(2026, 7, 19, 12, 30, 15, 123456, tzinfo=timezone.utc),
    )

    assert result == {
        "or": (
            "(resume_ingestion_status.eq.queued,"
            "and(resume_ingestion_status.eq.parsing,"
            "updated_at.lt.2026-07-19T11:45:15Z))"
        )
    }
