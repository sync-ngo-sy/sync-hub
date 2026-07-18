from __future__ import annotations

import json
import mimetypes
import re
import urllib.parse
from pathlib import Path
from typing import Any, Iterable

import httpx

from ...config import WorkerConfig
from ...discovery import compute_sha256, guess_mime_type
from ...utils import format_error_message
from .models import ManatalCandidate, ManatalResumeDownload


SUPPORTED_RESUME_SUFFIXES = {".pdf", ".docx", ".txt"}


def _as_record(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _as_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def _safe_filename(value: str) -> str:
    normalized = re.sub(r"[^A-Za-z0-9._-]+", "-", value.strip())
    normalized = normalized.strip(".-")
    return normalized[:120] or "candidate"


def _extension_from_url(value: str) -> str:
    path = urllib.parse.urlparse(value).path
    suffix = Path(path).suffix.lower()
    return suffix if suffix in SUPPORTED_RESUME_SUFFIXES else ".pdf"


def _extract_url_from_payload(payload: Any) -> str:
    if isinstance(payload, str) and payload.startswith(("http://", "https://")):
        return payload
    if not isinstance(payload, dict):
        return ""
    for key in ("resume", "resume_file", "resume_url", "file", "file_url", "url", "download_url"):
        value = payload.get(key)
        if isinstance(value, str) and value.startswith(("http://", "https://")):
            return value
    return ""


def _redact_url_for_error(value: str) -> str:
    parsed = urllib.parse.urlsplit(value)
    if parsed.query:
        return urllib.parse.urlunsplit((parsed.scheme, parsed.netloc, parsed.path, "", ""))
    return value


class ManatalClient:
    def __init__(self, config: WorkerConfig, *, transport: httpx.BaseTransport | None = None) -> None:
        self.config = config
        self.base_url = config.manatal_api_base_url.rstrip("/")
        if not config.manatal_api_token:
            raise ValueError("MANATAL_API_TOKEN is required for Manatal sync")
        self.transport = transport

    def _headers(self, extra: dict[str, str] | None = None) -> dict[str, str]:
        headers = {
            "Authorization": f"Token {self.config.manatal_api_token}",
            "Accept": "application/json",
            "User-Agent": self.config.user_agent,
        }
        if extra:
            headers.update(extra)
        return headers

    def _is_manatal_api_url(self, url: str) -> bool:
        target = urllib.parse.urlsplit(url)
        base = urllib.parse.urlsplit(self.base_url)
        return target.scheme == base.scheme and target.netloc == base.netloc

    def _request(self, path_or_url: str, query: dict[str, str] | None = None) -> tuple[bytes, dict[str, str]]:
        url = path_or_url if path_or_url.startswith(("http://", "https://")) else f"{self.base_url}{path_or_url}"
        if query:
            url = f"{url}?{urllib.parse.urlencode(query)}"
        headers = self._headers() if self._is_manatal_api_url(url) else {"User-Agent": self.config.user_agent}
        try:
            with httpx.Client(
                follow_redirects=True,
                timeout=self.config.request_timeout_seconds,
                transport=self.transport,
            ) as http_client:
                response = http_client.get(url, headers=headers)
                response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            safe_url = _redact_url_for_error(str(exc.request.url))
            raise RuntimeError(f"Manatal GET {safe_url} failed ({exc.response.status_code})") from exc
        except httpx.RequestError as exc:
            safe_url = _redact_url_for_error(str(exc.request.url))
            raise RuntimeError(f"Manatal GET {safe_url} failed ({type(exc).__name__})") from exc
        return response.content, dict(response.headers.items())

    def _json(self, path: str, query: dict[str, str] | None = None) -> Any:
        body, _headers = self._request(path, query)
        return json.loads(body.decode("utf-8") or "{}")

    def _candidate_from_record(self, record: dict[str, Any]) -> ManatalCandidate:
        candidate_id = str(record.get("id") or record.get("pk") or "").strip()
        return ManatalCandidate(
            id=candidate_id,
            full_name=str(record.get("full_name") or record.get("name") or "").strip(),
            email=str(record.get("email") or "").strip(),
            resume_url=str(record.get("resume") or record.get("resume_url") or "").strip(),
            updated_at=str(record.get("updated_at") or record.get("created_at") or "").strip(),
            created_at=str(record.get("created_at") or "").strip(),
            current_company=str(record.get("current_company") or "").strip(),
            current_position=str(record.get("current_position") or "").strip(),
            raw=record,
        )

    def list_candidates(
        self,
        *,
        updated_since: str = "",
        candidate_ids: Iterable[str] | None = None,
        limit: int = 0,
    ) -> list[ManatalCandidate]:
        explicit_ids = [str(candidate_id).strip() for candidate_id in (candidate_ids or []) if str(candidate_id).strip()]
        if explicit_ids:
            candidates: list[ManatalCandidate] = []
            for candidate_id in explicit_ids:
                try:
                    candidates.append(self.get_candidate(candidate_id))
                except Exception as exc:  # noqa: BLE001
                    candidates.append(
                        ManatalCandidate(
                            id=candidate_id,
                            raw={"candidate_fetch_error": format_error_message(exc)},
                        )
                    )
            return [candidate for candidate in candidates if candidate.id]

        page = 1
        page_size = max(1, self.config.manatal_page_size)
        candidates: list[ManatalCandidate] = []
        while True:
            query = {"page": str(page), "page_size": str(page_size)}
            if updated_since:
                query["updated_at__gte"] = updated_since
            payload = self._json("/candidates/", query)
            if isinstance(payload, list):
                records = payload
                has_next = False
            else:
                record_payload = _as_record(payload)
                records = _as_list(record_payload.get("results") or record_payload.get("data"))
                has_next = bool(record_payload.get("next"))
            for item in records:
                if isinstance(item, dict):
                    candidate = self._candidate_from_record(item)
                    if candidate.id:
                        candidates.append(candidate)
                        if limit and len(candidates) >= limit:
                            return candidates
            if not records or not has_next:
                break
            page += 1
        return candidates

    def get_candidate(self, candidate_id: str) -> ManatalCandidate:
        payload = self._json(f"/candidates/{urllib.parse.quote(candidate_id)}/")
        return self._candidate_from_record(_as_record(payload))

    def download_resume(self, candidate: ManatalCandidate, download_dir: Path) -> ManatalResumeDownload | None:
        resume_url = candidate.resume_url
        if resume_url:
            body, headers = self._request(resume_url)
        else:
            resume_url = f"{self.base_url}/candidates/{urllib.parse.quote(candidate.id)}/resume/"
            body, headers = self._request(f"/candidates/{urllib.parse.quote(candidate.id)}/resume/")
            content_type = (headers.get("Content-Type") or headers.get("content-type") or "").lower()
            if "json" in content_type:
                resolved_url = _extract_url_from_payload(json.loads(body.decode("utf-8") or "{}"))
                if not resolved_url:
                    return None
                resume_url = resolved_url
                body, headers = self._request(resume_url)
        content_type = (headers.get("Content-Type") or headers.get("content-type") or "application/pdf").split(";", 1)[0].strip()
        suffix = Path(urllib.parse.urlparse(resume_url).path).suffix.lower()
        if suffix not in SUPPORTED_RESUME_SUFFIXES:
            suffix = mimetypes.guess_extension(content_type) or _extension_from_url(resume_url)
        if suffix == ".rtf":
            suffix = ".txt"
        if suffix not in SUPPORTED_RESUME_SUFFIXES:
            suffix = ".pdf"
        filename = f"manatal-{candidate.id}-{_safe_filename(candidate.full_name)}{suffix}"
        path = download_dir / filename
        path.write_bytes(body)
        return ManatalResumeDownload(
            candidate=candidate,
            path=path,
            sha256=compute_sha256(path),
            mime_type=content_type or guess_mime_type(path),
            resume_url=resume_url,
        )
