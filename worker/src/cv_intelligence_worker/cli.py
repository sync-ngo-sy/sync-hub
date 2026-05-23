from __future__ import annotations

import argparse
import json
import sys
from dataclasses import replace
from typing import Sequence

from .config import WorkerConfig
from .discovery import discover_documents
from .gcs_originals import ManatalOriginalsBackfill
from .manatal import ManatalSync
from .pipeline import IngestionPipeline
from .schema import dataclass_to_dict


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Offline worker for the CV Intelligence Platform")
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("--tenant-id", dest="tenant_id", default="", help="Tenant UUID")
    common.add_argument("--uploaded-by", dest="uploaded_by", default="", help="User identifier for audit metadata")
    common.add_argument("--no-sync", action="store_true", help="Do not push artifacts to Supabase")
    common.add_argument("--pretty", action="store_true", help="Pretty-print JSON output")
    subparsers = parser.add_subparsers(dest="command", required=True)

    discover = subparsers.add_parser("discover", help="List supported documents", parents=[common])
    discover.add_argument("inputs", nargs="*", help="Files or directories to scan")

    ingest = subparsers.add_parser("ingest", help="Parse and ingest CV files", parents=[common])
    ingest.add_argument("inputs", nargs="*", help="Files or directories to scan")
    ingest.add_argument("--concurrency", type=int, default=None, help="Number of documents to process in parallel")
    ingest.add_argument("--sync-batch-size", type=int, default=None, help="Number of completed bundles to sync per Supabase batch")
    ingest.add_argument("--supabase-row-batch-size", type=int, default=None, help="Maximum rows per Supabase upsert request")
    ingest.add_argument("--no-progress", action="store_true", help="Disable progress messages on stderr")

    compare = subparsers.add_parser("compare", help="Build a cached comparison artifact from local bundles", parents=[common])
    compare.add_argument("--candidate-id", dest="candidate_ids", action="append", required=True, help="Candidate ID to include; pass multiple times")
    compare.add_argument("--query", default="", help="Optional job query to evaluate gaps against")

    manatal = subparsers.add_parser("manatal-sync", help="Fetch unsynced candidate resumes from Manatal and ingest them", parents=[common])
    manatal.add_argument("--updated-since", default="", help="Fetch candidates updated at or after this ISO timestamp")
    manatal.add_argument("--lookback-hours", type=int, default=None, help="Fallback lookback window when --updated-since and --candidate-id are omitted")
    manatal.add_argument("--candidate-id", dest="candidate_ids", action="append", help="Specific Manatal candidate ID to sync; pass multiple times")
    manatal.add_argument("--pending", action="store_true", help="Sync candidate IDs queued by the Manatal webhook receiver")
    manatal.add_argument("--queue-only", action="store_true", help="Queue matching Manatal candidate IDs without downloading or parsing resumes")
    manatal.add_argument("--limit", type=int, default=0, help="Maximum candidates to inspect")
    manatal.add_argument("--no-progress", action="store_true", help="Disable progress messages on stderr")

    gcs_originals = subparsers.add_parser(
        "manatal-originals-to-gcs",
        help="Backfill original Manatal resumes into a private GCS bucket",
        parents=[common],
    )
    gcs_originals.add_argument("--bucket", default="", help="Target GCS bucket name")
    gcs_originals.add_argument("--limit", type=int, default=0, help="Maximum source documents to inspect")
    gcs_originals.add_argument("--page-size", type=int, default=100, help="Supabase rows to scan per page")
    gcs_originals.add_argument("--offset", type=int, default=0, help="Initial Supabase offset")
    gcs_originals.add_argument("--apply", action="store_true", help="Upload files and update source_documents")
    gcs_originals.add_argument("--force", action="store_true", help="Reprocess rows that already have storage_path")
    gcs_originals.add_argument("--update-source-uri", action="store_true", help="Replace source_uri with gs:// URL after upload")
    gcs_originals.add_argument("--no-progress", action="store_true", help="Disable progress messages on stderr")

    return parser


def _json_output(payload: object, pretty: bool) -> str:
    if pretty:
        return json.dumps(payload, indent=2, sort_keys=True)
    return json.dumps(payload, separators=(",", ":"), sort_keys=True)


def _config_with_ingest_overrides(config: WorkerConfig, args: argparse.Namespace) -> WorkerConfig:
    updates = {}
    if args.concurrency is not None:
        updates["ingest_concurrency"] = args.concurrency
    if args.sync_batch_size is not None:
        updates["batch_size"] = args.sync_batch_size
    if args.supabase_row_batch_size is not None:
        updates["supabase_batch_size"] = args.supabase_row_batch_size
    return replace(config, **updates) if updates else config


