import httpx
import pytest

from cv_intelligence_worker.config import WorkerConfig
from cv_intelligence_worker.manatal import ManatalClient, _extract_url_from_payload, _redact_url_for_error


def _config() -> WorkerConfig:
    return WorkerConfig(
        manatal_api_token="private-token",
        manatal_api_base_url="https://api.manatal.test/open/v3",
    )


def test_extract_url_from_payload_accepts_resume_file() -> None:
    assert _extract_url_from_payload({"resume_file": "https://example.com/cv.pdf?signature=secret"}) == "https://example.com/cv.pdf?signature=secret"


def test_redact_url_for_error_drops_signed_query() -> None:
    assert _redact_url_for_error("https://example.com/cv.pdf?Signature=secret&Expires=123") == "https://example.com/cv.pdf"


def test_signed_asset_url_is_not_treated_as_manatal_api_url() -> None:
    client = ManatalClient(WorkerConfig(manatal_api_token="token", manatal_api_base_url="https://api.manatal.com/open/v3"))
    assert client._is_manatal_api_url("https://api.manatal.com/open/v3/candidates/1/resume/")
    assert not client._is_manatal_api_url("http://api.manatal.com/open/v3/candidates/1/resume/")
    assert not client._is_manatal_api_url("https://manatal-backend-assets.s3.amazonaws.com/media/cv.pdf?Signature=secret")


def test_resume_redirect_does_not_forward_manatal_token() -> None:
    requests: list[httpx.Request] = []

    def respond(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if request.url.host == "api.manatal.test":
            return httpx.Response(
                302,
                headers={"Location": "https://assets.example.test/cv.pdf?Signature=private-signature"},
            )
        return httpx.Response(200, content=b"resume", headers={"Content-Type": "application/pdf"})

    client = ManatalClient(_config(), transport=httpx.MockTransport(respond))
    body, _headers = client._request("/candidates/1/resume/")

    assert body == b"resume"
    assert requests[0].headers["Authorization"] == "Token private-token"
    assert "Authorization" not in requests[1].headers


def test_transport_error_does_not_expose_token_url_query_or_response_body() -> None:
    def respond(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            403,
            text="candidate@example.test Token private-token Signature=private-signature",
        )

    client = ManatalClient(_config(), transport=httpx.MockTransport(respond))
    with pytest.raises(RuntimeError) as error:
        client._request("https://api.manatal.test/open/v3/candidates/?Signature=private-signature")

    message = str(error.value)
    assert "403" in message
    assert "candidate@example.test" not in message
    assert "private-token" not in message
    assert "private-signature" not in message


def test_network_error_does_not_expose_provider_details() -> None:
    def fail(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("private infrastructure detail", request=request)

    client = ManatalClient(_config(), transport=httpx.MockTransport(fail))
    with pytest.raises(RuntimeError) as error:
        client._request("/candidates/")

    assert str(error.value) == "Manatal GET https://api.manatal.test/open/v3/candidates/ failed (ConnectError)"


def test_list_candidates_paginates_with_api_authentication() -> None:
    pages: list[str] = []

    def respond(request: httpx.Request) -> httpx.Response:
        pages.append(request.url.params["page"])
        assert request.headers["Authorization"] == "Token private-token"
        page = request.url.params["page"]
        return httpx.Response(
            200,
            json={
                "results": [{"id": page, "full_name": f"Candidate {page}"}],
                "next": "next-page" if page == "1" else None,
            },
        )

    client = ManatalClient(_config(), transport=httpx.MockTransport(respond))
    candidates = client.list_candidates()

    assert pages == ["1", "2"]
    assert [candidate.id for candidate in candidates] == ["1", "2"]
