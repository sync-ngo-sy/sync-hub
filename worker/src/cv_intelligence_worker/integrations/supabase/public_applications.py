from __future__ import annotations

import urllib.parse
from typing import Any

from .query_filters import queued_or_stale_status_filter
from .responses import (
    PublicJobApplicationRow,
    SourceDocumentRow,
    validate_optional_row,
    validate_rows,
)
from .transport import SupabaseRequest


class PublicApplicationRepository:
    def __init__(self, request: SupabaseRequest) -> None:
        self._request = request

    def queued(
        self,
        limit: int = 25,
        retry_stale_minutes: int = 30,
    ) -> list[dict[str, Any]]:
        query_args = {
            "resume_storage_path": "not.is.null",
            "select": "id,tenant_id,job_posting_id,resume_storage_path,resume_original_filename,resume_source_document_id,candidate_hub_visibility,resume_ingestion_status,submitted_at,updated_at",
            "order": "submitted_at.asc",
            "limit": str(max(1, limit)),
        }
        query_args.update(
            queued_or_stale_status_filter(
                status_column="resume_ingestion_status",
                queued_status="queued",
                processing_status="parsing",
                retry_stale_minutes=retry_stale_minutes,
            )
        )
        query = urllib.parse.urlencode(query_args)
        result = self._request("GET", f"/rest/v1/job_applications?{query}")
        return validate_rows(result, PublicJobApplicationRow, "job application queue")

    def source_document(self, source_document_id: str) -> dict[str, Any] | None:
        query = urllib.parse.urlencode(
            {
                "id": f"eq.{source_document_id}",
                "select": "id,tenant_id,candidate_id,document_sha256,storage_path,source_uri,original_filename,mime_type",
                "limit": "1",
            }
        )
        result = self._request("GET", f"/rest/v1/source_documents?{query}")
        return validate_optional_row(
            result,
            SourceDocumentRow,
            "source document lookup",
        )

    def update_application(
        self,
        application_id: str,
        payload: dict[str, Any],
    ) -> None:
        query = urllib.parse.urlencode({"id": f"eq.{application_id}"})
        self._request(
            "PATCH",
            f"/rest/v1/job_applications?{query}",
            data=payload,
            headers={"Prefer": "return=minimal"},
        )

    def update_processing_runs(
        self,
        source_document_id: str,
        payload: dict[str, Any],
        application_id: str | None = None,
    ) -> None:
        query_args = {
            "source_document_id": f"eq.{source_document_id}",
            "status": "in.(queued,parsing)",
        }
        if application_id:
            query_args["metadata_json->>job_application_id"] = f"eq.{application_id}"
        query = urllib.parse.urlencode(query_args)
        self._request(
            "PATCH",
            f"/rest/v1/processing_runs?{query}",
            data=payload,
            headers={"Prefer": "return=minimal"},
        )

    def record_event(
        self,
        tenant_id: str,
        application_id: str,
        event_type: str,
        payload: dict[str, Any],
    ) -> None:
        self._request(
            "POST",
            "/rest/v1/job_application_events",
            data=[
                {
                    "tenant_id": tenant_id,
                    "application_id": application_id,
                    "actor_user_id": None,
                    "event_type": event_type,
                    "payload": payload,
                }
            ],
            headers={"Prefer": "return=minimal"},
        )
