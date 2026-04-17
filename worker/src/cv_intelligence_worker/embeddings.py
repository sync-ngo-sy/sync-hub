from __future__ import annotations

import json
import math
import urllib.request

from .config import WorkerConfig
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


class OpenAICompatibleEmbedder:
    def __init__(self, config: WorkerConfig) -> None:
        self.config = config

    def embed_chunks(self, chunks: list[ChunkRecord]) -> list[EmbeddingRecord]:
        payload = {
            "model": self.config.embedding_model,
            "input": [chunk.text for chunk in chunks],
        }
        request = urllib.request.Request(
            f"{self.config.model_base_url.rstrip('/')}/embeddings",
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self.config.model_api_key}",
            },
            method="POST",
        )
        with urllib.request.urlopen(request, timeout=self.config.request_timeout_seconds) as response:
            body = json.loads(response.read().decode("utf-8"))
        data = body.get("data", [])
        records: list[EmbeddingRecord] = []
        for chunk, item in zip(chunks, data):
            records.append(
                EmbeddingRecord(
                    tenant_id=chunk.tenant_id,
                    candidate_id=chunk.candidate_id,
                    chunk_id=chunk.chunk_id,
                    embedding=item["embedding"],
                    embedding_version=self.config.embedding_version,
                    provider=self.config.embedding_provider,
                )
            )
        return records


class OllamaEmbedder:
    def __init__(self, config: WorkerConfig) -> None:
        self.config = config

    def _base_url(self) -> str:
        return self.config.model_base_url.rstrip("/").removesuffix("/v1")

    def embed_chunks(self, chunks: list[ChunkRecord]) -> list[EmbeddingRecord]:
        payload = {
            "model": self.config.embedding_model,
            "input": [chunk.text for chunk in chunks],
        }
        request = urllib.request.Request(
            f"{self._base_url()}/api/embed",
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
            },
            method="POST",
        )
        with urllib.request.urlopen(request, timeout=self.config.request_timeout_seconds) as response:
            body = json.loads(response.read().decode("utf-8"))
        vectors = body.get("embeddings", [])
        records: list[EmbeddingRecord] = []
        for chunk, vector in zip(chunks, vectors):
            records.append(
                EmbeddingRecord(
                    tenant_id=chunk.tenant_id,
                    candidate_id=chunk.candidate_id,
                    chunk_id=chunk.chunk_id,
                    embedding=vector,
                    embedding_version=self.config.embedding_version,
                    provider=self.config.embedding_provider,
                )
            )
        return records


def build_embedder(config: WorkerConfig):
    if config.embedding_provider.lower() in {"openai", "local-openai", "ollama-openai"}:
        return OpenAICompatibleEmbedder(config)
    if config.embedding_provider.lower() == "ollama":
        return OllamaEmbedder(config)
    return DeterministicEmbedder(config.embedding_dimension, config.embedding_version)
