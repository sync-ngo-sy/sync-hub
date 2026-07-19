from __future__ import annotations

import asyncio
import hmac
import logging
import os
import tempfile
import time
import uuid
from collections.abc import AsyncIterator
from collections import defaultdict, deque
from datetime import UTC, datetime
from pathlib import Path

from fastapi import BackgroundTasks, Depends, FastAPI, File, Form, HTTPException, Request, Security, UploadFile, status
from fastapi.responses import StreamingResponse
from fastapi.security import APIKeyHeader

from cv_intelligence_worker.candidate_extraction import build_candidate_prompt, build_realtime_candidate_system_prompt
from cv_intelligence_worker.config import WorkerConfig
from cv_intelligence_worker.documents import parse_document
from cv_intelligence_worker.integrations.llm import LLMClient, LLMResponseError
from cv_intelligence_worker.integrations.llm.models import RealtimeCandidateExtraction
from cv_intelligence_worker.domain.models import DocumentSource, DocumentText
from cv_intelligence_worker.integrations.supabase import SupabaseClient

logger = logging.getLogger(__name__)
app = FastAPI(title="Realtime CV Extraction")


@app.get("/health", include_in_schema=False)
def health() -> dict[str, str]:
    return {"status": "ok"}


_RATE_LIMIT_REQUESTS = int(os.environ.get("RATE_LIMIT_REQUESTS", "10"))
_RATE_LIMIT_WINDOW_SECS = int(os.environ.get("RATE_LIMIT_WINDOW_SECS", "60"))
_MAX_CONCURRENT = int(os.environ.get("MAX_CONCURRENT_LLM", "5"))

_request_log: dict[str, deque[float]] = defaultdict(deque)
_concurrency_sem = asyncio.Semaphore(_MAX_CONCURRENT)


def _check_rate_limit(api_key: str) -> None:
    now = time.monotonic()
    window = _request_log[api_key]
    while window and now - window[0] > _RATE_LIMIT_WINDOW_SECS:
        window.popleft()
    if len(window) >= _RATE_LIMIT_REQUESTS:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Rate limit exceeded: max {_RATE_LIMIT_REQUESTS} requests per {_RATE_LIMIT_WINDOW_SECS}s",
        )
    window.append(now)


api_key_header = APIKeyHeader(name="X-API-Key", auto_error=True)


def _detect_allowed_mime_type(file_bytes: bytes) -> str | None:
    if file_bytes.startswith(b"%PDF-"):
        return "application/pdf"
    if file_bytes.startswith(b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"):
        return "application/msword"
    if file_bytes.startswith(b"PK\x03\x04") or file_bytes.startswith(b"PK\x05\x06") or file_bytes.startswith(b"PK\x07\x08"):
        return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    return None


def verify_api_key(api_key: str = Security(api_key_header)) -> str:
    config = WorkerConfig.from_env()
    if not config.api_key:
        logger.error("API Key not configured on server")
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid API Key")
    if not hmac.compare_digest(api_key, config.api_key):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid API Key")
    return api_key


def build_extended_system_prompt() -> str:
    return build_realtime_candidate_system_prompt()


def sync_to_supabase_background(user_id: str, extraction: RealtimeCandidateExtraction, config: WorkerConfig) -> None:
    if not config.supabase_url or not config.supabase_service_key:
        logger.info("[DB SYNC] No Supabase credentials, skipping sync")
        return

    supabase = SupabaseClient(config)

    parsed_json = extraction.model_dump(mode="json")
    field_confidence = parsed_json.pop("field_confidence")

    row = {
        "user_id": user_id,
        "parsed_profile_json": parsed_json,
        "field_confidence_json": field_confidence,
        "parse_status": "completed",
        "parse_completed_at": datetime.now(UTC).isoformat(),
    }

    try:
        supabase.upsert("candidate_registration_drafts", [row], on_conflict="user_id")
        logger.info(f"[DB SYNC] Successfully synced profile draft for user: {user_id}")
    except Exception as e:
        logger.error(f"[DB SYNC] Failed to sync to Supabase: {e}")
        try:
            supabase.upsert(
                "candidate_registration_drafts",
                [
                    {
                        "user_id": user_id,
                        "parse_status": "failed",
                        "parse_error": f"DB sync error: {e}",
                    }
                ],
                on_conflict="user_id",
            )
        except Exception as db_err:
            logger.error(f"[DB SYNC] Failed to mark draft as failed: {db_err}")


def mark_extraction_failed(user_id: str, error: str, config: WorkerConfig) -> None:
    if not config.supabase_url or not config.supabase_service_key:
        return
    try:
        SupabaseClient(config).upsert(
            "candidate_registration_drafts",
            [{"user_id": user_id, "parse_status": "failed", "parse_error": error}],
            on_conflict="user_id",
        )
    except Exception as db_err:
        logger.error(f"[DB SYNC] Failed to mark draft as failed: {db_err}")


MAX_FILE_SIZE = 5 * 1024 * 1024  # 5 MB


def _validated_request_config(request: Request, user_id: str, api_key: str) -> WorkerConfig:
    content_length = request.headers.get("content-length")
    if content_length:
        try:
            if int(content_length) > MAX_FILE_SIZE:
                raise HTTPException(status_code=413, detail="File too large (exceeds 5MB limit)")
        except ValueError:
            pass

    try:
        uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid user_id format. Must be a valid UUID.") from None

    _check_rate_limit(api_key)
    if _concurrency_sem.locked():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Server busy, please retry shortly",
        )
    config = WorkerConfig.from_env()
    if not config.extraction_model:
        raise HTTPException(status_code=503, detail="CV extraction model is not configured")
    return config


