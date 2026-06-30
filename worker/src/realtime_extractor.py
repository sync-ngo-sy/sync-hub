import os
import json
import tempfile
import asyncio
import logging
from pathlib import Path
from fastapi import FastAPI, UploadFile, File, Form, BackgroundTasks
from fastapi.responses import StreamingResponse
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
        
    try:
        parsed_json = json.loads(raw_json_str)
        # استخراج نسب الثقة لفصلها
        field_confidence = parsed_json.pop("field_confidence", {})
    except json.JSONDecodeError as e:
        logger.error(f"[DB SYNC] Failed to decode final JSON for Supabase: {e}")
        return
        
    supabase = SupabaseSyncClient(config.supabase_url, config.supabase_service_key)
    row = {
        "user_id": user_id,
        "cv_original_filename": file_name,
        "cv_mime_type": mime_type,
        "parsed_profile_json": parsed_json,
        "field_confidence_json": field_confidence,
        "parse_status": "completed",
    }
    
    try:
        supabase.upsert_rows("candidate_registration_drafts", [row], on_conflict="user_id")
        logger.info(f"[DB SYNC] Successfully synced profile draft for user: {user_id}")
    except Exception as e:
        logger.error(f"[DB SYNC] Failed to sync to Supabase: {e}")

@app.post("/api/v1/parse-cv-fast")
async def parse_cv_endpoint(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),  # noqa: B008
    user_id: str = Form(...)       # noqa: B008
):
    # Dynamic config picking up os.environ variables
    config = WorkerConfig.from_env()
    
    # 1. Parse Document (Using existing robust logic)
    suffix = Path(file.filename).suffix if file.filename else ".pdf"
    
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        source = DocumentSource(
            tenant_id="default",
            source_path=tmp_path,
            source_type="file",
            original_filename=file.filename or "cv",
            mime_type=file.content_type or "application/pdf",
            document_id="tmp",
            document_sha256="tmp",
            ingestion_run_id="tmp"
        )
        
        # Offload CPU-bound parsing to threadpool
        loop = asyncio.get_event_loop()
        document_text = await loop.run_in_executor(None, parse_document, source)
        
    finally:
        if os.path.exists(tmp_path):
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
                mime_type=file.content_type or "application/pdf",
                raw_json_str=full_json,
                config=config
            )

    return StreamingResponse(stream_generator(), media_type="text/event-stream")
