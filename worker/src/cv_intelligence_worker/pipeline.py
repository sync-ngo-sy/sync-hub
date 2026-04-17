from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable
from uuid import uuid4

from .artifacts import build_summary_artifact, comparison_key, build_comparison_artifact
from .chunking import build_chunks
from .config import WorkerConfig
from .discovery import discover_documents
from .embeddings import build_embedder
from .extraction import extract_candidate_profile
from .parsing import parse_document
from .schema import ArtifactBundle, CandidateProfile, ProcessingRun, candidate_profile_from_dict
from .store import LocalArtifactStore
from .supabase import SupabaseClient
from .utils import sha256_text


@dataclass(frozen=True)
class IngestionResult:
    ingestion_run_id: str
    bundles: list[ArtifactBundle]
    failures: list[dict[str, str]]


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

    def ingest_paths(self, inputs: list[str] | None = None, tenant_id: str | None = None, uploaded_by: str = "", sync_to_supabase: bool = True) -> IngestionResult:
        tenant = tenant_id or self.config.tenant_id
        if not tenant:
            raise ValueError("tenant_id is required via argument or CV_WORKER_TENANT_ID")
        paths = inputs or [self.config.source_dir]
        ingestion_run_id = str(uuid4())
        bundles: list[ArtifactBundle] = []
        failures: list[dict[str, str]] = []
        for source in discover_documents(paths, tenant, ingestion_run_id, uploaded_by=uploaded_by or self.config.uploaded_by):
            try:
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
                self.store.save_bundle(bundle)
                if sync_to_supabase and self.supabase:
                    self.supabase.sync_bundle(bundle)
                bundles.append(bundle)
            except Exception as exc:  # noqa: BLE001
                failures.append({"source_path": source.source_path, "error": str(exc)})
        return IngestionResult(ingestion_run_id=ingestion_run_id, bundles=bundles, failures=failures)

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