async def _read_validated_upload(file: UploadFile) -> tuple[bytes, str, str]:
    content = await file.read(MAX_FILE_SIZE + 1)
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File too large (exceeds 5MB limit)")
    detected_mime_type = _detect_allowed_mime_type(content)
    if not detected_mime_type or (file.content_type and file.content_type != detected_mime_type):
        raise HTTPException(status_code=400, detail="Invalid file type. Only PDF and Word documents are allowed.")
    suffix = Path(file.filename).suffix if file.filename else ".pdf"
    return content, detected_mime_type, suffix


async def _parse_upload(file: UploadFile, content: bytes, mime_type: str, suffix: str) -> DocumentText:
    tmp_path: str | None = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(content)
            tmp_path = tmp.name
        source = DocumentSource(
            tenant_id="default",
            source_path=tmp_path,
            source_type="file",
            original_filename=file.filename or "cv",
            mime_type=mime_type,
            document_id="tmp",
            document_sha256="tmp",
            ingestion_run_id="tmp",
        )
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(None, parse_document, source)
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.remove(tmp_path)


async def _extract_candidate(document_text: DocumentText, user_id: str, config: WorkerConfig) -> RealtimeCandidateExtraction:
    try:
        async with _concurrency_sem:
            return await LLMClient(config).parse_async(
                model=config.extraction_model,
                system_prompt=build_extended_system_prompt(),
                prompt=build_candidate_prompt(document_text),
                response_model=RealtimeCandidateExtraction,
            )
    except LLMResponseError as exc:
        await asyncio.to_thread(mark_extraction_failed, user_id, str(exc), config)
        raise HTTPException(status_code=502, detail="CV extraction failed") from exc


async def _validated_stream(extraction: RealtimeCandidateExtraction) -> AsyncIterator[str]:
    yield extraction.model_dump_json()


@app.post("/api/v1/parse-cv-fast")
async def parse_cv_endpoint(
    request: Request,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),  # noqa: B008
    user_id: str = Form(...),  # noqa: B008
    api_key: str = Depends(verify_api_key),
) -> StreamingResponse:
    config = _validated_request_config(request, user_id, api_key)
    content, mime_type, suffix = await _read_validated_upload(file)
    document_text = await _parse_upload(file, content, mime_type, suffix)
    extraction = await _extract_candidate(document_text, user_id, config)
    background_tasks.add_task(sync_to_supabase_background, user_id, extraction, config)
    return StreamingResponse(_validated_stream(extraction), media_type="text/event-stream")
