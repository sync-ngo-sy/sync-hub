"""Compare extraction output from the normal ingestion path vs the realtime path.

Uses the SAME deterministic CV file (from the CV generator) for both paths
and compares field-by-field to ensure the two extraction pipelines produce
consistent results.

Path A (normal): Calls IngestionPipeline.ingest_paths() with sync_to_supabase=False,
  captures the CandidateProfile from the ArtifactBundle.
Path B (realtime): Uploads via FastAPI TestClient to /api/v1/parse-cv-fast,
  captures the streamed JSON response body.

Requires running infrastructure:
  - Local Supabase (Docker): http://127.0.0.1:54321
  - Real LLM: GEMINI_API_KEY or CV_MODEL_BASE_URL + CV_EXTRACTION_MODEL
  - API key: WORKER_API_KEY (or API_KEY) env var set

Run:
    cd worker && PYTHONPATH=src python3 -m pytest tests/test_output_comparison.py -v
"""
from __future__ import annotations

import json
import os
import uuid
from typing import Any, Final
from unittest.mock import patch

import httpx
import pytest
from fastapi.testclient import TestClient

from cv_intelligence_worker.realtime_extractor import app
from tests.test_helpers.cv_generator import EXPECTED_PROFILE, make_cv_file

# ---------------------------------------------------------------------------
# Configuration from env
# ---------------------------------------------------------------------------
SUPABASE_URL: Final = os.environ.get("SUPABASE_URL", "http://127.0.0.1:54321")
SUPABASE_SERVICE_ROLE_KEY: Final = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

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

_skip_no_e2e = pytest.mark.skipif(
    not (_HAS_API_KEY and _HAS_SUPABASE and _HAS_LLM),
    reason="E2E requires WORKER_API_KEY + SUPABASE_SERVICE_ROLE_KEY + LLM key",
)

# ---------------------------------------------------------------------------
# TestClient — raise_server_exceptions=False so HTTP errors surface as status codes
# ---------------------------------------------------------------------------
client = TestClient(app, raise_server_exceptions=False)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _auth_headers(api_key: str | None = None) -> dict[str, str]:
    return {"X-API-Key": api_key if api_key is not None else _API_KEY}


def _supabase_headers() -> dict[str, str]:
    return {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
    }


def _create_auth_user() -> str:
    email = f"e2e-compare-{uuid.uuid4().hex[:12]}@test.local"
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


def _cleanup_draft(user_id: str) -> None:
    if not SUPABASE_SERVICE_ROLE_KEY:
        return
    url = f"{SUPABASE_URL}/rest/v1/candidate_registration_drafts"
    params = {"user_id": f"eq.{user_id}"}
    httpx.delete(url, params=params, headers=_supabase_headers(), timeout=10.0)


# ---------------------------------------------------------------------------
# Normalization helpers — reduce both outputs to the comparable shape
# ---------------------------------------------------------------------------
def _normalize_profile(profile: dict[str, Any]) -> dict[str, Any]:
    """Normalize a CandidateProfile dict to the comparable field subset.

    Handles both the pipeline output (ExperienceEntry dataclass dicts) and
    the realtime output (raw LLM JSON with extended fields).
    """
    experience = []
    for exp in profile.get("experience") or []:
        experience.append({
            "company": exp.get("company") or "",
            "title": exp.get("title") or "",
        })

    skills_raw = profile.get("skills") or []
    if skills_raw and isinstance(skills_raw[0], dict):
        skills = sorted(s.get("name", "") for s in skills_raw)
    else:
        skills = sorted(str(s) for s in skills_raw)

    return {
        "name": profile.get("name") or "",
        "current_title": profile.get("current_title") or "",
        "skills": skills,
        "experience": sorted(experience, key=lambda e: e["company"]),
    }


