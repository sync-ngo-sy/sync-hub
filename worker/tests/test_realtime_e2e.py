"""End-to-end integration tests for /api/v1/parse-cv-fast.

Requires running infrastructure:
  - Local Supabase (Docker): http://127.0.0.1:54321
  - Real LLM: GEMINI_API_KEY or CV_MODEL_BASE_URL + CV_EXTRACTION_MODEL
  - API key: WORKER_API_KEY (or API_KEY) env var set

Run: cd worker && python3 -m pytest tests/test_realtime_e2e.py -v --timeout=180
"""
from __future__ import annotations

import os
import tempfile
import time
import uuid
from typing import Final
from unittest.mock import patch

import httpx
import pytest
from fastapi.testclient import TestClient

from realtime_extractor import app

# ---------------------------------------------------------------------------
# Configuration from env
# ---------------------------------------------------------------------------
SUPABASE_URL: Final = os.environ.get("SUPABASE_URL", "http://127.0.0.1:54321")
SUPABASE_SERVICE_ROLE_KEY: Final = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

# Must match the env vars WorkerConfig.from_env() reads for api_key
_API_KEY: Final = os.environ.get(
    "WORKER_API_KEY",
    os.environ.get("API_KEY", ""),
)

_HAS_API_KEY: Final = bool(_API_KEY)
_HAS_SUPABASE: Final = bool(SUPABASE_SERVICE_ROLE_KEY)
_HAS_LLM: Final = bool(
    os.environ.get("GEMINI_API_KEY")
    or os.environ.get("CV_MODEL_API_KEY")
    or os.environ.get("CV_MODEL_BASE_URL")
)

# ---------------------------------------------------------------------------
# TestClient — raise_server_exceptions=False so HTTP errors surface as status codes
# ---------------------------------------------------------------------------
client = TestClient(app, raise_server_exceptions=False)


# ---------------------------------------------------------------------------
# Fixtures & helpers
# ---------------------------------------------------------------------------
@pytest.fixture(autouse=True)
def _disable_rate_limit():
    """Bypass per-key rate limiter so rapid test calls don't 429."""
    with patch("realtime_extractor._check_rate_limit"):
        yield


def _unique_user_id() -> str:
    """Generate a fresh UUID per test to avoid collisions."""
    return str(uuid.uuid4())


def _supabase_headers() -> dict[str, str]:
    """Headers for Supabase REST API calls using service-role key."""
    return {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
    }


def _query_draft(user_id: str) -> dict | None:
    """Query candidate_registration_drafts for a given user_id via REST."""
    if not SUPABASE_SERVICE_ROLE_KEY:
        pytest.skip("SUPABASE_SERVICE_ROLE_KEY not set — cannot verify DB state")
    url = f"{SUPABASE_URL}/rest/v1/candidate_registration_drafts"
    params = {"user_id": f"eq.{user_id}", "select": "parse_status,parsed_profile_json"}
    resp = httpx.get(url, params=params, headers=_supabase_headers(), timeout=10.0)
    resp.raise_for_status()
    rows: list[dict] = resp.json()
    return rows[0] if rows else None


def _cleanup_draft(user_id: str) -> None:
    """Delete draft row to avoid test data leaking."""
    if not SUPABASE_SERVICE_ROLE_KEY:
        return
    url = f"{SUPABASE_URL}/rest/v1/candidate_registration_drafts"
    params = {"user_id": f"eq.{user_id}"}
    httpx.delete(url, params=params, headers=_supabase_headers(), timeout=10.0)


