from __future__ import annotations

import io
import urllib.error
from pathlib import Path
from unittest.mock import MagicMock

import pytest

from cv_intelligence_worker.config import WorkerConfig
from cv_intelligence_worker.integrations.supabase.storage import SupabaseStorageClient


def _config() -> WorkerConfig:
    return WorkerConfig(
        supabase_url="https://example.supabase.co/",
        supabase_service_key="header.payload.signature",
        request_timeout_seconds=19,
    )


def _response(data: bytes = b"") -> MagicMock:
    response = MagicMock()
    response.read.return_value = data
    response.__enter__.return_value = response
    return response


def test_upload_sends_file_bytes_with_storage_headers(tmp_path: Path) -> None:
    source = tmp_path / "resume.pdf"
    source.write_bytes(b"pdf-content")
    opener = MagicMock(return_value=_response())
    storage = SupabaseStorageClient(_config(), opener=opener)

    storage.upload_file("resumes", "tenant 1/resume.pdf", str(source), "application/pdf")

    request = opener.call_args.args[0]
    assert opener.call_args.kwargs == {"timeout": 19}
    assert request.full_url.endswith("/resumes/tenant%201/resume.pdf")
    assert request.get_method() == "POST"
    assert request.data == b"pdf-content"
    assert request.get_header("Content-type") == "application/pdf"
    assert request.get_header("X-upsert") == "true"
    assert request.get_header("Authorization") == "Bearer header.payload.signature"


def test_upload_treats_conflict_as_idempotent_success(tmp_path: Path) -> None:
    source = tmp_path / "resume.pdf"
    source.write_bytes(b"pdf-content")
    error = urllib.error.HTTPError("https://example.test", 409, "Conflict", {}, None)
    storage = SupabaseStorageClient(_config(), opener=MagicMock(side_effect=error))

    storage.upload_file("resumes", "resume.pdf", str(source), "application/pdf")


def test_upload_translates_non_conflict_errors(tmp_path: Path) -> None:
    source = tmp_path / "resume.pdf"
    source.write_bytes(b"pdf-content")
    error = urllib.error.HTTPError(
        "https://example.test",
        500,
        "Internal Server Error",
        {},
        io.BytesIO(b"upload unavailable"),
    )
    storage = SupabaseStorageClient(_config(), opener=MagicMock(side_effect=error))

    with pytest.raises(RuntimeError, match="storage upload failed .*upload unavailable"):
        storage.upload_file("resumes", "resume.pdf", str(source), "application/pdf")


def test_download_writes_response_to_target(tmp_path: Path) -> None:
    opener = MagicMock(return_value=_response(b"pdf-content"))
    storage = SupabaseStorageClient(_config(), opener=opener)
    target = tmp_path / "nested" / "resume.pdf"

    storage.download_file("resumes", "tenant 1/resume.pdf", str(target))

    request = opener.call_args.args[0]
    assert request.get_method() == "GET"
    assert request.get_header("Accept") == "application/octet-stream"
    assert target.read_bytes() == b"pdf-content"


def test_download_translates_http_errors_without_writing_target(tmp_path: Path) -> None:
    error = urllib.error.HTTPError(
        "https://example.test",
        404,
        "Not Found",
        {},
        io.BytesIO(b"object missing"),
    )
    storage = SupabaseStorageClient(_config(), opener=MagicMock(side_effect=error))
    target = tmp_path / "resume.pdf"

    with pytest.raises(RuntimeError, match="storage download failed .*object missing"):
        storage.download_file("resumes", "resume.pdf", str(target))

    assert not target.exists()
