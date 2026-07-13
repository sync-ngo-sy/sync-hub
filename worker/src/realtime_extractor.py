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
import httpx

# Configure standard logging
logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

from cv_intelligence_worker.config import WorkerConfig
from cv_intelligence_worker.parsing import parse_document
from cv_intelligence_worker.extraction import _extractor_system_prompt, _structured_prompt
from cv_intelligence_worker.extraction_constants import EXTRACTION_OUTPUT_SCHEMA
from cv_intelligence_worker.schema import DocumentSource
import copy
from cv_intelligence_worker.supabase_client import SupabaseSyncClient

app = FastAPI(title="Realtime CV Extraction")

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
    base_prompt = _extractor_system_prompt().split("Output schema:\n")[0]

    extended_schema = copy.deepcopy(EXTRACTION_OUTPUT_SCHEMA)

    # Extend Experience
    extended_schema["experience"][0].update({
        "employment_type": "string|null (Full-time/Part-time/Contract/Freelance)",
        "work_mode": "string|null (Onsite/Remote/Hybrid)",
        "technologies": ["string"]
    })

    # Extend Projects
    extended_schema["projects"][0].update({
        "role": "string|null",
        "link": "string|null"
    })

    # Modify Certifications
    extended_schema["certifications"] = [{
        "name": "string",
        "issuing_body": "string|null",
        "issue_date": "string|null",
        "expiry_date": "string|null"
    }]

    # Modify Skills
    extended_schema["skills"] = [{
        "name": "string",
        "proficiency": "string|null (Beginner/Intermediate/Advanced/Expert)",
        "years_of_experience": "number|null",
        "last_used": "number|null (Year)"
    }]

    # Add Field Confidence
    extended_schema["field_confidence"] = {
        "example_field_name": 95
    }

    schema_text = json.dumps(extended_schema, indent=2, ensure_ascii=True)

    additional_rules = (
        "Additional Registration Flow Rules:\n"
        "- For `field_confidence`, provide a confidence score (0-100) for every single field extracted (e.g. 'name': 90, 'experience[0].title': 85).\n"
        "- Ensure employment_type and work_mode are extracted from the experience descriptions.\n"
        "- Ensure proficiency, years_of_experience, and last_used are estimated for skills if possible, otherwise use null.\n\n"
    )

    return base_prompt + additional_rules + "Output schema:\n" + schema_text

def sync_to_supabase_background(user_id: str, file_name: str, mime_type: str, raw_json_str: str, config: WorkerConfig):
    """
    Runs in the background after the stream completes.
    Parses the fully accumulated JSON and uploads it to Supabase.
    """
    if not config.supabase_url or not config.supabase_service_key:
        logger.info("[DB SYNC] No Supabase credentials, skipping sync")
        return

    supabase = SupabaseSyncClient(config.supabase_url, config.supabase_service_key)

    try:
        parsed_json = json.loads(raw_json_str)
        field_confidence = parsed_json.pop("field_confidence", {})
    except json.JSONDecodeError as e:
        logger.error(f"[DB SYNC] Failed to decode final JSON for Supabase: {e}")
        try:
            supabase.upsert_rows("candidate_registration_drafts", [{
                "user_id": user_id,
                "parse_status": "failed",
                "parse_error": f"JSON decode error: {e}",
            }], on_conflict="user_id")
        except Exception as db_err:
            logger.error(f"[DB SYNC] Failed to mark draft as failed: {db_err}")
        return

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

    if _concurrency_sem.locked() and _concurrency_sem._value == 0:  # noqa: SLF001
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Server busy, please retry shortly",
        )

    # Dynamic config picking up os.environ variables
    config = WorkerConfig.from_env()

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
        loop = asyncio.get_event_loop()
        document_text = await loop.run_in_executor(None, parse_document, source)

    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.remove(tmp_path)

    # 2. Build Prompt (Re-using original logic but with extended schema)
    prompt = _structured_prompt(document_text)
    system_prompt = build_extended_system_prompt()

    payload = {
        "model": config.extraction_model or "gemini-3.5-flash",
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": json.dumps(prompt)},
        ],
        "temperature": 0,
        "stream": True,
        "response_format": {"type": "json_object"},
    }

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {config.model_api_key}",
    }
    url = f"{config.model_base_url.rstrip('/')}/chat/completions"

    # 3. Stream LLM Response (Natively Async)
    async def stream_generator():
        collected_content = []
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                async with client.stream("POST", url, json=payload, headers=headers) as response:
                    if response.status_code != 200:
                        error_text = await response.aread()
                        yield f"Error: {response.status_code} - {error_text.decode('utf-8')}"
                        return

                    async for line in response.aiter_lines():
                        if line.startswith("data: "):
                            data_str = line[6:]
                            if data_str == "[DONE]":
                                break
                            try:
                                chunk = json.loads(data_str)
                                if 'choices' in chunk and len(chunk['choices']) > 0:
                                    delta = chunk['choices'][0].get('delta', {})
                                    content = delta.get('content', '')
                                    if content:
                                        collected_content.append(content)
                                        yield content
                            except json.JSONDecodeError:
                                pass
        finally:
            full_json = "".join(collected_content)
            # Add database save task to run seamlessly after user closes stream
            background_tasks.add_task(
                sync_to_supabase_background,
                user_id=user_id,
                file_name=file.filename or "cv",
                mime_type=detected_mime_type,
                raw_json_str=full_json,
                config=config
            )

    return StreamingResponse(stream_generator(), media_type="text/event-stream")
