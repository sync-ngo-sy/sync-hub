from __future__ import annotations

from typing import Protocol

from .config import WorkerConfig
from .llm import LLMClient
from .schema import ChunkRecord, EmbeddingRecord

SUPPORTED_EMBEDDING_PROVIDERS = frozenset({"openai", "openai-compatible", "local-openai", "ollama", "ollama-openai"})


class Embedder(Protocol):
    def embed_chunks(self, chunks: list[ChunkRecord]) -> list[EmbeddingRecord]: ...


class SDKEmbedder:
    def __init__(self, config: WorkerConfig, *, client: LLMClient | None = None) -> None:
        self.config = config
        provider = "ollama" if config.embedding_provider.lower().startswith("ollama") else config.embedding_provider
        self.client = client or LLMClient(config, provider=provider)

    def embed_chunks(self, chunks: list[ChunkRecord]) -> list[EmbeddingRecord]:
        if not chunks:
            return []
        dimensions = None
        if self.config.embedding_model.startswith("gemini-embedding-") and self.config.embedding_dimension > 0:
            dimensions = self.config.embedding_dimension
        vectors = self.client.embed(
            model=self.config.embedding_model,
            inputs=[chunk.text for chunk in chunks],
            dimensions=dimensions,
            expected_dimension=self.config.embedding_dimension if self.config.embedding_dimension > 0 else None,
        )
        return [
            EmbeddingRecord(
                tenant_id=chunk.tenant_id,
                candidate_id=chunk.candidate_id,
                chunk_id=chunk.chunk_id,
                embedding=vectors[index],
                embedding_version=self.config.embedding_version,
                provider=self.config.embedding_provider,
            )
            for index, chunk in enumerate(chunks)
        ]


def build_embedder(config: WorkerConfig) -> SDKEmbedder:
    provider = config.embedding_provider.lower()
    if provider not in SUPPORTED_EMBEDDING_PROVIDERS:
        raise ValueError(f"unsupported embedding provider: {config.embedding_provider}")
    if not config.embedding_model:
        raise RuntimeError("embedding model is not configured")
    return SDKEmbedder(config)
