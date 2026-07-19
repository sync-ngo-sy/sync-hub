from __future__ import annotations

from ..config import WorkerConfig
from ..core.identifiers import sha256_text
from ..domain.models import CandidateProfile, ProcessingRun


def build_processing_run(profile: CandidateProfile, config: WorkerConfig, ingestion_run_id: str) -> ProcessingRun:
    input_hash = sha256_text(
        ":".join(
            [
                profile.source_sha256,
                config.parser_version,
                config.model_version,
                config.prompt_version,
                config.chunk_version,
                config.embedding_version,
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
        parser_version=config.parser_version,
        model_version=config.model_version,
        prompt_version=config.prompt_version,
        chunk_version=config.chunk_version,
        embedding_version=config.embedding_version,
        warnings=profile.parse_warnings,
    )
