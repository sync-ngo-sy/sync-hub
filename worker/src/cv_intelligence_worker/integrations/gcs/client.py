from __future__ import annotations

import json
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from ...config import WorkerConfig
from ...utils import urlopen


METADATA_TOKEN_URL = "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token"


class GcsJsonClient:
    def __init__(self, config: WorkerConfig) -> None:
        self.config = config
        self._access_token: str = ""
        self._expires_at: float = 0.0

    def _metadata_access_token(self) -> str:
        if self._access_token and self._expires_at - time.time() > 60:
            return self._access_token

        request = urllib.request.Request(METADATA_TOKEN_URL, headers={"Metadata-Flavor": "Google"}, method="GET")
        try:
            with urllib.request.urlopen(request, timeout=10) as response:
                payload = json.loads(response.read().decode("utf-8") or "{}")
        except urllib.error.URLError as exc:
            raise RuntimeError(f"Could not get Cloud Run metadata access token: {exc}") from exc

        access_token = str(payload.get("access_token") or "")
        if not access_token:
            raise RuntimeError("Cloud Run metadata server did not return an access token.")
        self._access_token = access_token
        self._expires_at = time.time() + int(payload.get("expires_in") or 300)
        return access_token

    def upload_file(self, bucket: str, object_name: str, file_path: Path, content_type: str) -> None:
        query = urllib.parse.urlencode(
            {
                "uploadType": "media",
                "name": object_name,
                "ifGenerationMatch": "0",
            }
        )
        request = urllib.request.Request(
            f"https://storage.googleapis.com/upload/storage/v1/b/{urllib.parse.quote(bucket, safe='')}/o?{query}",
            data=file_path.read_bytes(),
            headers={
                "Authorization": f"Bearer {self._metadata_access_token()}",
                "Content-Type": content_type or "application/pdf",
            },
            method="POST",
        )
        try:
            with urlopen(request, timeout=self.config.request_timeout_seconds) as response:
                response.read()
        except urllib.error.HTTPError as exc:
            if exc.code == 412:
                return
            detail = exc.read().decode("utf-8", errors="replace")
            raise RuntimeError(
                f"GCS upload failed for gs://{bucket}/{object_name} ({exc.code}): {detail or exc.reason}"
            ) from exc
