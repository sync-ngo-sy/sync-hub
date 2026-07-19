from __future__ import annotations

import argparse

from ..config import WorkerConfig
from ..documents import discover_documents
from ..domain.models import dataclass_to_dict
from ..workflows import IngestionPipeline
from .common import emit_json, progress_printer, resolve_discovery_inputs, resolve_tenant_id, with_ingest_overrides
from .registry import command_registry


def _configure_discover(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("inputs", nargs="*", help="Files or directories to scan")


@command_registry.command("discover", help="List supported documents", configure=_configure_discover)
def run_discover(args: argparse.Namespace, config: WorkerConfig) -> int:
    tenant_id = resolve_tenant_id(args, config)
    sources = discover_documents(
        resolve_discovery_inputs(args, config),
        tenant_id=tenant_id,
        ingestion_run_id=f"discover-{tenant_id}",
        uploaded_by=args.uploaded_by,
    )
    emit_json([dataclass_to_dict(source) for source in sources], pretty=args.pretty)
    return 0


def _configure_ingest(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("inputs", nargs="*", help="Files or directories to scan")
    parser.add_argument("--concurrency", type=int, default=None, help="Number of documents to process in parallel")
    parser.add_argument("--sync-batch-size", type=int, default=None, help="Number of completed bundles to sync per Supabase batch")
    parser.add_argument("--supabase-row-batch-size", type=int, default=None, help="Maximum rows per Supabase upsert request")
    parser.add_argument("--no-progress", action="store_true", help="Disable progress messages on stderr")


@command_registry.command("ingest", help="Parse and ingest CV files", configure=_configure_ingest)
def run_ingest(args: argparse.Namespace, config: WorkerConfig) -> int:
    tenant_id = resolve_tenant_id(args, config)
    pipeline = IngestionPipeline(config=with_ingest_overrides(config, args))
    result = pipeline.ingest_paths(
        inputs=resolve_discovery_inputs(args, config),
        tenant_id=tenant_id,
        uploaded_by=args.uploaded_by,
        sync_to_supabase=not args.no_sync,
        progress=progress_printer(args.no_progress),
    )
    emit_json(
        {
            "ingestion_run_id": result.ingestion_run_id,
            "discovered": result.total_discovered,
            "processed": len(result.bundles),
            "failures": result.failures,
            "warnings": result.warnings,
            "sync_stats": result.sync_stats,
            "candidate_ids": [bundle.profile.candidate_id for bundle in result.bundles],
        },
        pretty=args.pretty,
    )
    return 0 if not result.failures else 2


def _configure_compare(parser: argparse.ArgumentParser) -> None:
    parser.add_argument(
        "--candidate-id",
        dest="candidate_ids",
        action="append",
        required=True,
        help="Candidate ID to include; pass multiple times",
    )
    parser.add_argument("--query", default="", help="Optional job query to evaluate gaps against")


@command_registry.command(
    "compare",
    help="Build a cached comparison artifact from local bundles",
    configure=_configure_compare,
)
def run_compare(args: argparse.Namespace, config: WorkerConfig) -> int:
    artifact_key, artifact = IngestionPipeline(config=config).compare_candidates(
        tenant_id=resolve_tenant_id(args, config),
        candidate_ids=args.candidate_ids,
        query=args.query,
        sync_to_supabase=not args.no_sync,
    )
    emit_json(
        {"artifact_key": artifact_key, "comparison": dataclass_to_dict(artifact)},
        pretty=args.pretty,
    )
    return 0
