from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Dict, Iterable, List, Optional, Sequence
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from .schema import ArtifactBundle, dataclass_to_dict


@dataclass
class SupabaseResponse:
    status: int
    body: Any
    headers: Dict[str, str]


class SupabaseSyncError(RuntimeError):
    pass


class SupabaseSyncClient:
    def __init__(
        self,
        supabase_url: str,
        auth_token: str,
        user_agent: str = "cv-intelligence-worker/0.1.0",
        timeout: int = 30,
        dry_run: bool = False,
    ) -> None:
        self.supabase_url = supabase_url.rstrip("/")
        self.auth_token = auth_token
        self.user_agent = user_agent
        self.timeout = timeout
        self.dry_run = dry_run
        self.sent_requests: List[Dict[str, Any]] = []

    def _headers(self, extra: Optional[Dict[str, str]] = None) -> Dict[str, str]:
        headers = {
            "Authorization": f"Bearer {self.auth_token}",
            "apikey": self.auth_token,
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": self.user_agent,
        }
        if extra:
            headers.update(extra)
        return headers

    def _request(self, method: str, path: str, body: Optional[Any] = None, headers: Optional[Dict[str, str]] = None) -> SupabaseResponse:
        payload = None if body is None else json.dumps(body).encode("utf-8")
        request = Request(
            f"{self.supabase_url}{path}",
            data=payload,
            method=method,
            headers=self._headers(headers),
        )
        if self.dry_run:
            self.sent_requests.append(
                {
                    "method": method,
                    "path": path,
                    "body": body,
                    "headers": self._headers(headers),
                }
            )
            return SupabaseResponse(status=200, body=body, headers={})
        try:
            with urlopen(request, timeout=self.timeout) as response:
                raw_bytes = response.read()
                raw = raw_bytes.decode("utf-8") if raw_bytes else ""
                try:
                    parsed = json.loads(raw) if raw else None
                except json.JSONDecodeError:
                    parsed = raw
                return SupabaseResponse(
                    status=getattr(response, "status", 200),
                    body=parsed,
                    headers=dict(response.headers.items()),
                )
        except HTTPError as exc:
            raw = exc.read().decode("utf-8", errors="ignore")
            raise SupabaseSyncError(f"Supabase request failed ({exc.code}): {raw}") from exc
        except URLError as exc:
            raise SupabaseSyncError(f"Supabase request failed: {exc}") from exc

    def insert_rows(self, table: str, rows: Sequence[Dict[str, Any]]) -> SupabaseResponse:
        headers = {"Prefer": "return=representation"}
        return self._request("POST", f"/rest/v1/{table}", list(rows), headers=headers)

    def upsert_rows(self, table: str, rows: Sequence[Dict[str, Any]], on_conflict: Optional[str] = None) -> SupabaseResponse:
        headers = {"Prefer": "resolution=merge-duplicates,return=representation"}
        path = f"/rest/v1/{table}"
        if on_conflict:
            path = f"{path}?{urlencode({'on_conflict': on_conflict})}"
        return self._request("POST", path, list(rows), headers=headers)

    def rpc(self, function_name: str, payload: Optional[Dict[str, Any]] = None) -> SupabaseResponse:
        return self._request("POST", f"/rest/v1/rpc/{function_name}", payload or {})

    def sync_bundle(self, bundle: ArtifactBundle) -> Dict[str, SupabaseResponse]:
        responses: Dict[str, SupabaseResponse] = {}
        profile_row = dataclass_to_dict(bundle.profile)
        summary_row = dataclass_to_dict(bundle.summary)
        run_row = dataclass_to_dict(bundle.processing_run)
        source_row = dataclass_to_dict(bundle.source)
        chunk_rows = [dataclass_to_dict(chunk) for chunk in bundle.chunks]
        for chunk_row in chunk_rows:
            chunk_row.setdefault("embedding", [])
        responses["candidate"] = self.upsert_rows("candidates", [profile_row], on_conflict="candidate_id,tenant_id")
        responses["summary"] = self.upsert_rows("candidate_summaries", [summary_row], on_conflict="candidate_id,tenant_id")
        responses["source_document"] = self.upsert_rows("source_documents", [source_row], on_conflict="document_id,tenant_id")
        responses["chunks"] = self.upsert_rows("candidate_chunks", chunk_rows, on_conflict="chunk_id,tenant_id")
        responses["processing_runs"] = self.upsert_rows("processing_runs", [run_row], on_conflict="ingestion_run_id,tenant_id")
        return responses
