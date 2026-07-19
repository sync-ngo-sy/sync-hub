from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from pathlib import Path
from typing import Callable
from uuid import uuid4

from ..artifacts import ArtifactGenerator, LLMArtifactGenerator, LocalArtifactStore, comparison_key
from ..candidate_extraction import extract_candidate_profile
from ..config import WorkerConfig
from ..documents import discover_documents, parse_document
from ..ingestion import SyncBatcher, build_processing_run
from ..integrations.supabase import SupabaseClient
from ..domain.models import ArtifactBundle, CandidateProfile, DocumentSource, DocumentText, candidate_profile_from_dict
from ..core.errors import format_error_message
from ..vectorization import Embedder, build_chunks, build_embedder


@dataclass(frozen=True)
class IngestionResult:
    ingestion_run_id: str
    total_discovered: int
    bundles: list[ArtifactBundle]
    failures: list[dict[str, str]]
    warnings: list[str]
    sync_stats: dict[str, int]


class IngestionPipeline:
    def __init__(
        self,
        config: WorkerConfig,
        *,
        embedder: Embedder | None = None,
        artifact_generator: ArtifactGenerator | None = None,
    ) -> None:
        self.config = config
        self.embedder = embedder or build_embedder(config)
        self.artifact_generator = artifact_generator or LLMArtifactGenerator(config)
        self.store = LocalArtifactStore(config)
        self.supabase = SupabaseClient(config) if config.has_supabase_http_credentials() else None

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
        if source.source_type == "candidate_draft":
            # Draft metadata already contains validated merged edits; reparsing would overwrite them.
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
        summary = self.artifact_generator.summarize(profile, self.config.artifact_version)
        processing_run = build_processing_run(profile, self.config, ingestion_run_id)
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

    def _process_sources(
        self,
        sources: list[DocumentSource],
        ingestion_run_id: str,
        sync_batcher: SyncBatcher,
        bundles: list[ArtifactBundle],
        failures: list[dict[str, str]],
        emit: Callable[[str], None],
    ) -> None:
        with ThreadPoolExecutor(max_workers=self.config.ingest_concurrency) as executor:
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
                if completed % self.config.progress_interval == 0 or completed == len(sources):
                    emit(f"processed {completed}/{len(sources)} documents; completed={len(bundles)} failures={len(failures)}")

    def _refresh_search_cache(
        self,
        sync_to_supabase: bool,
        sync_stats: dict[str, int],
        add_warning: Callable[[str], None],
    ) -> None:
        if not sync_to_supabase or not self.supabase or sync_stats.get("candidates", 0) <= 0:
            return
        try:
            sync_stats["candidate_search_cache_rows"] = self.supabase.refresh_candidate_search_cache()
        except Exception as exc:  # noqa: BLE001
            add_warning(f"Candidate search cache refresh failed after sync: {format_error_message(exc)}")

    def _ingest_discovered_sources(
        self,
        discovered_sources: list[DocumentSource],
        tenant: str,
        sync_to_supabase: bool = True,
        progress: Callable[[str], None] | None = None,
    ) -> IngestionResult:
        ingestion_run_id = str(uuid4())
        bundles: list[ArtifactBundle] = []
        failures: list[dict[str, str]] = []
        warnings: list[str] = []
        sync_stats: dict[str, int] = {}
        total_discovered = len(discovered_sources)
        sources, duplicate_source_count = (
            self._dedupe_sources(discovered_sources) if self.config.dedupe_source_documents else (discovered_sources, 0)
        )
        def emit(message: str) -> None:
            if progress:
                progress(message)

        def add_warning(message: str) -> None:
            if message not in warnings:
                warnings.append(message)
                emit(f"warning: {message}")

        sync_batcher = SyncBatcher(
            config=self.config,
            store=self.store,
            supabase=self.supabase,
            sync_to_supabase=sync_to_supabase,
            add_warning=add_warning,
            failures=failures,
            sync_stats=sync_stats,
            batch_size=self.config.batch_size,
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

        self._process_sources(sources, ingestion_run_id, sync_batcher, bundles, failures, emit)
        sync_batcher.flush()
        self._refresh_search_cache(sync_to_supabase, sync_stats, add_warning)
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
            sync_to_supabase=sync_to_supabase,
            progress=progress,
        )

    def compare_candidates(self, tenant_id: str, candidate_ids: list[str], query: str = "", sync_to_supabase: bool = True):
        profiles = []
        for candidate_id in candidate_ids:
            payload = self.store.load_profile_payload(tenant_id, candidate_id)
            profile = candidate_profile_from_dict(payload["profile"])
            profiles.append(profile)
        artifact = self.artifact_generator.compare(profiles, self.config.artifact_version, query=query)
        artifact_key = comparison_key(tenant_id, candidate_ids, query=query)
        self.store.save_comparison(artifact, artifact_key)
        if sync_to_supabase and self.supabase:
            self.supabase.sync_comparison_artifact(artifact, artifact_key, query=query)
        return artifact_key, artifact
