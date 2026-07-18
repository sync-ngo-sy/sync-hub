from __future__ import annotations

import os
import json
import time
import tempfile
import asyncio
import logging
import hmac
from collections import defaultdict, deque
from pathlib import Path
from fastapi import FastAPI, UploadFile, File, Form, BackgroundTasks, Security, HTTPException, status, Depends, Request
import uuid
from fastapi.responses import StreamingResponse
from fastapi.security import APIKeyHeader

# Configure standard logging
logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

from cv_intelligence_worker.candidate_extraction import build_candidate_system_prompt
from cv_intelligence_worker.config import WorkerConfig
from cv_intelligence_worker.extraction import build_candidate_prompt
from cv_intelligence_worker.llm import LLMClient, LLMResponseError
from cv_intelligence_worker.llm_models import RealtimeCandidateExtraction
from cv_intelligence_worker.parsing import parse_document
from cv_intelligence_worker.schema import DocumentSource
from cv_intelligence_worker.supabase_client import SupabaseSyncClient

app = FastAPI(title="Realtime CV Extraction")


@app.get("/health", include_in_schema=False)
def health() -> dict[str, str]:
    return {"status": "ok"}

# ---------------------------------------------------------------------------
# H2: Rate limiting — 10 requests/minute per API key (sliding window)
#     + global concurrent LLM request cap of 5
# ---------------------------------------------------------------------------
_RATE_LIMIT_REQUESTS = int(os.environ.get("RATE_LIMIT_REQUESTS", "10"))
_RATE_LIMIT_WINDOW_SECS = int(os.environ.get("RATE_LIMIT_WINDOW_SECS", "60"))
_MAX_CONCURRENT = int(os.environ.get("MAX_CONCURRENT_LLM", "5"))

_request_log: dict[str, deque] = defaultdict(deque)   # api_key → timestamps
_concurrency_sem = asyncio.Semaphore(_MAX_CONCURRENT)

def _check_rate_limit(api_key: str) -> None:
    now = time.monotonic()
    window = _request_log[api_key]
    # Evict timestamps outside the sliding window
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

def verify_api_key(api_key: str = Security(api_key_header)):
    config = WorkerConfig.from_env()
    if not config.api_key:
        logger.error("API Key not configured on server")
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid API Key")
    if not hmac.compare_digest(api_key, config.api_key):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid API Key")
    return api_key

def build_extended_system_prompt() -> str:
    base_prompt = build_candidate_system_prompt().split("Output schema:\n")[0]
    schema_text = json.dumps(RealtimeCandidateExtraction.model_json_schema(), indent=2, ensure_ascii=True)

    additional_rules = (
        "Additional Registration Flow Rules:\n"
        "- For `field_confidence`, provide a confidence score (0-100) for every single field extracted (e.g. 'name': 90, 'experience[0].title': 85).\n"
        "- Ensure employment_type and work_mode are extracted from the experience descriptions.\n"
        "- Ensure proficiency, years_of_experience, and last_used are estimated for skills if possible, otherwise use null.\n\n"
    )

    return base_prompt + additional_rules + "Output schema:\n" + schema_text

def sync_to_supabase_background(user_id: str, extraction: RealtimeCandidateExtraction, config: WorkerConfig) -> None:
    if not config.supabase_url or not config.supabase_service_key:
        logger.info("[DB SYNC] No Supabase credentials, skipping sync")
        return

    supabase = SupabaseSyncClient(config.supabase_url, config.supabase_service_key)

    parsed_json = extraction.model_dump(mode="json")
    field_confidence = parsed_json.pop("field_confidence")

    from datetime import datetime, timezone
    row = {
        "user_id": user_id,
        "parsed_profile_json": parsed_json,
        "field_confidence_json": field_confidence,
        "parse_status": "completed",
        "parse_completed_at": datetime.now(timezone.utc).isoformat(),
    }

    try:
        supabase.upsert_rows("candidate_registration_drafts", [row], on_conflict="user_id")
        logger.info(f"[DB SYNC] Successfully synced profile draft for user: {user_id}")
    except Exception as e:
        logger.error(f"[DB SYNC] Failed to sync to Supabase: {e}")
        try:
            supabase.upsert_rows("candidate_registration_drafts", [{
                "user_id": user_id,
                "parse_status": "failed",
                "parse_error": f"DB sync error: {e}",
            }], on_conflict="user_id")
        except Exception as db_err:
            logger.error(f"[DB SYNC] Failed to mark draft as failed: {db_err}")


