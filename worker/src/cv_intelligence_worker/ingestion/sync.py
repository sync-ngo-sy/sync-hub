from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable

from ..artifacts import LocalArtifactStore
from ..config import WorkerConfig
from ..integrations.supabase import SupabaseClient
from ..domain.models import ArtifactBundle
from ..core.errors import format_error_message


@dataclass
class SyncBatcher:
    config: WorkerConfig
    store: LocalArtifactStore
    supabase: SupabaseClient | None
    sync_to_supabase: bool
    add_warning: Callable[[str], None]
    failures: list[dict[str, str]]
    sync_stats: dict[str, int]
    batch_size: int
    pending: list[tuple[ArtifactBundle, Path]] = field(default_factory=list)
    database_limit_warned: bool = False
    storage_limit_warned: bool = False

    def add(self, bundle: ArtifactBundle, bundle_path: Path) -> None:
        self.pending.append((bundle, bundle_path))
        if len(self.pending) >= self.batch_size:
            self.flush()

    def flush(self) -> None:
        if not self.pending:
            return
        sync_batch = list(self.pending)
        self.pending.clear()
        if not self.sync_to_supabase:
            return
        if not self.supabase:
            self.add_warning("Supabase credentials are not configured; bundles were cached locally but not synced.")
            return

        try:
            stats = self.supabase.sync_bundles([bundle for bundle, _bundle_path in sync_batch])
            self._record_sync_stats(stats.table_rows, stats.estimated_database_bytes, stats.storage_bytes)
            self._warn_when_near_capacity(stats.storage_bytes)
            for warning in stats.warnings:
                self.add_warning(warning)
            self._delete_synced_bundle_files(sync_batch)
        except Exception as exc:  # noqa: BLE001
            self._record_sync_failure(sync_batch, exc)

    def _record_sync_stats(self, rows_by_table: dict[str, int], estimated_database_bytes: int, storage_bytes: int) -> None:
        for table, count in rows_by_table.items():
            self.sync_stats[table] = self.sync_stats.get(table, 0) + count
        self.sync_stats["estimated_database_bytes"] = self.sync_stats.get("estimated_database_bytes", 0) + estimated_database_bytes
        self.sync_stats["storage_bytes"] = self.sync_stats.get("storage_bytes", 0) + storage_bytes

    def _warn_when_near_capacity(self, batch_storage_bytes: int) -> None:
        if self.config.supabase_database_limit_bytes and not self.database_limit_warned:
            projected_database_bytes = int(
                self.sync_stats["estimated_database_bytes"] * self.config.supabase_database_expansion_factor
            )
            ratio = projected_database_bytes / self.config.supabase_database_limit_bytes
            if ratio >= self.config.supabase_limit_warning_threshold:
                self.database_limit_warned = True
                self.add_warning(
                    "Estimated database payload for this ingestion run is near the configured Supabase limit; "
                    "apply the capacity snapshot migration for exact project usage before continuing a very large sync."
                )

        if self.config.supabase_storage_limit_bytes and batch_storage_bytes and not self.storage_limit_warned:
            ratio = self.sync_stats["storage_bytes"] / self.config.supabase_storage_limit_bytes
            if ratio >= self.config.supabase_limit_warning_threshold:
                self.storage_limit_warned = True
                self.add_warning("Estimated storage uploaded in this ingestion run is near the configured Supabase storage limit.")

    def _delete_synced_bundle_files(self, sync_batch: list[tuple[ArtifactBundle, Path]]) -> None:
        if not self.config.delete_synced_bundles:
            return
        for _bundle, bundle_path in sync_batch:
            self.store.delete_file(bundle_path)

    def _record_sync_failure(self, sync_batch: list[tuple[ArtifactBundle, Path]], exc: Exception) -> None:
        for bundle, _bundle_path in sync_batch:
            self.failures.append({"source_path": bundle.source.source_path, "error": format_error_message(exc)})
