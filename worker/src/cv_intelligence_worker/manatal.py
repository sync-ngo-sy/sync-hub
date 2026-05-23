from __future__ import annotations

import json
import mimetypes
import re
import tempfile
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable, Iterable
from uuid import uuid4

from .config import WorkerConfig
from .discovery import compute_sha256, guess_mime_type, stable_document_id
from .gcs_storage import GcsJsonClient
from .pipeline import IngestionPipeline, IngestionResult
from .schema import DocumentSource
from .supabase import SupabaseClient
from .utils import urlopen


SUPPORTED_RESUME_SUFFIXES = {".pdf", ".docx", ".txt"}
MANATAL_SOURCE_TYPE = "manatal"


@dataclass(frozen=True)
class ManatalCandidate:
    id: str
    full_name: str = ""
    email: str = ""
    resume_url: str = ""
    updated_at: str = ""
    created_at: str = ""
    current_company: str = ""
    current_position: str = ""
    raw: dict[str, Any] | None = None


@dataclass(frozen=True)
class ManatalResumeDownload:
    candidate: ManatalCandidate
    path: Path
    sha256: str
    mime_type: str
    resume_url: str


@dataclass(frozen=True)
class ManatalSyncResult:
    fetched_candidates: int
    queued_candidates: int
    skipped_candidates: int
    downloaded_resumes: int
    synced_resumes: int
    failures: list[dict[str, str]]
    ingestion_result: IngestionResult | None


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _isoformat(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


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


def _redact_error_content(value: str) -> str:
    redacted = re.sub(r"Token\s+[A-Za-z0-9._-]+", "Token [redacted]", value)
    redacted = re.sub(r"([?&](?:Signature|X-Amz-Signature|Expires|X-Amz-Credential|X-Amz-Security-Token)=)[^&<\s]+", r"\1[redacted]", redacted)
    return redacted


class ManatalClient:
    def __init__(self, config: WorkerConfig) -> None:
        self.config = config
        self.base_url = config.manatal_api_base_url.rstrip("/")
        if not config.manatal_api_token:
            raise ValueError("MANATAL_API_TOKEN is required for Manatal sync")

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
        return urllib.parse.urlsplit(url).netloc == urllib.parse.urlsplit(self.base_url).netloc

    def _request(self, path_or_url: str, query: dict[str, str] | None = None) -> tuple[bytes, dict[str, str]]:
        url = path_or_url if path_or_url.startswith(("http://", "https://")) else f"{self.base_url}{path_or_url}"
        if query:
            url = f"{url}?{urllib.parse.urlencode(query)}"
        headers = self._headers() if self._is_manatal_api_url(url) else {"User-Agent": self.config.user_agent}
        request = urllib.request.Request(url, headers=headers, method="GET")
        try:
            with urlopen(request, timeout=self.config.request_timeout_seconds) as response:
                return response.read(), dict(response.headers.items())
        except urllib.error.HTTPError as exc:
            content = _redact_error_content(exc.read().decode("utf-8", errors="replace"))
            safe_url = _redact_url_for_error(url)
            raise RuntimeError(f"Manatal GET {safe_url} failed ({exc.code}): {content or exc.reason}") from exc

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

    def list_candidates(self, *, updated_since: str = "", candidate_ids: Iterable[str] | None = None, limit: int = 0) -> list[ManatalCandidate]:
        explicit_ids = [str(candidate_id).strip() for candidate_id in (candidate_ids or []) if str(candidate_id).strip()]
        if explicit_ids:
            candidates: list[ManatalCandidate] = []
            for candidate_id in explicit_ids:
                try:
                    candidates.append(self.get_candidate(candidate_id))
                except Exception as exc:  # noqa: BLE001
                    candidates.append(ManatalCandidate(id=candidate_id, raw={"candidate_fetch_error": str(exc)}))
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


class ManatalSync:
    def __init__(self, config: WorkerConfig) -> None:
        self.config = config
        self.client = ManatalClient(config)
        self.pipeline = IngestionPipeline(config)
        self.supabase = SupabaseClient(config) if config.has_supabase_http_credentials() else None

    def _existing_state(self, candidates: list[ManatalCandidate]) -> dict[str, dict[str, Any]]:
        if not self.supabase or not candidates:
            return {}
        return self.supabase.manatal_sync_states(self.config.tenant_id, [candidate.id for candidate in candidates])

    def _should_skip_before_download(self, candidate: ManatalCandidate, state: dict[str, Any]) -> bool:
        if not state or state.get("sync_status") != "synced":
            return False
        state_updated_at = str(state.get("manatal_updated_at") or "")
        return bool(candidate.updated_at and state_updated_at and candidate.updated_at <= state_updated_at)

    def _document_source(self, resume: ManatalResumeDownload, ingestion_run_id: str, uploaded_by: str) -> DocumentSource:
        metadata = {
            "external_source": "manatal",
            "manatal_candidate_id": resume.candidate.id,
            "manatal_full_name": resume.candidate.full_name,
            "manatal_email": resume.candidate.email,
            "manatal_updated_at": resume.candidate.updated_at,
            "manatal_created_at": resume.candidate.created_at,
            "manatal_current_company": resume.candidate.current_company,
            "manatal_current_position": resume.candidate.current_position,
            "manatal_resume_url": _redact_url_for_error(resume.resume_url),
        }
        return DocumentSource(
            tenant_id=self.config.tenant_id,
            source_path=str(resume.path),
            source_type=MANATAL_SOURCE_TYPE,
            original_filename=resume.path.name,
            mime_type=resume.mime_type or guess_mime_type(resume.path),
            document_id=stable_document_id(self.config.tenant_id, str(resume.path), resume.sha256),
            document_sha256=resume.sha256,
            ingestion_run_id=ingestion_run_id,
            uploaded_by=uploaded_by or self.config.uploaded_by or "manatal-sync",
            metadata=metadata,
        )

    def _sync_state_row(
        self,
        resume: ManatalResumeDownload,
        source: DocumentSource,
        status: str,
        error_message: str = "",
        source_document_id: str = "",
    ) -> dict[str, Any]:
        return {
            "tenant_id": self.config.tenant_id,
            "manatal_candidate_id": resume.candidate.id,
            "manatal_updated_at": resume.candidate.updated_at or None,
            "manatal_full_name": resume.candidate.full_name,
            "manatal_email": resume.candidate.email,
            "resume_url": _redact_url_for_error(resume.resume_url),
            "resume_sha256": resume.sha256,
            "source_document_id": source_document_id or source.document_id,
            "sync_status": status,
            "last_synced_at": _isoformat(_utc_now()) if status == "synced" else None,
            "error_message": error_message,
            "metadata_json": {
                "current_company": resume.candidate.current_company,
                "current_position": resume.candidate.current_position,
            },
        }

    def _candidate_state_row(self, candidate: ManatalCandidate, status: str, error_message: str = "") -> dict[str, Any]:
        return {
            "tenant_id": self.config.tenant_id,
            "manatal_candidate_id": candidate.id,
            "manatal_updated_at": candidate.updated_at or None,
            "manatal_full_name": candidate.full_name,
            "manatal_email": candidate.email,
            "resume_url": candidate.resume_url,
            "resume_sha256": "",
            "source_document_id": None,
            "sync_status": status,
            "last_synced_at": _isoformat(_utc_now()) if status in {"skipped", "synced"} else None,
            "error_message": error_message,
            "metadata_json": {
                "current_company": candidate.current_company,
                "current_position": candidate.current_position,
            },
        }

    def _unchanged_resume_state_row(self, resume: ManatalResumeDownload, state: dict[str, Any]) -> dict[str, Any]:
        metadata = state.get("metadata_json") if isinstance(state.get("metadata_json"), dict) else {}
        metadata = {
            **metadata,
            "current_company": resume.candidate.current_company or metadata.get("current_company", ""),
            "current_position": resume.candidate.current_position or metadata.get("current_position", ""),
            "resume_unchanged": True,
            "resume_checked_at": _isoformat(_utc_now()),
        }
        return {
            "tenant_id": self.config.tenant_id,
            "manatal_candidate_id": resume.candidate.id,
            "manatal_updated_at": resume.candidate.updated_at or state.get("manatal_updated_at") or None,
            "manatal_full_name": resume.candidate.full_name or str(state.get("manatal_full_name") or ""),
            "manatal_email": resume.candidate.email or str(state.get("manatal_email") or ""),
            "resume_url": _redact_url_for_error(resume.resume_url) or str(state.get("resume_url") or ""),
            "resume_sha256": resume.sha256,
            "source_document_id": state.get("source_document_id"),
            "sync_status": "synced",
            "last_synced_at": _isoformat(_utc_now()),
            "error_message": "",
            "metadata_json": metadata,
        }

    def _sync_original_to_gcs(self, resume: ManatalResumeDownload, source: DocumentSource, source_document_id: str) -> str:
        bucket = self.config.gcs_originals_bucket
        if not bucket or not self.supabase:
            return ""
        object_name = f"{source.tenant_id}/{source_document_id}/{source.original_filename}"
        GcsJsonClient(self.config).upload_file(bucket, object_name, resume.path, resume.mime_type or source.mime_type)
        metadata = {
            **source.metadata,
            "manatal_resume_url": _redact_url_for_error(resume.resume_url),
            "gcs_bucket": bucket,
            "gcs_object": object_name,
            "migrated_to_gcs_from": "manatal-sync",
            "migrated_to_gcs_at": _isoformat(_utc_now()),
        }
        query = urllib.parse.urlencode({"id": f"eq.{source_document_id}"})
        self.supabase._request(
            "PATCH",
            f"/rest/v1/source_documents?{query}",
            data={
                "source_uri": f"gs://{bucket}/{object_name}",
                "storage_path": object_name,
                "metadata_json": metadata,
            },
            headers={"Prefer": "return=minimal"},
        )
        return object_name

    def sync(
        self,
        *,
        updated_since: str = "",
        candidate_ids: Iterable[str] | None = None,
        pending: bool = False,
        queue_only: bool = False,
        limit: int = 0,
        sync_to_supabase: bool = True,
        uploaded_by: str = "",
        progress: Callable[[str], None] | None = None,
    ) -> ManatalSyncResult:
        if not self.config.tenant_id:
            raise ValueError("CV_WORKER_TENANT_ID is required for Manatal sync")
        explicit_candidate_ids = [str(candidate_id).strip() for candidate_id in (candidate_ids or []) if str(candidate_id).strip()]
        if pending:
            if not self.supabase:
                raise ValueError("Supabase credentials are required for --pending Manatal sync")
            explicit_candidate_ids = self.supabase.pending_manatal_candidate_ids(self.config.tenant_id, limit=limit or self.config.manatal_page_size)
            if not explicit_candidate_ids:
                return ManatalSyncResult(
                    fetched_candidates=0,
                    queued_candidates=0,
                    skipped_candidates=0,
                    downloaded_resumes=0,
                    synced_resumes=0,
                    failures=[],
                    ingestion_result=None,
                )
        if not updated_since and not explicit_candidate_ids:
            updated_since = _isoformat(_utc_now() - timedelta(hours=max(1, self.config.manatal_lookback_hours)))
        candidates = self.client.list_candidates(updated_since=updated_since, candidate_ids=explicit_candidate_ids, limit=limit)
        states = self._existing_state(candidates)
        download_root = Path(self.config.manatal_download_dir)
        download_root.mkdir(parents=True, exist_ok=True)
        run_download_dir = Path(tempfile.mkdtemp(prefix="run-", dir=str(download_root)))
        ingestion_run_id = str(uuid4())
        resumes: list[ManatalResumeDownload] = []
        sources: list[DocumentSource] = []
        state_rows: list[dict[str, Any]] = []
        skipped = 0
        failures: list[dict[str, str]] = []

        def emit(message: str) -> None:
            if progress:
                progress(message)

        emit(f"fetched {len(candidates)} Manatal candidates")
        if queue_only:
            for candidate in candidates:
                state = states.get(candidate.id, {})
                if (
                    self._should_skip_before_download(candidate, state)
                    or (state.get("sync_status") == "synced" and state.get("resume_sha256") and not candidate.updated_at)
                ):
                    skipped += 1
                    continue
                state_rows.append(self._candidate_state_row(candidate, "pending"))
            if sync_to_supabase and self.supabase and state_rows:
                self.supabase.upsert_manatal_sync_states(state_rows)
            return ManatalSyncResult(
                fetched_candidates=len(candidates),
                queued_candidates=len(state_rows),
                skipped_candidates=skipped,
                downloaded_resumes=0,
                synced_resumes=0,
                failures=[],
                ingestion_result=None,
            )

        for candidate in candidates:
            state = states.get(candidate.id, {})
            if self._should_skip_before_download(candidate, state):
                skipped += 1
                continue
            try:
                resume = self.client.download_resume(candidate, run_download_dir)
                if not resume:
                    error = "candidate has no resume URL"
                    failures.append({"manatal_candidate_id": candidate.id, "error": error})
                    state_rows.append(self._candidate_state_row(candidate, "skipped", error))
                    continue
                if state.get("resume_sha256") == resume.sha256:
                    skipped += 1
                    state_rows.append(self._unchanged_resume_state_row(resume, state))
                    continue
                source = self._document_source(resume, ingestion_run_id, uploaded_by)
                resumes.append(resume)
                sources.append(source)
            except Exception as exc:  # noqa: BLE001
                error = str(exc)
                status = "skipped" if "failed (404)" in error or "Not found" in error else "failed"
                failures.append({"manatal_candidate_id": candidate.id, "error": error})
                state_rows.append(self._candidate_state_row(candidate, status, error))

        ingestion_result = None
        if sources:
            ingestion_result = self.pipeline.ingest_sources(
                sources,
                tenant_id=self.config.tenant_id,
                uploaded_by=uploaded_by or self.config.uploaded_by or "manatal-sync",
                sync_to_supabase=sync_to_supabase,
                progress=progress,
            )
            failed_source_paths = {failure["source_path"]: failure["error"] for failure in ingestion_result.failures}
            for resume, source in zip(resumes, sources):
                error = failed_source_paths.get(source.source_path, "")
                source_document_id = source.document_id
                if not error and self.supabase:
                    source_document_id = self.supabase.resolve_source_document_id(
                        self.config.tenant_id,
                        source.document_sha256,
                        source.document_id,
                    )
                    if self.config.gcs_originals_bucket:
                        try:
                            self._sync_original_to_gcs(resume, source, source_document_id)
                        except Exception as exc:  # noqa: BLE001
                            error = str(exc)
                state_rows.append(self._sync_state_row(resume, source, "failed" if error else "synced", error, source_document_id))
        if sync_to_supabase and self.supabase and state_rows:
            self.supabase.upsert_manatal_sync_states(state_rows)

        return ManatalSyncResult(
            fetched_candidates=len(candidates),
            queued_candidates=0,
            skipped_candidates=skipped,
            downloaded_resumes=len(resumes),
            synced_resumes=0 if not ingestion_result else len(ingestion_result.bundles),
            failures=failures + ([] if not ingestion_result else ingestion_result.failures),
            ingestion_result=ingestion_result,
        )
