from __future__ import annotations

import argparse
from dataclasses import replace

from ..config import WorkerConfig
from ..manatal import ManatalSync, ManatalSyncResult
from ..workflows import ManatalOriginalsBackfill
from .common import emit_json, progress_printer, resolve_configured_tenant_id
from .registry import command_registry


def _configure_manatal_sync(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--updated-since", default="", help="Fetch candidates updated at or after this ISO timestamp")
    parser.add_argument(
        "--lookback-hours",
        type=int,
        default=None,
        help="Fallback lookback window when --updated-since and --candidate-id are omitted",
    )
    parser.add_argument(
        "--candidate-id",
        dest="candidate_ids",
        action="append",
        help="Specific Manatal candidate ID to sync; pass multiple times",
    )
    parser.add_argument("--pending", action="store_true", help="Sync candidate IDs queued by the Manatal webhook receiver")
    parser.add_argument(
        "--queue-only", action="store_true", help="Queue matching Manatal candidate IDs without downloading or parsing resumes"
    )
    parser.add_argument("--limit", type=int, default=0, help="Maximum candidates to inspect")
    parser.add_argument("--no-progress", action="store_true", help="Disable progress messages on stderr")


def _exit_code(result: ManatalSyncResult, *, pending: bool) -> int:
    if not result.failures:
        return 0
    if pending and (result.synced_resumes > 0 or result.queued_candidates > 0 or result.skipped_candidates > 0):
        return 0
    return 2


@command_registry.command(
    "manatal-sync",
    help="Fetch unsynced candidate resumes from Manatal and ingest them",
    configure=_configure_manatal_sync,
)
def run_manatal_sync(args: argparse.Namespace, config: WorkerConfig) -> int:
    if args.lookback_hours is not None:
        config = replace(config, manatal_lookback_hours=args.lookback_hours)
    config = replace(config, tenant_id=resolve_configured_tenant_id(args, config))
    result = ManatalSync(config).sync(
        updated_since=args.updated_since,
        candidate_ids=args.candidate_ids or [],
        pending=args.pending,
        queue_only=args.queue_only,
        limit=args.limit,
        sync_to_supabase=not args.no_sync,
        uploaded_by=args.uploaded_by,
        progress=progress_printer(args.no_progress),
    )
    emit_json(
        {
            "fetched_candidates": result.fetched_candidates,
            "queued_candidates": result.queued_candidates,
            "skipped_candidates": result.skipped_candidates,
            "downloaded_resumes": result.downloaded_resumes,
            "synced_resumes": result.synced_resumes,
            "failures": result.failures,
            "ingestion": None
            if result.ingestion_result is None
            else {
                "ingestion_run_id": result.ingestion_result.ingestion_run_id,
                "discovered": result.ingestion_result.total_discovered,
                "processed": len(result.ingestion_result.bundles),
                "warnings": result.ingestion_result.warnings,
                "sync_stats": result.ingestion_result.sync_stats,
            },
        },
        pretty=args.pretty,
    )
    return _exit_code(result, pending=args.pending)


def _configure_originals_backfill(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--bucket", default="", help="Target GCS bucket name")
    parser.add_argument("--limit", type=int, default=0, help="Maximum source documents to inspect")
    parser.add_argument("--page-size", type=int, default=100, help="Supabase rows to scan per page")
    parser.add_argument("--offset", type=int, default=0, help="Initial Supabase offset")
    parser.add_argument("--apply", action="store_true", help="Upload files and update source_documents")
    parser.add_argument("--force", action="store_true", help="Reprocess rows that already have storage_path")
    parser.add_argument("--update-source-uri", action="store_true", help="Replace source_uri with gs:// URL after upload")
    parser.add_argument("--no-progress", action="store_true", help="Disable progress messages on stderr")


@command_registry.command(
    "manatal-originals-to-gcs",
    help="Backfill original Manatal resumes into a private GCS bucket",
    configure=_configure_originals_backfill,
)
def run_manatal_originals_to_gcs(args: argparse.Namespace, config: WorkerConfig) -> int:
    config = replace(config, tenant_id=resolve_configured_tenant_id(args, config))
    result = ManatalOriginalsBackfill(config).run(
        bucket=args.bucket or config.gcs_originals_bucket,
        limit=args.limit,
        page_size=args.page_size,
        offset=args.offset,
        apply=args.apply,
        force=args.force,
        update_source_uri=args.update_source_uri,
        progress=progress_printer(args.no_progress),
    )
    emit_json(
        {
            "processed": result.processed,
            "uploaded": result.uploaded,
            "skipped": result.skipped,
            "missing_source": result.missing_source,
            "failed": result.failed,
            "failures": result.failures,
            "dry_run": result.dry_run,
        },
        pretty=args.pretty,
    )
    return 0 if not result.failed else 2
