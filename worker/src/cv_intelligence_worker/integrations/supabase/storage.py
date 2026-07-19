from __future__ import annotations

import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Callable
from pathlib import Path
from typing import Any

from ...config import WorkerConfig
from ...core.http import urlopen
from .transport import build_supabase_headers


class SupabaseStorageClient:
    def __init__(
        self,
        config: WorkerConfig,
        *,
        opener: Callable[..., Any] | None = None,
    ) -> None:
        self._config = config
        self._base_url = config.supabase_url.rstrip("/")
        self._opener = opener or urlopen

    def upload_file(
        self,
        bucket: str,
        object_path: str,
        file_path: str,
        content_type: str,
    ) -> None:
        request = urllib.request.Request(
            self._object_url(bucket, object_path),
            data=Path(file_path).read_bytes(),
            headers=build_supabase_headers(
                self._config,
                {"Content-Type": content_type, "x-upsert": "true"},
            ),
            method="POST",
        )
        try:
            with self._opener(
                request,
                timeout=self._config.request_timeout_seconds,
            ):
                return
        except urllib.error.HTTPError as exc:
            if exc.code == 409:
                return
            content = exc.read().decode("utf-8", errors="replace")
            message = content or exc.reason
            raise RuntimeError(
                f"Supabase storage upload failed ({exc.code}): {message}"
            ) from exc

    def download_file(
        self,
        bucket: str,
        object_path: str,
        target_path: str,
    ) -> None:
        request = urllib.request.Request(
            self._object_url(bucket, object_path),
            headers=build_supabase_headers(
                self._config,
                {"Accept": "application/octet-stream"},
            ),
            method="GET",
        )
        try:
            with self._opener(
                request,
                timeout=self._config.request_timeout_seconds,
            ) as response:
                data = response.read()
        except urllib.error.HTTPError as exc:
            content = exc.read().decode("utf-8", errors="replace")
            message = content or exc.reason
            raise RuntimeError(
                f"Supabase storage download failed ({exc.code}): {message}"
            ) from exc
        path = Path(target_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)

    def _object_url(self, bucket: str, object_path: str) -> str:
        encoded_path = urllib.parse.quote(object_path)
        return f"{self._base_url}/storage/v1/object/{bucket}/{encoded_path}"
