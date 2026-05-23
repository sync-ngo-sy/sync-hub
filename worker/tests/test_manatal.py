from cv_intelligence_worker.config import WorkerConfig
from cv_intelligence_worker.manatal import ManatalClient, _extract_url_from_payload, _redact_error_content, _redact_url_for_error


def test_extract_url_from_payload_accepts_resume_file() -> None:
    assert _extract_url_from_payload({"resume_file": "https://example.com/cv.pdf?signature=secret"}) == "https://example.com/cv.pdf?signature=secret"


def test_redact_url_for_error_drops_signed_query() -> None:
    assert _redact_url_for_error("https://example.com/cv.pdf?Signature=secret&Expires=123") == "https://example.com/cv.pdf"


def test_redact_error_content_removes_auth_details() -> None:
    content = "<ArgumentValue>Token abc123</ArgumentValue><Url>?Signature=secret&Expires=123</Url>"
    assert _redact_error_content(content) == "<ArgumentValue>Token [redacted]</ArgumentValue><Url>?Signature=[redacted]&Expires=[redacted]</Url>"


def test_signed_asset_url_is_not_treated_as_manatal_api_url() -> None:
    client = ManatalClient(WorkerConfig(manatal_api_token="token", manatal_api_base_url="https://api.manatal.com/open/v3"))
    assert client._is_manatal_api_url("https://api.manatal.com/open/v3/candidates/1/resume/")
    assert not client._is_manatal_api_url("https://manatal-backend-assets.s3.amazonaws.com/media/cv.pdf?Signature=secret")