def _compare_profiles(
    normal: dict[str, Any], realtime: dict[str, Any]
) -> tuple[list[str], list[str]]:
    """Compare two normalized profiles field by field.

    Returns (hard_diffs, info_diffs):
      - hard_diffs: mismatches that must match (name, current_title, experience)
      - info_diffs: informational differences such as extra extracted skills
    """
    hard: list[str] = []
    info: list[str] = []

    # --- Exact match fields ---
    for key in ("name", "current_title"):
        nv = normal[key]
        rv = realtime[key]
        if nv != rv:
            hard.append(f"{key}: normal={nv!r} vs realtime={rv!r}")

    # --- Skills: both must contain all expected core skills ---
    expected_skills = set(EXPECTED_PROFILE["skills"])
    normal_skills = set(normal["skills"])
    realtime_skills = set(realtime["skills"])

    missing_in_normal = expected_skills - normal_skills
    missing_in_realtime = expected_skills - realtime_skills
    if missing_in_normal:
        hard.append(f"skills missing from normal path: {sorted(missing_in_normal)}")
    if missing_in_realtime:
        hard.append(f"skills missing from realtime path: {sorted(missing_in_realtime)}")

    extra_in_normal = normal_skills - expected_skills
    extra_in_realtime = realtime_skills - expected_skills
    if extra_in_normal:
        info.append(f"extra skills in normal path: {sorted(extra_in_normal)}")
    if extra_in_realtime:
        info.append(f"extra skills in realtime path: {sorted(extra_in_realtime)}")

    # --- Experience: compare by company + title ---
    normal_exp = normal["experience"]
    realtime_exp = realtime["experience"]
    if len(normal_exp) != len(realtime_exp):
        hard.append(
            f"experience count: normal={len(normal_exp)} vs realtime={len(realtime_exp)}"
        )
    for i, (ne, re) in enumerate(zip(normal_exp, realtime_exp)):
        if ne["company"] != re["company"]:
            hard.append(
                f"experience[{i}].company: normal={ne['company']!r} vs realtime={re['company']!r}"
            )
        if ne["title"] != re["title"]:
            hard.append(
                f"experience[{i}].title: normal={ne['title']!r} vs realtime={re['title']!r}"
            )

    return hard, info


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------
@_skip_no_e2e
class TestOutputComparison:
    """Compare extraction output between normal ingestion and realtime paths.

    Both paths receive the SAME deterministic CV file and call the same LLM,
    so the core extracted fields (name, current_title, skills, experience)
    should be equivalent.
    """

    @pytest.fixture(autouse=True)
    def _disable_rate_limit(self):
        with patch("cv_intelligence_worker.realtime_extractor._check_rate_limit"):
            yield

    def test_normal_vs_realtime_same_cv(self):
        """Given the same deterministic CV file,
        When both normal ingestion and realtime parsing extract the profile,
        Then name, current_title, skills, and experience match field by field."""
        from cv_intelligence_worker.pipeline import IngestionPipeline

        tenant_id = str(uuid.uuid4())
        user_id = _create_auth_user()
        cv_path = make_cv_file("txt")
        try:
            # --- Path A: Normal ingestion pipeline ---
            from cv_intelligence_worker.config import WorkerConfig

            config = WorkerConfig()
            pipeline = IngestionPipeline(config=config)
            normal_result = pipeline.ingest_paths(
                inputs=[str(cv_path)],
                tenant_id=tenant_id,
                uploaded_by="comparison-test",
                sync_to_supabase=False,
            )

            assert normal_result.bundles, (
                "Normal pipeline produced no bundles — LLM extraction may have failed"
            )
            from cv_intelligence_worker.schema import dataclass_to_dict

            normal_profile = dataclass_to_dict(normal_result.bundles[0].profile)

            # --- Path B: Realtime FastAPI endpoint ---
            with open(cv_path, "rb") as f:
                response = client.post(
                    "/api/v1/parse-cv-fast",
                    files={"file": ("cv.txt", f, "text/plain")},
                    data={"user_id": user_id},
                    headers=_auth_headers(),
                )

            # Realtime endpoint only accepts PDF and DOCX via magic-byte check.
            # TXT files will be rejected with 400. In that case, retry with PDF.
            if response.status_code == 400:
                if os.path.exists(cv_path):
                    os.unlink(cv_path)
                cv_path = make_cv_file("pdf")
                with open(cv_path, "rb") as f:
                    response = client.post(
                        "/api/v1/parse-cv-fast",
                        files={"file": ("cv.pdf", f, "application/pdf")},
                        data={"user_id": user_id},
                        headers=_auth_headers(),
                    )

            assert response.status_code == 200, (
                f"Realtime endpoint returned {response.status_code}: {response.text}"
            )

            # Collect SSE chunks — the response body IS the streamed content
            realtime_text = response.text
            assert len(realtime_text) > 0, "Realtime response was empty"
            realtime_profile = json.loads(realtime_text)

            # --- Compare field by field ---
            norm_normal = _normalize_profile(normal_profile)
            norm_realtime = _normalize_profile(realtime_profile)

            hard_diffs, info_diffs = _compare_profiles(norm_normal, norm_realtime)

            # Informational diffs are logged
            # but do not fail the test — both paths extract the core expected skills.
            for info_msg in info_diffs:
                print(f"  info: {info_msg}")

            assert not hard_diffs, (
                "Critical extraction outputs differ between paths:\n"
                + "\n".join(f"  - {d}" for d in hard_diffs)
            )

            # --- Validate against ground truth ---
            assert norm_normal["name"] == EXPECTED_PROFILE["name"], (
                f"Normal path name mismatch: {norm_normal['name']!r} "
                f"vs expected {EXPECTED_PROFILE['name']!r}"
            )
            assert norm_realtime["name"] == EXPECTED_PROFILE["name"], (
                f"Realtime path name mismatch: {norm_realtime['name']!r} "
                f"vs expected {EXPECTED_PROFILE['name']!r}"
            )
        finally:
            _cleanup_draft(user_id)
            _delete_auth_user(user_id)
            if os.path.exists(cv_path):
                os.unlink(cv_path)
