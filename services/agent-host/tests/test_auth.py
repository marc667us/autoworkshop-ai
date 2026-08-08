"""Auth fails closed.

The behaviour mirrors the NestJS notifications drain: a shared secret, a
constant-time comparison, and — the part that matters most — REFUSING
EVERYTHING when the secret is unset. A missing configuration must never be a
public endpoint.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.config import get_settings
from app.http import app

_ROUTES = [
    ("GET", "/health", None),
    ("POST", "/triage", {"complaint": "brakes grinding"}),
    ("POST", "/discover/suppliers", {"url": "https://parts.example.com/x"}),
    ("POST", "/discover/leads", {"url": "https://parts.example.com/x"}),
]


@pytest.fixture
def client():
    return TestClient(app, raise_server_exceptions=False)


def _call(client, method, path, body):
    headers = {}
    return (
        client.get(path, headers=headers)
        if method == "GET"
        else client.post(path, json=body, headers=headers)
    )


@pytest.mark.parametrize(("method", "path", "body"), _ROUTES)
def test_fails_closed_when_the_token_is_UNSET(client, monkeypatch, method, path, body):
    """THE IMPORTANT ONE: no token configured means no route is reachable.

    Every route, including /health — an unauthenticated health endpoint would
    tell a stranger which model this host runs and whether it is up.
    """
    monkeypatch.delenv("AGENT_HOST_TOKEN", raising=False)
    get_settings.cache_clear()

    response = _call(client, method, path, body)

    assert response.status_code == 403
    assert response.json()["detail"] == "the agent host is not configured"


@pytest.mark.parametrize(("method", "path", "body"), _ROUTES)
def test_rejects_a_missing_authorization_header(client, monkeypatch, method, path, body):
    monkeypatch.setenv("AGENT_HOST_TOKEN", "correct-horse-battery-staple")
    get_settings.cache_clear()

    response = _call(client, method, path, body)

    assert response.status_code == 403
    assert response.json()["detail"] == "bad agent host token"


@pytest.mark.parametrize(
    "header",
    [
        "wrong-token",  # no scheme
        "Bearer wrong-token",  # right scheme, wrong secret
        "Bearer ",  # empty secret
        "Basic correct-horse-battery-staple",  # right secret, wrong scheme
        "Bearer correct-horse-battery-stapleX",  # longer
        "Bearer correct-horse-battery-stapl",  # shorter (a length mismatch must not throw)
    ],
)
def test_rejects_bad_tokens(client, monkeypatch, header):
    monkeypatch.setenv("AGENT_HOST_TOKEN", "correct-horse-battery-staple")
    get_settings.cache_clear()

    response = client.get("/health", headers={"Authorization": header})

    assert response.status_code == 403


def test_a_non_ascii_token_does_not_500(client, monkeypatch):
    """`hmac.compare_digest` raises TypeError on a non-ASCII `str`.

    Solar has a recorded defect for exactly this — four remotely-triggerable
    500s. Both operands are encoded to bytes first, so this is a clean 403.

    The header is sent as latin-1 BYTES, not as a `str`: httpx refuses to
    encode a non-ASCII str header at all, so a str-based test would never reach
    the server and would prove nothing. Latin-1 is how a real client puts these
    bytes on the wire and how Starlette decodes them back into the `str` that
    reaches `require_token`.
    """
    monkeypatch.setenv("AGENT_HOST_TOKEN", "correct-horse-battery-staple")
    get_settings.cache_clear()

    response = client.get(
        "/health",
        headers={"Authorization": "Bearer pässwörd-ünicode".encode("latin-1")},
    )

    assert response.status_code == 403


def test_a_non_ascii_token_reaches_the_comparison_as_a_non_ascii_str(monkeypatch):
    """Call the dependency directly, to prove the guard itself is what survives.

    The route test above goes through Starlette; this one removes any doubt
    that the non-ASCII value actually reaches `hmac.compare_digest` rather than
    being rejected earlier by the framework.
    """
    from fastapi import HTTPException

    from app.config import Settings
    from app.http import require_token

    settings = Settings(agent_host_token="correct-horse-battery-staple")

    with pytest.raises(HTTPException) as excinfo:
        require_token(authorization="Bearer pässwörd-ünicode", settings=settings)

    assert excinfo.value.status_code == 403


def test_accepts_the_correct_token(client, monkeypatch):
    monkeypatch.setenv("AGENT_HOST_TOKEN", "correct-horse-battery-staple")
    get_settings.cache_clear()

    response = client.get(
        "/health", headers={"Authorization": "Bearer correct-horse-battery-staple"}
    )

    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_triage_route_answers_with_a_proposal(client, monkeypatch):
    """End to end through the shell, with the model forced unreachable."""
    monkeypatch.setenv("AGENT_HOST_TOKEN", "t0ken")
    # Point the LLM at a closed port so it degrades rather than waiting on a
    # real model. This is what a dead Ollama looks like.
    monkeypatch.setenv("OLLAMA_BASE_URL", "http://127.0.0.1:9")
    get_settings.cache_clear()

    response = client.post(
        "/triage",
        headers={"Authorization": "Bearer t0ken"},
        json={
            "complaint": "The brakes are grinding badly",
            "vehicle_description": "2015 Toyota Hilux",
            "registration": "GR-1234-20",
            "technicians": [
                {"id": "tech-1", "display_name": "Ama", "skills": ["brakes"], "open_jobs": 2}
            ],
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["priority"] == "urgent"
    assert body["source"] == "rules"  # honest about the model being down
    assert body["suggested_technician_id"] == "tech-1"


def test_scrape_refusal_is_a_400_naming_the_guard(client, monkeypatch):
    """A refusal is a deliberate answer, not a server error."""
    monkeypatch.setenv("AGENT_HOST_TOKEN", "t0ken")
    monkeypatch.setenv("SCRAPE_ALLOWLIST", "parts.example.com")
    get_settings.cache_clear()

    response = client.post(
        "/discover/suppliers",
        headers={"Authorization": "Bearer t0ken"},
        json={"url": "https://not-allowed.example.net/x"},
    )

    assert response.status_code == 400
    assert "not in SCRAPE_ALLOWLIST" in response.json()["detail"]


def test_a_malformed_body_is_a_422_not_a_500(client, monkeypatch):
    monkeypatch.setenv("AGENT_HOST_TOKEN", "t0ken")
    get_settings.cache_clear()

    response = client.post(
        "/triage",
        headers={"Authorization": "Bearer t0ken"},
        json={"complaint": ""},  # violates min_length
    )

    assert response.status_code == 422