def main(argv: Sequence[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    config = WorkerConfig.from_env()
    tenant_id = args.tenant_id or config.tenant_id or config.device_id or "tenant-local"
    discovery_inputs = list(args.inputs) if hasattr(args, "inputs") and args.inputs else [config.source_dir]

    if args.command == "discover":
        sources = discover_documents(
            discovery_inputs,
            tenant_id=tenant_id,
            ingestion_run_id=f"discover-{tenant_id}",
            uploaded_by=args.uploaded_by,
        )
        print(_json_output([dataclass_to_dict(source) for source in sources], pretty=args.pretty))
        return 0

    if args.command == "ingest":
        config = _config_with_ingest_overrides(config, args)
        pipeline = IngestionPipeline(config=config)
        progress = None if args.no_progress else (lambda message: print(message, file=sys.stderr, flush=True))
        result = pipeline.ingest_paths(
            inputs=discovery_inputs,
            tenant_id=tenant_id,
            uploaded_by=args.uploaded_by,
            sync_to_supabase=not args.no_sync,
            progress=progress,
        )
        payload = {
            "ingestion_run_id": result.ingestion_run_id,
            "discovered": result.total_discovered,
            "processed": len(result.bundles),
            "failures": result.failures,
            "warnings": result.warnings,
            "sync_stats": result.sync_stats,
            "candidate_ids": [bundle.profile.candidate_id for bundle in result.bundles],
        }
        print(_json_output(payload, pretty=args.pretty))
        return 0 if not result.failures else 2

    if args.command == "compare":
        pipeline = IngestionPipeline(config=config)
        artifact_key, artifact = pipeline.compare_candidates(
            tenant_id=tenant_id,
            candidate_ids=args.candidate_ids,
            query=args.query,
            sync_to_supabase=not args.no_sync,
        )
        payload = {
            "artifact_key": artifact_key,
            "comparison": dataclass_to_dict(artifact),
        }
        print(_json_output(payload, pretty=args.pretty))
        return 0

    if args.command == "manatal-sync":
        if args.lookback_hours is not None:
            config = replace(config, manatal_lookback_hours=args.lookback_hours)
        tenant_id = args.tenant_id or config.tenant_id
        config = replace(config, tenant_id=tenant_id)
        progress = None if args.no_progress else (lambda message: print(message, file=sys.stderr, flush=True))
        result = ManatalSync(config).sync(
            updated_since=args.updated_since,
            candidate_ids=args.candidate_ids or [],
            pending=args.pending,
            queue_only=args.queue_only,
            limit=args.limit,
            sync_to_supabase=not args.no_sync,
            uploaded_by=args.uploaded_by,
            progress=progress,
        )
        payload = {
            "fetched_candidates": result.fetched_candidates,
            "queued_candidates": result.queued_candidates,
            "skipped_candidates": result.skipped_candidates,
            "downloaded_resumes": result.downloaded_resumes,
            "synced_resumes": result.synced_resumes,
            "failures": result.failures,
            "ingestion": None if result.ingestion_result is None else {
                "ingestion_run_id": result.ingestion_result.ingestion_run_id,
                "discovered": result.ingestion_result.total_discovered,
                "processed": len(result.ingestion_result.bundles),
                "warnings": result.ingestion_result.warnings,
                "sync_stats": result.ingestion_result.sync_stats,
            },
        }
        print(_json_output(payload, pretty=args.pretty))
        return 0 if not result.failures else 2

    if args.command == "manatal-originals-to-gcs":
        tenant_id = args.tenant_id or config.tenant_id
        config = replace(config, tenant_id=tenant_id)
        progress = None if args.no_progress else (lambda message: print(message, file=sys.stderr, flush=True))
        result = ManatalOriginalsBackfill(config).run(
            bucket=args.bucket or config.gcs_originals_bucket,
            limit=args.limit,
            page_size=args.page_size,
            offset=args.offset,
            apply=args.apply,
            force=args.force,
            update_source_uri=args.update_source_uri,
            progress=progress,
        )
        payload = {
            "processed": result.processed,
            "uploaded": result.uploaded,
            "skipped": result.skipped,
            "missing_source": result.missing_source,
            "failed": result.failed,
            "failures": result.failures,
            "dry_run": result.dry_run,
        }
        print(_json_output(payload, pretty=args.pretty))
        return 0 if not result.failed else 2

    parser.error(f"unsupported command: {args.command}")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
