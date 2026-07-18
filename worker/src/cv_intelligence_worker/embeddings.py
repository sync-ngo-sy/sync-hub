from __future__ import annotations

import math

from .config import WorkerConfig
from .llm import LLMClient
from .schema import ChunkRecord, EmbeddingRecord


def _stable_token_hash(token: str) -> int:
    digest = 2166136261
    for value in token.encode("utf-8"):
        digest ^= value
        digest = (digest * 16777619) & 0xFFFFFFFF
    return digest


class DeterministicEmbedder:
    def __init__(self, dimension: int, version: str) -> None:
        self.dimension = dimension
        self.version = version

    def embed_text(self, text: str) -> list[float]:
        vector = [0.0] * self.dimension
        for token in text.lower().split():
            digest = _stable_token_hash(token)
            index = digest % self.dimension
            sign = 1.0 if ((digest >> 1) & 1) == 0 else -1.0
            weight = 1.0 / max(1, len(token))
            vector[index] += sign * weight
        norm = math.sqrt(sum(value * value for value in vector)) or 1.0
        return [round(value / norm, 8) for value in vector]

    def embed_chunks(self, chunks: list[ChunkRecord]) -> list[EmbeddingRecord]:
        records: list[EmbeddingRecord] = []
        for chunk in chunks:
            records.append(
                EmbeddingRecord(
                    tenant_id=chunk.tenant_id,
                    candidate_id=chunk.candidate_id,
                    chunk_id=chunk.chunk_id,
                    embedding=self.embed_text(chunk.text),
                    embedding_version=self.version,
                    provider="deterministic",
                )
            )
        return records


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


def build_embedder(config: WorkerConfig):
    if config.embedding_provider.lower() in {"openai", "local-openai", "ollama", "ollama-openai"}:
        return SDKEmbedder(config)
    return DeterministicEmbedder(config.embedding_dimension, config.embedding_version)
