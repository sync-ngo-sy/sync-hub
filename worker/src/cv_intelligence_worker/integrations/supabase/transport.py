from __future__ import annotations

import json
import urllib.error
import urllib.request
from collections.abc import Callable
from typing import Any, Protocol

from ...config import WorkerConfig
from ...core.http import urlopen
from ...core.sanitization import strip_nul_bytes
from .helpers import is_jwt


class SupabaseRequest(Protocol):
    def __call__(
        self,
        method: str,
        path: str,
        *,
        data: Any | None = None,
        headers: dict[str, str] | None = None,
    ) -> Any: ...


class SupabaseRequestWithHeaders(Protocol):
    def __call__(
        self,
        method: str,
        path: str,
        *,
        data: Any | None = None,
        headers: dict[str, str] | None = None,
    ) -> tuple[Any, dict[str, str]]: ...


def build_supabase_headers(
    config: WorkerConfig,
    extra: dict[str, str] | None = None,
) -> dict[str, str]:
    api_key = config.supabase_api_key()
    bearer_token = config.supabase_bearer_token()
    headers = {
        "apikey": api_key,
        "Content-Type": "application/json",
        "User-Agent": config.user_agent,
    }
    if is_jwt(bearer_token):
        headers["Authorization"] = f"Bearer {bearer_token}"
    if extra:
        headers.update(extra)
    return headers


class SupabaseRestTransport:
    def __init__(
        self,
        config: WorkerConfig,
        *,
        opener: Callable[..., Any] | None = None,
    ) -> None:
        self._config = config
        self._base_url = config.supabase_url.rstrip("/")
        self._opener = opener or urlopen

    def headers(self, extra: dict[str, str] | None = None) -> dict[str, str]:
        return build_supabase_headers(self._config, extra)

    def request_with_headers(
        self,
        method: str,
        path: str,
        *,
        data: Any | None = None,
        headers: dict[str, str] | None = None,
    ) -> tuple[Any, dict[str, str]]:
        body = None
        if data is not None:
            body = json.dumps(strip_nul_bytes(data)).encode("utf-8")
        request = urllib.request.Request(
            f"{self._base_url}{path}",
            data=body,
            headers=self.headers(headers),
            method=method,
        )
        try:
            with self._opener(
                request,
                timeout=self._config.request_timeout_seconds,
            ) as response:
                content = response.read().decode("utf-8")
                response_headers = dict(response.headers.items())
        except urllib.error.HTTPError as exc:
            content = exc.read().decode("utf-8", errors="replace")
            message = content or exc.reason
            raise RuntimeError(
                f"Supabase {method} {path} failed ({exc.code}): {message}"
            ) from exc
        return (json.loads(content) if content else None), response_headers

    def request(
        self,
        method: str,
        path: str,
        *,
        data: Any | None = None,
        headers: dict[str, str] | None = None,
    ) -> Any:
        result, _headers = self.request_with_headers(
            method,
            path,
            data=data,
            headers=headers,
        )
        return result
