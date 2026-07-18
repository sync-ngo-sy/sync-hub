from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable
from uuid import uuid4

from .artifacts import build_summary_artifact, comparison_key, build_comparison_artifact
from .chunking import build_chunks
from .config import WorkerConfig
from .discovery import discover_documents
from .embeddings import build_embedder
from .extraction import extract_candidate_profile
from .parsing import parse_document
from .schema import ArtifactBundle, CandidateProfile, DocumentSource, ProcessingRun, candidate_profile_from_dict
from .store import LocalArtifactStore
from .supabase import SupabaseClient
from .utils import format_error_message, sha256_text


@dataclass(frozen=True)
class IngestionResult:
    ingestion_run_id: str
    total_discovered: int
    bundles: list[ArtifactBundle]
    failures: list[dict[str, str]]
    warnings: list[str]
    sync_stats: dict[str, int]


@dataclass
class _SyncBatcher:
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
                self.sync_stats["estimated_database_bytes"] * max(1.0, self.config.supabase_database_expansion_factor)
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


class IngestionPipeline:
    def __init__(self, config: WorkerConfig) -> None:
        self.config = config
        self.embedder = build_embedder(config)
        self.store = LocalArtifactStore(config)
        self.supabase = SupabaseClient(config) if config.has_supabase_http_credentials() else None

    def _processing_run(self, profile: CandidateProfile, ingestion_run_id: str) -> ProcessingRun:
        input_hash = sha256_text(
            ":".join(
                [
                    profile.source_sha256,
                    self.config.parser_version,
                    self.config.model_version,
                    self.config.prompt_version,
                    self.config.chunk_version,
                    self.config.embedding_version,
                ]
            )
        )
        return ProcessingRun(
            tenant_id=profile.tenant_id,
            ingestion_run_id=ingestion_run_id,
            status="completed",
            input_hash=input_hash,
            source_path=profile.metadata.get("source_path", ""),
            source_sha256=profile.source_sha256,
            parser_version=self.config.parser_version,
            model_version=self.config.model_version,
            prompt_version=self.config.prompt_version,
            chunk_version=self.config.chunk_version,
            embedding_version=self.config.embedding_version,
            warnings=profile.parse_warnings,
        )

    def _dedupe_sources(self, sources: list[DocumentSource]) -> tuple[list[DocumentSource], int]:
        unique_sources: list[DocumentSource] = []
        seen_hashes: set[str] = set()
        duplicate_count = 0
        for source in sources:
            if source.document_sha256 in seen_hashes:
                duplicate_count += 1
                continue
            seen_hashes.add(source.document_sha256)
            unique_sources.append(source)
        return unique_sources, duplicate_count

    def _build_bundle(self, source, ingestion_run_id: str) -> tuple[ArtifactBundle, Path]:
        # Bug#4 fix: candidate_draft sources carry pre-validated merged JSON in
        # their metadata. Calling parse_document would re-read the *original* CV
        # text, and a subsequent LLM extraction call would silently overwrite the
        # user edits that already passed AI validation. Use an empty DocumentText
        # placeholder instead so extract_candidate_profile routes to the fast
        # is_draft branch without any OCR/text-parsing overhead.
        if source.source_type == "candidate_draft":
            from .parsing import DocumentText
            document_text = DocumentText(source=source, raw_text="", parser_name="draft_skip", parser_version=self.config.parser_version)
        else:
            document_text = parse_document(source)
        profile = extract_candidate_profile(source, document_text, self.config)
        profile = CandidateProfile(
            **{
                **profile.__dict__,
                "metadata": {**profile.metadata, "source_path": source.source_path},
            }
        )
        chunks = build_chunks(profile, self.config.chunk_version)
        embeddings = self.embedder.embed_chunks(chunks)
        summary = build_summary_artifact(profile, self.config.artifact_version)
        processing_run = self._processing_run(profile, ingestion_run_id)
        bundle = ArtifactBundle(
            source=source,
            document_text=document_text,
            profile=profile,
            chunks=chunks,
            embeddings=embeddings,
            summary=summary,
            processing_run=processing_run,
        )
        bundle_path = self.store.save_bundle(bundle)
        return bundle, bundle_path

    def _ingest_discovered_sources(
        self,
        discovered_sources: list[DocumentSource],
        tenant: str,
        uploaded_by: str = "",
        sync_to_supabase: bool = True,
        progress: Callable[[str], None] | None = None,
    ) -> IngestionResult:
        ingestion_run_id = str(uuid4())
        bundles: list[ArtifactBundle] = []
        failures: list[dict[str, str]] = []
        warnings: list[str] = []
        sync_stats: dict[str, int] = {}
        total_discovered = len(discovered_sources)
        sources, duplicate_source_count = self._dedupe_sources(discovered_sources) if self.config.dedupe_source_documents else (discovered_sources, 0)
        total_to_process = len(sources)
        concurrency = max(1, self.config.ingest_concurrency)
        sync_bundle_batch_size = max(1, self.config.batch_size)
        progress_interval = max(1, self.config.progress_interval)

        def emit(message: str) -> None:
            if progress:
                progress(message)

        def add_warning(message: str) -> None:
            if message not in warnings:
                warnings.append(message)
                emit(f"warning: {message}")

        sync_batcher = _SyncBatcher(
            config=self.config,
            store=self.store,
            supabase=self.supabase,
            sync_to_supabase=sync_to_supabase,
            add_warning=add_warning,
            failures=failures,
            sync_stats=sync_stats,
            batch_size=sync_bundle_batch_size,
        )

        emit(f"discovered {total_discovered} documents for tenant {tenant}")
        if duplicate_source_count:
            sync_stats["duplicate_source_files_skipped"] = duplicate_source_count
            emit(f"skipping {duplicate_source_count} duplicate source files by SHA-256; unique documents={len(sources)}")
        if not sources:
            return IngestionResult(
                ingestion_run_id=ingestion_run_id,
                total_discovered=total_discovered,
                bundles=[],
                failures=[],
                warnings=warnings,
                sync_stats=sync_stats,
            )

        with ThreadPoolExecutor(max_workers=concurrency) as executor:
            future_by_source = {executor.submit(self._build_bundle, source, ingestion_run_id): source for source in sources}
            for completed, future in enumerate(as_completed(future_by_source), start=1):
                source = future_by_source[future]
                try:
                    bundle, bundle_path = future.result()
                except Exception as exc:  # noqa: BLE001
                    failures.append({"source_path": source.source_path, "error": format_error_message(exc)})
                else:
                    bundles.append(bundle)
                    sync_batcher.add(bundle, bundle_path)
                if completed % progress_interval == 0 or completed == total_to_process:
                    emit(f"processed {completed}/{total_to_process} documents; completed={len(bundles)} failures={len(failures)}")

        sync_batcher.flush()
        if sync_to_supabase and self.supabase and sync_stats.get("candidates", 0) > 0:
            try:
                sync_stats["candidate_search_cache_rows"] = self.supabase.refresh_candidate_search_cache()
            except Exception as exc:  # noqa: BLE001
                add_warning(f"Candidate search cache refresh failed after sync: {format_error_message(exc)}")
        return IngestionResult(
            ingestion_run_id=ingestion_run_id,
            total_discovered=total_discovered,
            bundles=bundles,
            failures=failures,
            warnings=warnings,
            sync_stats=sync_stats,
        )

    def ingest_sources(
        self,
        sources: list[DocumentSource],
        tenant_id: str | None = None,
        uploaded_by: str = "",
        sync_to_supabase: bool = True,
        progress: Callable[[str], None] | None = None,
    ) -> IngestionResult:
        tenant = tenant_id or self.config.tenant_id
        if not tenant:
            raise ValueError("tenant_id is required via argument or CV_WORKER_TENANT_ID")
        return self._ingest_discovered_sources(
            sources,
            tenant,
            uploaded_by=uploaded_by,
            sync_to_supabase=sync_to_supabase,
            progress=progress,
        )

    def ingest_paths(
        self,
        inputs: list[str] | None = None,
        tenant_id: str | None = None,
        uploaded_by: str = "",
        sync_to_supabase: bool = True,
        progress: Callable[[str], None] | None = None,
    ) -> IngestionResult:
        tenant = tenant_id or self.config.tenant_id
        if not tenant:
            raise ValueError("tenant_id is required via argument or CV_WORKER_TENANT_ID")
        paths = inputs or [self.config.source_dir]
        ingestion_run_id = str(uuid4())
        discovered_sources = discover_documents(paths, tenant, ingestion_run_id, uploaded_by=uploaded_by or self.config.uploaded_by)
        return self._ingest_discovered_sources(
            discovered_sources,
            tenant,
            uploaded_by=uploaded_by,
            sync_to_supabase=sync_to_supabase,
            progress=progress,
        )

    def compare_candidates(self, tenant_id: str, candidate_ids: list[str], query: str = "", sync_to_supabase: bool = True):
        profiles = []
        for candidate_id in candidate_ids:
            payload = self.store.load_profile_payload(tenant_id, candidate_id)
            profile = candidate_profile_from_dict(payload["profile"])
            profiles.append(profile)
        artifact = build_comparison_artifact(profiles, self.config.artifact_version, query=query)
        artifact_key = comparison_key(tenant_id, candidate_ids, query=query)
        self.store.save_comparison(artifact, artifact_key)
        if sync_to_supabase and self.supabase:
            self.supabase.sync_comparison_artifact(artifact, artifact_key, query=query)
        return artifact_key, artifact
