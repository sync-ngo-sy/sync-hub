from __future__ import annotations

import urllib.parse
from typing import Any

from .query_filters import queued_or_stale_status_filter
from .responses import CandidateDraftRow, validate_rows
from .transport import SupabaseRequest


class CandidateDraftRepository:
    def __init__(self, request: SupabaseRequest) -> None:
        self._request = request

    def queued(
        self,
        limit: int = 25,
        retry_stale_minutes: int = 30,
    ) -> list[dict[str, Any]]:
        query_args = {
            "select": "id,user_id,parsed_profile_json,user_overrides_json,cv_storage_path,cv_original_filename,cv_mime_type,cv_size_bytes,primary_specialization,parse_status,updated_at",
            "order": "updated_at.asc",
            "limit": str(max(1, limit)),
        }
        query_args.update(
            queued_or_stale_status_filter(
                status_column="parse_status",
                queued_status="pending_validation",
                processing_status="parsing",
                retry_stale_minutes=retry_stale_minutes,
            )
        )
        query = urllib.parse.urlencode(query_args)
        result = self._request(
            "GET",
            f"/rest/v1/candidate_registration_drafts?{query}",
        )
        return validate_rows(result, CandidateDraftRow, "candidate draft queue")

    def update_draft(self, user_id: str, payload: dict[str, Any]) -> None:
        query = urllib.parse.urlencode({"user_id": f"eq.{user_id}"})
        self._request(
            "PATCH",
            f"/rest/v1/candidate_registration_drafts?{query}",
            data=payload,
            headers={"Prefer": "return=minimal"},
        )

    def update_candidate(self, user_id: str, payload: dict[str, Any]) -> None:
        query = urllib.parse.urlencode({"uploaded_by": f"eq.{user_id}"})
        self._request(
            "PATCH",
            f"/rest/v1/candidates?{query}",
            data=payload,
            headers={"Prefer": "return=minimal"},
        )
