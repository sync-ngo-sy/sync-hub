from __future__ import annotations

from typing import Annotated, Any, Literal, TypeVar

from pydantic import BaseModel, ConfigDict, Field, ValidationError


class SupabaseResponseError(RuntimeError):
    pass


class SupabaseRow(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


NonBlankText = Annotated[str, Field(min_length=1)]


class PublicJobApplicationRow(SupabaseRow):
    id: NonBlankText
    tenant_id: NonBlankText
    job_posting_id: NonBlankText
    resume_storage_path: NonBlankText
    resume_original_filename: str | None
    resume_source_document_id: str | None
    candidate_hub_visibility: Literal["platform", "tenant", "private"]
    resume_ingestion_status: Literal["queued", "parsing"]
    submitted_at: NonBlankText
    updated_at: NonBlankText


class CandidateDraftRow(SupabaseRow):
    id: NonBlankText
    user_id: NonBlankText
    parsed_profile_json: dict[str, Any]
    user_overrides_json: dict[str, Any]
    cv_storage_path: str | None
    cv_original_filename: str | None
    cv_mime_type: str | None
    cv_size_bytes: Annotated[int, Field(ge=0)] | None
    primary_specialization: str | None
    parse_status: Literal["pending_validation", "parsing"]
    updated_at: NonBlankText


class SourceDocumentRow(SupabaseRow):
    id: NonBlankText
    tenant_id: NonBlankText
    candidate_id: str | None
    document_sha256: str
    storage_path: str | None
    source_uri: str
    original_filename: str
    mime_type: str


RowT = TypeVar("RowT", bound=SupabaseRow)


def validate_rows(payload: Any, row_type: type[RowT], operation: str) -> list[dict[str, Any]]:
    if not isinstance(payload, list):
        raise SupabaseResponseError(f"Supabase {operation} returned an invalid response shape")
    try:
        return [row_type.model_validate(row).model_dump() for row in payload]
    except ValidationError:
        raise SupabaseResponseError(f"Supabase {operation} returned an invalid row") from None


def validate_optional_row(payload: Any, row_type: type[RowT], operation: str) -> dict[str, Any] | None:
    rows = validate_rows(payload, row_type, operation)
    if len(rows) > 1:
        raise SupabaseResponseError(f"Supabase {operation} returned multiple rows")
    return rows[0] if rows else None
