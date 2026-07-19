from __future__ import annotations

import ssl
from urllib import request as urllib_request


_SSL_CONTEXT: ssl.SSLContext | None = None


def build_ssl_context() -> ssl.SSLContext:
    global _SSL_CONTEXT
    if _SSL_CONTEXT is not None:
        return _SSL_CONTEXT
    try:
        import certifi  # type: ignore
    except Exception:
        _SSL_CONTEXT = ssl.create_default_context()
    else:
        _SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where())
    return _SSL_CONTEXT


def urlopen(request: urllib_request.Request, *, timeout: int):
    return urllib_request.urlopen(request, timeout=timeout, context=build_ssl_context())
