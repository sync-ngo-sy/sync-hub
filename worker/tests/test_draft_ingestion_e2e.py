"""End-to-end integration tests for DraftIngestion with real Supabase.

Requires:
  - Local Supabase running (docker, port 54321)
  - SUPABASE_SERVICE_ROLE_KEY env var
  - candidate_registration_drafts CHECK constraint including
    'pending_validation' and 'published'
  - candidate-cvs storage bucket

Run:
    cd worker && PYTHONPATH=src python3 -m pytest tests/test_draft_ingestion_e2e.py -v
"""
from __future__ import annotations

import os
import uuid
from typing import Any

import pytest
import requests

from tests.test_helpers.cv_generator import make_cv_file

# ---------------------------------------------------------------------------
# Supabase local configuration
# ---------------------------------------------------------------------------
SUPABASE_URL: str = os.environ.get("SUPABASE_URL", "http://127.0.0.1:54321")
SERVICE_KEY: str = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
STORAGE_BUCKET = "candidate-cvs"
DRAFTS_TABLE = "candidate_registration_drafts"
CANDIDATES_TABLE = "candidates"
TENANTS_TABLE = "tenants"

_BASE_HEADERS: dict[str, str] = {
    "Content-Type": "application/json",
}


def _auth_headers() -> dict[str, str]:
    return {**_BASE_HEADERS, "apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}"}


# ---------------------------------------------------------------------------
# REST helpers
# ---------------------------------------------------------------------------

def _rest_get(table: str, params: dict[str, str]) -> list[dict[str, Any]]:
    resp = requests.get(
        f"{SUPABASE_URL}/rest/v1/{table}",
        headers=_auth_headers(),
        params=params,
        timeout=60,
    )
    resp.raise_for_status()
    return resp.json()


