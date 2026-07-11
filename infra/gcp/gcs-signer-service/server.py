from __future__ import annotations

import base64
import hashlib
import json
import os
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any


METADATA_ROOT = "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default"
STORAGE_HOST = "storage.googleapis.com"
DEFAULT_EXPIRES_SECONDS = 10 * 60


def _json_response(handler: BaseHTTPRequestHandler, status: int, payload: dict[str, Any]) -> None:
    body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Cache-Control", "no-store")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def _metadata(path: str) -> str:
    request = urllib.request.Request(
        f"{METADATA_ROOT}/{path}",
        headers={"Metadata-Flavor": "Google"},
        method="GET",
    )
    with urllib.request.urlopen(request, timeout=10) as response:
        return response.read().decode("utf-8")


def _metadata_access_token() -> str:
    payload = json.loads(_metadata("token"))
    token = str(payload.get("access_token") or "")
    if not token:
        raise RuntimeError("metadata server did not return an access token")
    return token


def _metadata_email() -> str:
    email = _metadata("email").strip()
    if not email:
        raise RuntimeError("metadata server did not return a service account email")
    return email


def _rfc3986(value: str) -> str:
    return urllib.parse.quote(value, safe="")


def _encode_path(value: str) -> str:
    return "/".join(_rfc3986(part) for part in value.split("/"))


def _sign_blob(service_account: str, value: str) -> bytes:
    access_token = _metadata_access_token()
    payload = json.dumps({"payload": base64.b64encode(value.encode("utf-8")).decode("ascii")}).encode("utf-8")
    request = urllib.request.Request(
        f"https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/{urllib.parse.quote(service_account, safe='')}:signBlob",
        data=payload,
        headers={
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            response_payload = json.loads(response.read().decode("utf-8") or "{}")
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"IAM signBlob failed ({exc.code}): {detail}") from exc
    signed_blob = str(response_payload.get("signedBlob") or "")
    if not signed_blob:
        raise RuntimeError("IAM signBlob did not return signedBlob")
    return base64.b64decode(signed_blob)


def _signed_url(bucket: str, object_name: str, expires_seconds: int) -> dict[str, str]:
    service_account = os.environ.get("GCS_SIGNER_SERVICE_ACCOUNT") or _metadata_email()
    now = datetime.now(timezone.utc)
    timestamp = now.strftime("%Y%m%dT%H%M%SZ")
    datestamp = timestamp[:8]
    algorithm = "GOOG4-RSA-SHA256"
    credential_scope = f"{datestamp}/auto/storage/goog4_request"
    credential = f"{service_account}/{credential_scope}"
    canonical_uri = f"/{_rfc3986(bucket)}/{_encode_path(object_name)}"
    query_params = [
        ("X-Goog-Algorithm", algorithm),
        ("X-Goog-Credential", credential),
        ("X-Goog-Date", timestamp),
        ("X-Goog-Expires", str(expires_seconds)),
        ("X-Goog-SignedHeaders", "host"),
    ]
    canonical_query_string = "&".join(f"{_rfc3986(key)}={_rfc3986(value)}" for key, value in query_params)
    canonical_request = "\n".join(
        [
            "GET",
            canonical_uri,
            canonical_query_string,
            f"host:{STORAGE_HOST}\n",
            "host",
            "UNSIGNED-PAYLOAD",
        ]
    )
    string_to_sign = "\n".join(
        [
            algorithm,
            timestamp,
            credential_scope,
            hashlib.sha256(canonical_request.encode("utf-8")).hexdigest(),
        ]
    )
    signature = _sign_blob(service_account, string_to_sign).hex()
    expires_at = now + timedelta(seconds=expires_seconds)
    return {
        "url": f"https://{STORAGE_HOST}{canonical_uri}?{canonical_query_string}&X-Goog-Signature={signature}",
        "expiresAt": expires_at.isoformat().replace("+00:00", "Z"),
    }


def _expires_seconds(value: Any) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        parsed = DEFAULT_EXPIRES_SECONDS
    return max(60, min(3600, parsed))


class Handler(BaseHTTPRequestHandler):
    server_version = "gcs-signer/1.0"

    def log_message(self, format: str, *args: Any) -> None:
        return

    def do_GET(self) -> None:
        if self.path == "/healthz":
            _json_response(self, 200, {"ok": True})
            return
        _json_response(self, 404, {"error": "not_found"})

    def do_POST(self) -> None:
        if self.path.rstrip("/") != "/sign":
            _json_response(self, 404, {"error": "not_found"})
            return

        shared_secret = os.environ.get("GCS_SIGNER_SHARED_SECRET", "")
        authorization = self.headers.get("Authorization", "")
        if not shared_secret or authorization != f"Bearer {shared_secret}":
            _json_response(self, 401, {"error": "unauthorized"})
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
            body = json.loads(self.rfile.read(length).decode("utf-8") or "{}")
            bucket = str(body.get("bucket") or "").strip()
            object_name = str(body.get("objectName") or "").strip()
            allowed_bucket = os.environ.get("GCS_ALLOWED_BUCKET", "").strip()
            if not bucket or not object_name:
                _json_response(self, 400, {"error": "bucket and objectName are required"})
                return
            if allowed_bucket and bucket != allowed_bucket:
                _json_response(self, 403, {"error": "bucket_not_allowed"})
                return
            _json_response(self, 200, _signed_url(bucket, object_name, _expires_seconds(body.get("expiresSeconds"))))
        except Exception as exc:  # noqa: BLE001
            _json_response(self, 500, {"error": "signing_failed", "details": f"{type(exc).__name__}: {exc}"})


def main() -> None:
    port = int(os.environ.get("PORT", "8080"))
    ThreadingHTTPServer(("0.0.0.0", port), Handler).serve_forever()


if __name__ == "__main__":
    main()
