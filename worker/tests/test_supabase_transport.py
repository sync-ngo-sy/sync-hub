from __future__ import annotations

import io
import json
import urllib.error
from unittest.mock import MagicMock

import pytest

from cv_intelligence_worker.config import WorkerConfig
from cv_intelligence_worker.integrations.supabase.transport import SupabaseRestTransport


def _config() -> WorkerConfig:
    return WorkerConfig(
        supabase_url="https://example.supabase.co/",
        supabase_service_key="header.payload.signature",
        request_timeout_seconds=17,
    )


def test_request_serializes_sanitized_json_and_returns_headers() -> None:
    response = MagicMock()
    response.read.return_value = b'{"id":"candidate-1"}'
    response.headers.items.return_value = [("Content-Range", "0-0/1")]
    response.__enter__.return_value = response
    opener = MagicMock(return_value=response)
    transport = SupabaseRestTransport(_config(), opener=opener)

    result, headers = transport.request_with_headers(
        "POST",
        "/rest/v1/candidates",
        data={"name": "Ada\x00 Lovelace"},
        headers={"Prefer": "return=representation"},
    )

    request = opener.call_args.args[0]
    assert opener.call_args.kwargs == {"timeout": 17}
    assert request.full_url == "https://example.supabase.co/rest/v1/candidates"
    assert request.get_method() == "POST"
    assert json.loads(request.data) == {"name": "Ada Lovelace"}
    assert request.get_header("Authorization") == "Bearer header.payload.signature"
    assert request.get_header("Prefer") == "return=representation"
    assert result == {"id": "candidate-1"}
    assert headers == {"Content-Range": "0-0/1"}


def test_request_translates_http_errors_with_request_context() -> None:
    error = urllib.error.HTTPError(
        "https://example.supabase.co/rest/v1/candidates",
        503,
        "Service Unavailable",
        {},
        io.BytesIO(b'{"message":"temporarily unavailable"}'),
    )
    transport = SupabaseRestTransport(_config(), opener=MagicMock(side_effect=error))

    with pytest.raises(
        RuntimeError,
        match=r'Supabase GET /rest/v1/candidates failed \(503\): .*temporarily unavailable',
    ):
        transport.request("GET", "/rest/v1/candidates")
