from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

from .config import WorkerConfig
from .schema import ArtifactBundle, ComparisonArtifact, dataclass_to_dict
from .utils import slugify, stable_uuid


def _vector_literal(values: list[float]) -> str:
    return "[" + ",".join(f"{value:.8f}" for value in values) + "]"


class SupabaseClient:
    def __init__(self, config: WorkerConfig) -> None:
        self.config = config
        self.base_url = config.supabase_url.rstrip("/")

    def _headers(self, extra: dict[str, str] | None = None) -> dict[str, str]:
        headers = {
            "Authorization": f"Bearer {self.config.auth_token()}",
            "apikey": self.config.auth_token() or self.config.supabase_anon_key,
            "Content-Type": "application/json",
            "User-Agent": self.config.user_agent,
        }
        if extra:
            headers.update(extra)
        return headers

    def _request(self, method: str, path: str, *, data: Any | None = None, headers: dict[str, str] | None = None) -> Any:
        body = None
        if data is not None:
            body = json.dumps(data).encode("utf-8")
        request = urllib.request.Request(
            f"{self.base_url}{path}",
            data=body,
            headers=self._headers(headers),
            method=method,
        )
        with urllib.request.urlopen(request, timeout=self.config.request_timeout_seconds) as response:
            content = response.read().decode("utf-8")
        return json.loads(content) if content else None

    def upsert(self, table: str, rows: list[dict[str, Any]], on_conflict: str) -> Any:
        query = urllib.parse.urlencode({"on_conflict": on_conflict})
        return self._request(
            "POST",
            f"/rest/v1/{table}?{query}",
            data=rows,
            headers={"Prefer": "resolution=merge-duplicates,return=minimal"},
        )

    def upload_file(self, bucket: str, object_path: str, file_path: str, content_type: str) -> None:
        data = Path(file_path).read_bytes()
        headers = {
            "Authorization": f"Bearer {self.config.auth_token()}",
            "apikey": self.config.auth_token() or self.config.supabase_anon_key,
            "Content-Type": content_type,
            "x-upsert": "true",
        }
        request = urllib.request.Request(
            f"{self.base_url}/storage/v1/object/{bucket}/{urllib.parse.quote(object_path)}",
            data=data,
            headers=headers,
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=self.config.request_timeout_seconds):
                return
        except urllib.error.HTTPError as exc:
            if exc.code == 409:
                return
            raise

    def sync_bundle(self, bundle: ArtifactBundle) -> None:
        source_storage_path = f"{bundle.source.tenant_id}/{bundle.source.document_id}/{bundle.source.original_filename}"
        self.upload_file(
            self.config.supabase_storage_bucket,
            source_storage_path,
            bundle.source.source_path,
            bundle.source.mime_type,
        )

        source_document = {
            "id": bundle.source.document_id,
            "tenant_id": bundle.source.tenant_id,
            "candidate_id": bundle.profile.candidate_id,
            "source_type": bundle.source.source_type,
            "original_filename": bundle.source.original_filename,
            "mime_type": bundle.source.mime_type,
            "document_sha256": bundle.source.document_sha256,
            "source_uri": bundle.source.source_path,
            "storage_path": source_storage_path,
            "uploaded_by": bundle.source.uploaded_by,
            "metadata_json": dataclass_to_dict(bundle.source.metadata),
        }
        candidate = {
            "id": bundle.profile.candidate_id,
            "tenant_id": bundle.profile.tenant_id,
            "name": bundle.profile.name,
            "headline": bundle.profile.headline,
            "current_title": bundle.profile.current_title,
            "location": bundle.profile.location,
            "years_experience": bundle.profile.years_experience,
            "seniority": bundle.profile.seniority,
            "primary_role": bundle.profile.role_tags[0] if bundle.profile.role_tags else None,
            "top_skills": bundle.profile.skills,
            "email": bundle.profile.email,
            "phone": bundle.profile.phone,
            "links": bundle.profile.links,
            "latest_document_id": bundle.source.document_id,
            "summary_short": bundle.summary.short_summary,
            "status": "completed",
            "metadata_json": bundle.profile.metadata,
            "parse_version": bundle.document_text.parser_version,
            "normalization_version": bundle.processing_run.chunk_version,
            "embedding_version": bundle.processing_run.embedding_version,
            "artifact_version": bundle.summary.artifact_version,
        }
        profile = {
            "candidate_id": bundle.profile.candidate_id,
            "tenant_id": bundle.profile.tenant_id,
            "source_document_id": bundle.source.document_id,
            "profile_json": dataclass_to_dict(bundle.profile),
            "timeline_json": dataclass_to_dict(bundle.profile.experience),
            "skill_matrix_json": {
                "skills": [{"skill": skill, "aliases": bundle.profile.skill_aliases.get(skill, []), "confidence": bundle.profile.confidence} for skill in bundle.profile.skills]
            },
            "raw_text": bundle.document_text.raw_text,
            "confidence": bundle.profile.confidence,
            "missing_fields": bundle.profile.missing_fields,
            "parse_warnings": bundle.profile.parse_warnings,
        }
        summary = {
            "candidate_id": bundle.profile.candidate_id,
            "tenant_id": bundle.profile.tenant_id,
            "short_summary": bundle.summary.short_summary,
            "long_summary": bundle.summary.long_summary,
            "strengths": bundle.summary.strengths,
            "risks": bundle.summary.risks,
            "recommended_roles": bundle.summary.recommended_roles,
            "evidence_refs": bundle.summary.evidence_refs,
            "confidence": bundle.summary.confidence,
            "artifact_version": bundle.summary.artifact_version,
        }
        skill_rows = [
            {
                "id": stable_uuid(bundle.profile.tenant_id, bundle.profile.candidate_id, skill),
                "tenant_id": bundle.profile.tenant_id,
                "candidate_id": bundle.profile.candidate_id,
                "skill_slug": slugify(skill),
                "canonical_skill": skill,
                "evidence": {"aliases": bundle.profile.skill_aliases.get(skill, [])},
            }
            for skill in bundle.profile.skills
        ]
        chunk_rows = []
        for chunk, embedding in zip(bundle.chunks, bundle.embeddings):
            chunk_rows.append(
                {
                    "id": chunk.chunk_id,
                    "tenant_id": chunk.tenant_id,
                    "candidate_id": chunk.candidate_id,
                    "source_document_id": bundle.source.document_id,
                    "chunk_type": chunk.chunk_type,
                    "section_name": chunk.section_name,
                    "chunk_index": chunk.chunk_index,
                    "text": chunk.text,
                    "token_count": chunk.token_count,
                    "source_span": chunk.source_span,
                    "metadata_json": chunk.metadata,
                    "embedding": _vector_literal(embedding.embedding),
                    "embedding_version": embedding.embedding_version,
                    "parse_version": bundle.document_text.parser_version,
                    "normalization_version": bundle.processing_run.chunk_version,
                    "source_hash": bundle.source.document_sha256,
                    "is_active": chunk.is_active,
                }
            )
        processing_run = {
            "id": stable_uuid(bundle.processing_run.tenant_id, bundle.processing_run.ingestion_run_id, bundle.source.document_id),
            "tenant_id": bundle.processing_run.tenant_id,
            "candidate_id": bundle.profile.candidate_id,
            "source_document_id": bundle.source.document_id,
            "ingestion_run_id": bundle.processing_run.ingestion_run_id,
            "status": bundle.processing_run.status,
            "input_hash": bundle.processing_run.input_hash,
            "source_path": bundle.processing_run.source_path,
            "source_sha256": bundle.processing_run.source_sha256,
            "parser_version": bundle.processing_run.parser_version,
            "model_version": bundle.processing_run.model_version,
            "prompt_version": bundle.processing_run.prompt_version,
            "chunk_version": bundle.processing_run.chunk_version,
            "embedding_version": bundle.processing_run.embedding_version,
            "warnings": bundle.processing_run.warnings,
            "error_code": bundle.processing_run.error_code,
            "error_message": bundle.processing_run.error_message,
            "metadata_json": bundle.processing_run.metadata,
        }
        self.upsert("source_documents", [source_document], "tenant_id,document_sha256")
        self.upsert("candidates", [candidate], "id")
        self.upsert("candidate_profiles", [profile], "candidate_id")
        self.upsert("candidate_summaries", [summary], "candidate_id")
        if skill_rows:
            self.upsert("candidate_skill_map", skill_rows, "id")
        if chunk_rows:
            self.upsert("candidate_chunks", chunk_rows, "id")
        self.upsert("processing_runs", [processing_run], "tenant_id,input_hash")

    def sync_comparison_artifact(self, artifact: ComparisonArtifact, artifact_key: str, query: str = "") -> None:
        query_fingerprint = f"{query.lower().strip()}|{'|'.join(sorted(artifact.candidate_ids))}"
        row = {
            "artifact_key": artifact_key,
            "tenant_id": artifact.tenant_id,
            "candidate_ids": artifact.candidate_ids,
            "query_fingerprint": query_fingerprint,
            "comparison_json": dataclass_to_dict(artifact),
            "artifact_version": artifact.artifact_version,
        }
        self.upsert("comparison_artifacts", [row], "artifact_key")
