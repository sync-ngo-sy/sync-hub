from __future__ import annotations

from typing import Any

from ...core.identifiers import stable_uuid
from ...core.text import normalize_email, skill_slugify
from ...domain.models import ArtifactBundle, dataclass_to_dict
from .helpers import bounded_years_experience, vector_literal


def build_bundle_rows(
    bundle: ArtifactBundle,
    source_document_id: str,
    candidate_id: str,
    *,
    source_storage_path: str | None,
    source_uri: str,
) -> dict[str, list[dict[str, Any]]]:
    candidate_email = normalize_email(bundle.profile.email)
    source_metadata = dataclass_to_dict(bundle.source.metadata)
    candidate_hub_visibility = str(source_metadata.get("candidate_hub_visibility") or "").strip()

    profile_payload = dataclass_to_dict(bundle.profile)
    profile_payload["candidate_id"] = candidate_id
    profile_payload["source_document_id"] = source_document_id
    profile_payload["email"] = candidate_email
    profile_payload["years_experience"] = bounded_years_experience(profile_payload.get("years_experience"))
    profile_payload.pop("raw_text", None)

    source_document = {
        "id": source_document_id,
        "tenant_id": bundle.source.tenant_id,
        "candidate_id": candidate_id,
        "source_type": bundle.source.source_type,
        "original_filename": bundle.source.original_filename,
        "mime_type": bundle.source.mime_type,
        "document_sha256": bundle.source.document_sha256,
        "source_uri": source_uri,
        "storage_path": source_storage_path,
        "uploaded_by": bundle.source.uploaded_by,
        "metadata_json": source_metadata,
    }
    candidate = {
        "id": candidate_id,
        "tenant_id": bundle.profile.tenant_id,
        "name": bundle.profile.name,
        "headline": bundle.profile.headline,
        "current_title": bundle.profile.current_title,
        "location": bundle.profile.location,
        "years_experience": bounded_years_experience(bundle.profile.years_experience),
        "seniority": bundle.profile.seniority,
        "primary_role": bundle.profile.role_tags[0] if bundle.profile.role_tags else None,
        "top_skills": bundle.profile.skills,
        "email": candidate_email,
        "phone": bundle.profile.phone,
        "links": bundle.profile.links,
        "latest_document_id": source_document_id,
        "summary_short": bundle.summary.short_summary,
        "status": "completed",
        "metadata_json": bundle.profile.metadata,
        "parse_version": bundle.document_text.parser_version,
        "normalization_version": bundle.processing_run.chunk_version,
        "embedding_version": bundle.processing_run.embedding_version,
        "artifact_version": bundle.summary.artifact_version,
    }
    if candidate_hub_visibility in {"platform", "tenant", "private"}:
        candidate["hub_visibility"] = candidate_hub_visibility
    profile = {
        "candidate_id": candidate_id,
        "tenant_id": bundle.profile.tenant_id,
        "source_document_id": source_document_id,
        "profile_json": profile_payload,
        "timeline_json": dataclass_to_dict(bundle.profile.experience),
        "skill_matrix_json": {
            "skills": [
                {
                    "skill": skill,
                    "aliases": bundle.profile.skill_aliases.get(skill, []),
                    "confidence": bundle.profile.confidence,
                }
                for skill in bundle.profile.skills
            ]
        },
        "raw_text": bundle.document_text.raw_text,
        "confidence": bundle.profile.confidence,
        "missing_fields": bundle.profile.missing_fields,
        "parse_warnings": bundle.profile.parse_warnings,
    }
    summary = {
        "candidate_id": candidate_id,
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
    skill_rows = _skill_rows(bundle, candidate_id)
    chunk_rows = _chunk_rows(bundle, source_document_id, candidate_id)
    processing_run = {
        "id": stable_uuid(bundle.processing_run.tenant_id, bundle.processing_run.ingestion_run_id, source_document_id),
        "tenant_id": bundle.processing_run.tenant_id,
        "candidate_id": candidate_id,
        "source_document_id": source_document_id,
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
    return {
        "source_documents": [source_document],
        "candidates": [candidate],
        "candidate_profiles": [profile],
        "candidate_summaries": [summary],
        "candidate_skill_map": skill_rows,
        "candidate_chunks": chunk_rows,
        "processing_runs": [processing_run],
    }


def _skill_rows(bundle: ArtifactBundle, candidate_id: str) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    seen_skill_slugs: set[str] = set()
    for skill in bundle.profile.skills:
        skill_slug = skill_slugify(skill)
        if not skill_slug or skill_slug in seen_skill_slugs:
            continue
        seen_skill_slugs.add(skill_slug)
        rows.append(
            {
                "id": stable_uuid(bundle.profile.tenant_id, candidate_id, skill_slug),
                "tenant_id": bundle.profile.tenant_id,
                "candidate_id": candidate_id,
                "skill_slug": skill_slug,
                "canonical_skill": skill,
                "evidence": {"aliases": bundle.profile.skill_aliases.get(skill, [])},
            }
        )
    return rows


def _chunk_rows(bundle: ArtifactBundle, source_document_id: str, candidate_id: str) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for chunk, embedding in zip(bundle.chunks, bundle.embeddings):
        rows.append(
            {
                "id": stable_uuid(candidate_id, source_document_id, chunk.chunk_type, str(chunk.chunk_index), chunk.text[:120]),
                "tenant_id": chunk.tenant_id,
                "candidate_id": candidate_id,
                "source_document_id": source_document_id,
                "chunk_type": chunk.chunk_type,
                "section_name": chunk.section_name,
                "chunk_index": chunk.chunk_index,
                "text": chunk.text,
                "token_count": chunk.token_count,
                "source_span": chunk.source_span,
                "metadata_json": chunk.metadata,
                "embedding": vector_literal(embedding.embedding),
                "embedding_version": embedding.embedding_version,
                "parse_version": bundle.document_text.parser_version,
                "normalization_version": bundle.processing_run.chunk_version,
                "source_hash": bundle.source.document_sha256,
                "is_active": chunk.is_active,
            }
        )
    return rows