def mark_extraction_failed(user_id: str, error: str, config: WorkerConfig) -> None:
    if not config.supabase_url or not config.supabase_service_key:
        return
    try:
        SupabaseSyncClient(config.supabase_url, config.supabase_service_key).upsert_rows(
            "candidate_registration_drafts",
            [{"user_id": user_id, "parse_status": "failed", "parse_error": error}],
            on_conflict="user_id",
        )
    except Exception as db_err:
        logger.error(f"[DB SYNC] Failed to mark draft as failed: {db_err}")

MAX_FILE_SIZE = 5 * 1024 * 1024  # 5 MB

@app.post("/api/v1/parse-cv-fast")
async def parse_cv_endpoint(
    request: Request,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),  # noqa: B008
    user_id: str = Form(...),      # noqa: B008
    api_key: str = Depends(verify_api_key)
):
    if "content-length" in request.headers:
        try:
            if int(request.headers["content-length"]) > MAX_FILE_SIZE:
                raise HTTPException(status_code=413, detail="File too large (exceeds 5MB limit)")
        except ValueError:
            pass

    try:
        uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid user_id format. Must be a valid UUID.") from None

    # H2: enforce per-key rate limit and global concurrency cap
    _check_rate_limit(api_key)

    if _concurrency_sem.locked():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Server busy, please retry shortly",
        )

    # Dynamic config picking up os.environ variables
    config = WorkerConfig.from_env()
    if not config.extraction_model:
        raise HTTPException(status_code=503, detail="CV extraction model is not configured")

    # 1. Parse Document (Using existing robust logic)
    suffix = Path(file.filename).suffix if file.filename else ".pdf"

    # Read content BEFORE creating temp file to avoid a temp-file leak if the
    # size validation raises HTTPException (delete=False files are not cleaned up
    # automatically when an exception is thrown inside the with-block).
    content = await file.read(MAX_FILE_SIZE + 1)
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File too large (exceeds 5MB limit)")

    detected_mime_type = _detect_allowed_mime_type(content)
    if not detected_mime_type:
        raise HTTPException(status_code=400, detail="Invalid file type. Only PDF and Word documents are allowed.")
    if file.content_type and file.content_type != detected_mime_type:
        raise HTTPException(status_code=400, detail="Invalid file type. Only PDF and Word documents are allowed.")

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
            mime_type=detected_mime_type,
            document_id="tmp",
            document_sha256="tmp",
            ingestion_run_id="tmp"
        )

        # Offload CPU-bound parsing to threadpool
        loop = asyncio.get_running_loop()
        document_text = await loop.run_in_executor(None, parse_document, source)

    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.remove(tmp_path)

    # 2. Build Prompt (Re-using original logic but with extended schema)
    prompt = build_candidate_prompt(document_text)
    system_prompt = build_extended_system_prompt()

    try:
        async with _concurrency_sem:
            extraction = await LLMClient(config).parse_async(
                model=config.extraction_model,
                system_prompt=system_prompt,
                prompt=prompt,
                response_model=RealtimeCandidateExtraction,
            )
    except LLMResponseError as exc:
        await asyncio.to_thread(mark_extraction_failed, user_id, str(exc), config)
        raise HTTPException(status_code=502, detail="CV extraction failed") from exc

    background_tasks.add_task(sync_to_supabase_background, user_id, extraction, config)

    async def validated_stream():
        yield extraction.model_dump_json()

    return StreamingResponse(validated_stream(), media_type="text/event-stream")
