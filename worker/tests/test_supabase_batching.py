from __future__ import annotations

from typing import Any
from unittest.mock import MagicMock

import pytest

from cv_intelligence_worker.integrations.supabase.batching import SupabaseBatchWriter


RETRYABLE_ERROR = RuntimeError("canceling statement due to statement timeout")


def test_writer_splits_retryable_batches_and_preserves_order() -> None:
    calls: list[list[int]] = []

    def upsert(
        _table: str,
        rows: list[dict[str, Any]],
        _on_conflict: str,
    ) -> None:
        calls.append([row["id"] for row in rows])
        if len(rows) > 2:
            raise RETRYABLE_ERROR

    writer = SupabaseBatchWriter(upsert, default_batch_size=10)
    rows = [{"id": value} for value in range(4)]

    assert writer.write_many("candidates", rows, "id") == 4
    assert calls == [[0, 1, 2, 3], [0, 1], [2, 3]]


def test_writer_retries_single_rows_with_linear_backoff() -> None:
    upsert = MagicMock(side_effect=[RETRYABLE_ERROR, RETRYABLE_ERROR, None])
    delays: list[float] = []
    writer = SupabaseBatchWriter(
        upsert,
        default_batch_size=10,
        sleeper=delays.append,
    )

    writer.write_many("candidates", [{"id": 1}], "id")

    assert upsert.call_count == 3
    assert delays == [0.5, 1.0]


def test_writer_does_not_retry_non_retryable_errors() -> None:
    error = RuntimeError("permission denied")
    upsert = MagicMock(side_effect=error)
    sleeper = MagicMock()
    writer = SupabaseBatchWriter(
        upsert,
        default_batch_size=10,
        sleeper=sleeper,
    )

    with pytest.raises(RuntimeError, match="permission denied"):
        writer.write_many("candidates", [{"id": 1}], "id")

    upsert.assert_called_once()
    sleeper.assert_not_called()


def test_writer_raises_after_retry_budget_is_exhausted() -> None:
    upsert = MagicMock(side_effect=RETRYABLE_ERROR)
    sleeper = MagicMock()
    writer = SupabaseBatchWriter(
        upsert,
        default_batch_size=10,
        max_attempts=2,
        sleeper=sleeper,
    )

    with pytest.raises(RuntimeError, match="statement timeout"):
        writer.write_many("candidates", [{"id": 1}], "id")

    assert upsert.call_count == 2
    sleeper.assert_called_once_with(0.5)