def _create_auth_user() -> str:
    """Create a confirmed auth user via Admin API. Returns the user ID."""
    email = f"e2e-realtime-{uuid.uuid4().hex[:12]}@test.local"
    resp = httpx.post(
        f"{SUPABASE_URL}/auth/v1/admin/users",
        headers=_supabase_headers(),
        json={"email": email, "password": "e2e-test-pass-123!", "email_confirm": True},
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()["id"]


def _delete_auth_user(user_id: str) -> None:
    resp = httpx.delete(
        f"{SUPABASE_URL}/auth/v1/admin/users/{user_id}",
        headers=_supabase_headers(),
        timeout=30,
    )
    if resp.status_code >= 400 and resp.status_code not in (404, 403):
        pass  # best-effort cleanup


def _auth_headers(api_key: str | None = None) -> dict[str, str]:
    """Build X-API-Key header. Falls back to _API_KEY from env."""
    return {"X-API-Key": api_key if api_key is not None else _API_KEY}


# Skip decorators for test classes that need infrastructure
_skip_no_auth = pytest.mark.skipif(not _HAS_API_KEY, reason="WORKER_API_KEY not set")
_skip_no_supabase = pytest.mark.skipif(not _HAS_SUPABASE, reason="SUPABASE_SERVICE_ROLE_KEY not set")
_skip_no_llm = pytest.mark.skipif(not _HAS_LLM, reason="No LLM key configured (GEMINI_API_KEY / CV_MODEL_BASE_URL)")
_skip_no_e2e = pytest.mark.skipif(
    not (_HAS_API_KEY and _HAS_SUPABASE and _HAS_LLM),
    reason="E2E requires WORKER_API_KEY + SUPABASE_SERVICE_ROLE_KEY + LLM key",
)


# ---------------------------------------------------------------------------
# Happy-path tests — need real LLM, Supabase, and API key
# ---------------------------------------------------------------------------
@_skip_no_e2e
class TestParseCvFastHappyPath:
    """Successful uploads return streaming JSON and sync to Supabase."""

    def test_pdf_cv_returns_completed_draft(self):
        """Given a valid PDF CV and correct API key,
        When the endpoint streams extraction results,
        Then Supabase has parse_status=completed with profile data."""
        from tests.test_helpers.cv_generator import make_cv_file

        user_id = _create_auth_user()
        cv_path = make_cv_file("pdf")
        try:
            with open(cv_path, "rb") as f:
                response = client.post(
                    "/api/v1/parse-cv-fast",
                    files={"file": ("cv.pdf", f, "application/pdf")},
                    data={"user_id": user_id},
                    headers=_auth_headers(),
                )

            assert response.status_code == 200, response.text

            # Consume the stream — triggers background sync_to_supabase_background
            body = response.text
            assert len(body) > 0, "Streaming response was empty"

            # Allow background task to complete DB upsert
            time.sleep(3)

            draft = _query_draft(user_id)
            assert draft is not None, "No draft row found in Supabase"
            assert draft["parse_status"] == "completed"
            profile = draft["parsed_profile_json"]
            assert isinstance(profile, dict)
            assert "name" in profile
        finally:
            _cleanup_draft(user_id)
            _delete_auth_user(user_id)
            if os.path.exists(cv_path):
                os.unlink(cv_path)

    def test_docx_cv_returns_completed_draft(self):
        """Given a valid DOCX CV and correct API key,
        When the endpoint streams extraction results,
        Then Supabase has parse_status=completed with profile data."""
        from tests.test_helpers.cv_generator import make_cv_file

        user_id = _create_auth_user()
        cv_path = make_cv_file("docx")
        try:
            with open(cv_path, "rb") as f:
                response = client.post(
                    "/api/v1/parse-cv-fast",
                    files={
                        "file": (
                            "cv.docx",
                            f,
                            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                        )
                    },
                    data={"user_id": user_id},
                    headers=_auth_headers(),
                )

            assert response.status_code == 200, response.text
            body = response.text
            assert len(body) > 0

            time.sleep(3)

            draft = _query_draft(user_id)
            assert draft is not None, "No draft row found in Supabase"
            assert draft["parse_status"] == "completed"
            profile = draft["parsed_profile_json"]
            assert isinstance(profile, dict)
            assert "name" in profile
        finally:
            _cleanup_draft(user_id)
            _delete_auth_user(user_id)
            if os.path.exists(cv_path):
                os.unlink(cv_path)


# ---------------------------------------------------------------------------
# Failure-path tests
# ---------------------------------------------------------------------------
class TestParseCvFastFailures:
    """Invalid inputs are rejected before any LLM call or DB write."""

    def test_invalid_api_key_returns_403(self):
        """Given a wrong API key,
        When the endpoint is called,
        Then it returns 403 Forbidden."""
        from tests.test_helpers.cv_generator import make_cv_file

        cv_path = make_cv_file("pdf")
        try:
            with open(cv_path, "rb") as f:
                response = client.post(
                    "/api/v1/parse-cv-fast",
                    files={"file": ("cv.pdf", f, "application/pdf")},
                    data={"user_id": str(uuid.uuid4())},
                    headers=_auth_headers("wrong-api-key-12345"),
                )
            assert response.status_code == 403
            detail = response.json()["detail"]
            assert "Invalid API Key" in detail
        finally:
            if os.path.exists(cv_path):
                os.unlink(cv_path)

    @_skip_no_auth
    def test_non_uuid_user_id_returns_400(self):
        """Given a non-UUID user_id string,
        When the endpoint is called,
        Then it returns 400 Bad Request."""
        from tests.test_helpers.cv_generator import make_cv_file

        cv_path = make_cv_file("pdf")
        try:
            with open(cv_path, "rb") as f:
                response = client.post(
                    "/api/v1/parse-cv-fast",
                    files={"file": ("cv.pdf", f, "application/pdf")},
                    data={"user_id": "not-a-uuid-value"},
                    headers=_auth_headers(),
                )
            assert response.status_code == 400
            detail = response.json()["detail"]
            assert "Invalid user_id" in detail
        finally:
            if os.path.exists(cv_path):
                os.unlink(cv_path)

    @_skip_no_auth
    def test_png_file_returns_400(self):
        """Given a PNG image file,
        When the endpoint is called,
        Then it returns 400 with invalid file type message."""
        user_id = _unique_user_id()
        with tempfile.NamedTemporaryFile(delete=False, suffix=".png") as tmp:
            # Minimal PNG: magic bytes + padding
            tmp.write(b"\x89PNG\r\n\x1a\n" + b"\x00" * 100)
            tmp.flush()
            tmp_path = tmp.name
        try:
            with open(tmp_path, "rb") as f:
                response = client.post(
                    "/api/v1/parse-cv-fast",
                    files={"file": ("photo.png", f, "image/png")},
                    data={"user_id": user_id},
                    headers=_auth_headers(),
                )
            assert response.status_code == 400
            detail = response.json()["detail"]
            assert "Invalid file type" in detail
        finally:
            os.unlink(tmp_path)

    @_skip_no_auth
    def test_oversized_file_returns_413(self):
        """Given a file exceeding the 5MB limit,
        When the endpoint is called,
        Then it returns 413 Request Entity Too Large."""
        user_id = _unique_user_id()
        with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
            # 5.1 MB of valid PDF magic + padding
            oversized_content = b"%PDF-1.7\n" + b"\x00" * (5 * 1024 * 1024 + 100)
            tmp.write(oversized_content)
            tmp.flush()
            tmp_path = tmp.name
        try:
            with open(tmp_path, "rb") as f:
                response = client.post(
                    "/api/v1/parse-cv-fast",
                    files={"file": ("big_cv.pdf", f, "application/pdf")},
                    data={"user_id": user_id},
                    headers=_auth_headers(),
                )
            assert response.status_code == 413
            detail = response.json()["detail"]
            assert "File too large" in detail
        finally:
            os.unlink(tmp_path)
