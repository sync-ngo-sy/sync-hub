from __future__ import annotations

import time
from collections.abc import Callable
from typing import Any

from .helpers import chunks, is_retryable_supabase_error


UpsertRows = Callable[[str, list[dict[str, Any]], str], Any]


class SupabaseBatchWriter:
    def __init__(
        self,
        upsert: UpsertRows,
        *,
        default_batch_size: int,
        max_attempts: int = 3,
        base_delay_seconds: float = 0.5,
        sleeper: Callable[[float], None] = time.sleep,
    ) -> None:
        if max_attempts < 1:
            raise ValueError("max_attempts must be at least one")
        self._upsert = upsert
        self._default_batch_size = default_batch_size
        self._max_attempts = max_attempts
        self._base_delay_seconds = base_delay_seconds
        self._sleep = sleeper

    def write_many(
        self,
        table: str,
        rows: list[dict[str, Any]],
        on_conflict: str,
        batch_size: int | None = None,
    ) -> int:
        for batch in chunks(rows, batch_size or self._default_batch_size):
            self._write_batch(table, batch, on_conflict)
        return len(rows)

    def _write_batch(
        self,
        table: str,
        rows: list[dict[str, Any]],
        on_conflict: str,
    ) -> None:
        try:
            self._upsert(table, rows, on_conflict)
        except RuntimeError as exc:
            if not is_retryable_supabase_error(exc):
                raise
            if len(rows) == 1:
                self._retry_single_row(table, rows, on_conflict, exc)
                return
            midpoint = len(rows) // 2
            self._write_batch(table, rows[:midpoint], on_conflict)
            self._write_batch(table, rows[midpoint:], on_conflict)

    def _retry_single_row(
        self,
        table: str,
        rows: list[dict[str, Any]],
        on_conflict: str,
        first_error: RuntimeError,
    ) -> None:
        last_error = first_error
        for attempt in range(2, self._max_attempts + 1):
            self._sleep(self._base_delay_seconds * (attempt - 1))
            try:
                self._upsert(table, rows, on_conflict)
                return
            except RuntimeError as exc:
                if not is_retryable_supabase_error(exc):
                    raise
                last_error = exc
        raise last_error
