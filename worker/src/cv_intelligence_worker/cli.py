from __future__ import annotations

import argparse
import json
from typing import Sequence

from .config import WorkerConfig
from .discovery import discover_documents
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

    compare = subparsers.add_parser("compare", help="Build a cached comparison artifact from local bundles", parents=[common])
    compare.add_argument("--candidate-id", dest="candidate_ids", action="append", required=True, help="Candidate ID to include; pass multiple times")
    compare.add_argument("--query", default="", help="Optional job query to evaluate gaps against")

    return parser


def _json_output(payload: object, pretty: bool) -> str:
    if pretty:
        return json.dumps(payload, indent=2, sort_keys=True)
    return json.dumps(payload, separators=(",", ":"), sort_keys=True)


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
        pipeline = IngestionPipeline(config=config)
        result = pipeline.ingest_paths(
            inputs=discovery_inputs,
            tenant_id=tenant_id,
            uploaded_by=args.uploaded_by,
            sync_to_supabase=not args.no_sync,
        )
        payload = {
            "ingestion_run_id": result.ingestion_run_id,
            "processed": len(result.bundles),
            "failures": result.failures,
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

    parser.error(f"unsupported command: {args.command}")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
