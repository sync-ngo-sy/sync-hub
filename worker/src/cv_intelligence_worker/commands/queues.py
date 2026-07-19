from __future__ import annotations

import argparse

from ..config import WorkerConfig
from ..domain.models import dataclass_to_dict
from ..workflows import DraftIngestion, PublicApplicationIngestion
from .common import emit_json, progress_printer
from .registry import command_registry


def _configure_public_applications(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--limit", type=int, default=25, help="Maximum queued applications to ingest")
    parser.add_argument(
        "--retry-stale-minutes",
        type=int,
        default=30,
        help="Retry applications left in parsing for at least this many minutes",
    )
    parser.add_argument("--no-progress", action="store_true", help="Disable progress messages on stderr")


@command_registry.command(
    "public-applications",
    help="Drain queued public job application CV uploads and ingest them",
    configure=_configure_public_applications,
)
def run_public_applications(args: argparse.Namespace, config: WorkerConfig) -> int:
    result = PublicApplicationIngestion(config).run(
        limit=args.limit,
        retry_stale_minutes=args.retry_stale_minutes,
        progress=progress_printer(args.no_progress),
    )
    emit_json(dataclass_to_dict(result), pretty=args.pretty)
    return 0 if not result.failed else 2


def _configure_process_drafts(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--limit", type=int, default=25, help="Maximum queued drafts to ingest")
    parser.add_argument(
        "--retry-stale-minutes",
        type=int,
        default=30,
        help="Retry drafts left in parsing for at least this many minutes",
    )
    parser.add_argument("--no-progress", action="store_true", help="Disable progress messages on stderr")


@command_registry.command(
    "process-drafts",
    help="Drain pending_validation candidate registration drafts and ingest them",
    configure=_configure_process_drafts,
)
def run_process_drafts(args: argparse.Namespace, config: WorkerConfig) -> int:
    processed = DraftIngestion(config).run(
        limit=args.limit,
        retry_stale_minutes=args.retry_stale_minutes,
        progress=progress_printer(args.no_progress),
    )
    emit_json({"processed": processed}, pretty=args.pretty)
    return 0