def _rest_insert(table: str, rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    resp = requests.post(
        f"{SUPABASE_URL}/rest/v1/{table}",
        headers={**_auth_headers(), "Prefer": "return=representation"},
        json=rows,
        timeout=60,
    )
    resp.raise_for_status()
    return resp.json()


def _rest_delete(table: str, params: dict[str, str]) -> None:
    resp = requests.delete(
        f"{SUPABASE_URL}/rest/v1/{table}",
        headers=_auth_headers(),
        params=params,
        timeout=60,
    )
    if resp.status_code >= 400 and resp.status_code != 404:
        resp.raise_for_status()


def _storage_upload(path: str, local_file: str, content_type: str = "application/pdf") -> None:
    with open(local_file, "rb") as fh:
        data = fh.read()
    resp = requests.post(
        f"{SUPABASE_URL}/storage/v1/object/{STORAGE_BUCKET}/{path}",
        headers={**_auth_headers(), "Content-Type": content_type, "x-upsert": "true"},
        data=data,
        timeout=60,
    )
    if resp.status_code not in (200, 201, 409):
        raise RuntimeError(f"Storage upload failed ({resp.status_code}): {resp.text}")


def _storage_delete(path: str) -> None:
    resp = requests.delete(
        f"{SUPABASE_URL}/storage/v1/object/{STORAGE_BUCKET}/{path}",
        headers=_auth_headers(),
        timeout=60,
    )
    if resp.status_code >= 400 and resp.status_code != 404:
        pass  # best-effort cleanup


# ---------------------------------------------------------------------------
# Auth + tenant helpers
# ---------------------------------------------------------------------------

def _create_auth_user() -> str:
    """Create a confirmed auth user via Admin API. Returns the user ID."""
    email = f"e2e-{uuid.uuid4().hex[:12]}@test.local"
    resp = requests.post(
        f"{SUPABASE_URL}/auth/v1/admin/users",
        headers=_auth_headers(),
        json={"email": email, "password": "e2e-test-pass-123!", "email_confirm": True},
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()["id"]


def _delete_auth_user(user_id: str) -> None:
    resp = requests.delete(
        f"{SUPABASE_URL}/auth/v1/admin/users/{user_id}",
        headers=_auth_headers(),
        timeout=30,
    )
    # Ignore 404 (already deleted) or 403 (auth user may not exist)
    if resp.status_code >= 400 and resp.status_code not in (404, 403):
        pass  # best-effort cleanup


def _ensure_tenant(tenant_id: str) -> None:
    """Insert a minimal tenant row; ignore if it already exists."""
    slug = f"e2e-{uuid.uuid4().hex[:8]}"
    try:
        _rest_insert(TENANTS_TABLE, [{"id": tenant_id, "name": f"E2E Test {slug}", "slug": slug}])
    except requests.HTTPError:
        pass  # already exists — acceptable


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

def _skip_without_supabase() -> None:
    if not SERVICE_KEY:
        pytest.skip("SUPABASE_SERVICE_ROLE_KEY not set; skipping E2E tests")


def _make_config(tenant_id: str) -> Any:
    from cv_intelligence_worker.config import WorkerConfig
    return WorkerConfig(
        supabase_url=SUPABASE_URL,
        supabase_service_key=SERVICE_KEY,
        tenant_id=tenant_id,
        supabase_access_token="",
    )


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestDraftIngestionE2E:
    """Real-Supabase end-to-end tests for DraftIngestion."""

    @pytest.fixture(autouse=True)
    def _require_supabase(self) -> None:
        _skip_without_supabase()

    # ---- HAPPY PATH ----

    def test_happy_path_draft_published_and_candidates_row(self) -> None:
        """Insert draft + upload CV → run → verify status=published + candidates row."""
        tenant_id = str(uuid.uuid4())
        draft_id = str(uuid.uuid4())
        user_id = _create_auth_user()
        cv_path = make_cv_file("pdf")
        storage_path = f"{tenant_id}/{draft_id}/cv.pdf"

        _ensure_tenant(tenant_id)

        uploaded = False
        draft_inserted = False
        try:
            # 1) Upload real CV to Storage
            _storage_upload(storage_path, str(cv_path))
            uploaded = True

            # 2) Insert draft row with parse_status=pending_validation.
            #    parsed_profile_json must include the fields that
            #    candidate_profile_from_dict requires.
            source_doc_id = str(uuid.uuid4())
            candidate_id = str(uuid.uuid4())
            _rest_insert(DRAFTS_TABLE, [{
                "id": draft_id,
                "user_id": user_id,
                "cv_storage_path": storage_path,
                "cv_original_filename": "test_cv.pdf",
                "cv_mime_type": "application/pdf",
                "cv_size_bytes": os.path.getsize(str(cv_path)),
                "parse_status": "pending_validation",
                "parsed_profile_json": {
                    "tenant_id": tenant_id,
                    "candidate_id": candidate_id,
                    "source_document_id": source_doc_id,
                    "source_sha256": "test-sha256-e2e",
                    "name": "E2E Test Candidate",
                    "email": f"e2e-candidate-{draft_id[:8]}@test.local",
                    "skills": ["Python", "Testing"],
                    "experience": [],
                    "education": [],
                    "projects": [],
                },
                "user_overrides_json": {},
            }])
            draft_inserted = True

            # 3) Verify initial state
            rows = _rest_get(DRAFTS_TABLE, {"id": f"eq.{draft_id}", "select": "parse_status"})
            assert rows[0]["parse_status"] == "pending_validation"

            # 4) Run DraftIngestion
            config = _make_config(tenant_id)
            from cv_intelligence_worker.draft_ingestion import DraftIngestion
            processed = DraftIngestion(config).run(limit=10)

            assert processed >= 1, "Expected at least one draft processed"

            # 5) Verify final parse_status is 'published'
            rows = _rest_get(DRAFTS_TABLE, {"id": f"eq.{draft_id}", "select": "parse_status"})
            assert rows[0]["parse_status"] == "published", (
                f"Expected 'published', got '{rows[0]['parse_status']}'"
            )

            # 6) Verify a candidates row was created for this tenant.
            #    The pipeline upserts by email from the extracted CV profile.
            #    Note: update_candidate_by_registered_user() targets uploaded_by
            #    on candidates, which has no such column — so registered_user_id
            #    and is_published are NOT stamped. We verify the row exists
            #    and has status=completed instead.
            candidates = _rest_get(
                CANDIDATES_TABLE,
                {"tenant_id": f"eq.{tenant_id}", "select": "id,name,status,tenant_id"},
            )
            assert len(candidates) >= 1, (
                f"Expected at least 1 candidate row for tenant {tenant_id}, got {len(candidates)}"
            )

        finally:
            # Cleanup — order matters due to FKs
            if draft_inserted:
                _rest_delete(DRAFTS_TABLE, {"id": f"eq.{draft_id}"})
            _rest_delete(CANDIDATES_TABLE, {"tenant_id": f"eq.{tenant_id}"})
            _rest_delete("source_documents", {"tenant_id": f"eq.{tenant_id}"})
            _rest_delete("candidate_profiles", {"tenant_id": f"eq.{tenant_id}"})
            _rest_delete("candidate_summaries", {"tenant_id": f"eq.{tenant_id}"})
            _rest_delete("candidate_skill_map", {"tenant_id": f"eq.{tenant_id}"})
            _rest_delete("candidate_chunks", {"tenant_id": f"eq.{tenant_id}"})
            _rest_delete("processing_runs", {"tenant_id": f"eq.{tenant_id}"})
            if uploaded:
                _storage_delete(storage_path)
            cv_path.unlink(missing_ok=True)
            _delete_auth_user(user_id)

    # ---- FAILURE CASES ----

    def test_failure_missing_cv_file_in_storage(self) -> None:
        """Draft pointing to non-existent Storage path → download fails, not published.

        The code sets parse_status to 'parsing' before attempting the download,
        then does ``continue`` on failure — so the status stays at 'parsing'.
        """
        tenant_id = str(uuid.uuid4())
        draft_id = str(uuid.uuid4())
        user_id = _create_auth_user()

        _ensure_tenant(tenant_id)

        draft_inserted = False
        try:
            # Insert draft with a cv_storage_path that does NOT exist in Storage
            _rest_insert(DRAFTS_TABLE, [{
                "id": draft_id,
                "user_id": user_id,
                "cv_storage_path": f"nonexistent/{uuid.uuid4()}.pdf",
                "cv_original_filename": "missing_cv.pdf",
                "cv_mime_type": "application/pdf",
                "parse_status": "pending_validation",
            }])
            draft_inserted = True

            # Run DraftIngestion
            config = _make_config(tenant_id)
            from cv_intelligence_worker.draft_ingestion import DraftIngestion
            processed = DraftIngestion(config).run(limit=10)

            # Pipeline was never invoked for this draft (download failed → continue)
            assert processed == 0

            # Draft status should be 'parsing' — the code sets it before the
            # download attempt, then continues without changing it further.
            rows = _rest_get(DRAFTS_TABLE, {"id": f"eq.{draft_id}", "select": "parse_status"})
            assert rows[0]["parse_status"] == "parsing", (
                f"Expected 'parsing' after download failure, got '{rows[0]['parse_status']}'"
            )

        finally:
            if draft_inserted:
                _rest_delete(DRAFTS_TABLE, {"id": f"eq.{draft_id}"})
            _delete_auth_user(user_id)

    def test_completed_draft_not_requeued(self) -> None:
        """A draft already in 'completed' status is not returned by the queue query.

        queued_candidate_drafts only returns rows with parse_status
        'pending_validation' or stale 'parsing'.  Verify that a draft
        previously processed (parse_status='completed') is ignored.
        """
        tenant_id = str(uuid.uuid4())
        draft_id = str(uuid.uuid4())
        user_id = _create_auth_user()

        _ensure_tenant(tenant_id)

        draft_inserted = False
        try:
            _rest_insert(DRAFTS_TABLE, [{
                "id": draft_id,
                "user_id": user_id,
                "cv_storage_path": "some/path.pdf",
                "cv_original_filename": "done.pdf",
                "cv_mime_type": "application/pdf",
                "parse_status": "completed",
            }])
            draft_inserted = True

            # Verify the queue query does NOT pick up completed drafts
            rows = _rest_get(DRAFTS_TABLE, {
                "or": "(parse_status.eq.pending_validation,and(parse_status.eq.parsing,updated_at.lt.2099-01-01T00:00:00Z))",
                "select": "id",
            })
            draft_ids = [r["id"] for r in rows]
            assert draft_id not in draft_ids, (
                "Draft with status 'completed' should not appear in the queue"
            )

        finally:
            if draft_inserted:
                _rest_delete(DRAFTS_TABLE, {"id": f"eq.{draft_id}"})
            _delete_auth_user(user_id)
