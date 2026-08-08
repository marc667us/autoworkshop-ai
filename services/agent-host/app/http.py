"""The HTTP shell.

A THIN wrapper. Every route unwraps a pydantic model, calls one pure skill
function, and returns the result. No business logic lives here, which is what
makes the same skills wrappable in an ADK `FunctionTool` later without the HTTP
layer being involved at all.

AUTH — the shape is copied deliberately from the NestJS notifications drain
(`apps/api/src/notifications/notifications.controller.ts`):

  * a shared secret, because there is no signed-in user on this hop;
  * ⚠️ WHEN THE SECRET IS UNSET, EVERY ROUTE IS REFUSED, NOT OPENED. A missing
    configuration must never be a public endpoint;
  * a constant-time comparison, with the length checked first.

On that last point — the Node side needs the length check because
`timingSafeEqual` THROWS on mismatched lengths. Python's `hmac.compare_digest`
handles differing lengths safely, but it raises `TypeError` on a `str`
containing non-ASCII. Solar has a recorded defect for exactly that (four
remotely-triggerable 500s), so both operands are encoded to bytes first and the
length is still checked, which keeps the two implementations reading the same.
"""

from __future__ import annotations

import hmac

from fastapi import Depends, FastAPI, Header, HTTPException, status

from .config import Settings, get_settings
from .schemas import (
    LeadDiscoveryResult,
    ScrapeRequest,
    ServiceRequestInput,
    SupplierDiscoveryResult,
    TriageProposal,
)
from .scraping import ScrapeRefused
from .skills.lead_discovery import discover_leads
from .skills.supplier_discovery import discover_suppliers
from .skills.triage import triage_service_request

app = FastAPI(
    title="AutoWorkshop AI — Agent Host",
    version="0.1.0",
    description=(
        "Stateless agent host. Receives data as JSON, returns proposals as "
        "JSON. Holds no credentials and cannot reach the database (ADR-010)."
    ),
)


def require_token(
    authorization: str | None = Header(default=None),
    settings: Settings = Depends(get_settings),
) -> None:
    """Bearer-token auth for every route, failing closed when unconfigured.

    Raises:
        HTTPException: 403 when the token is unset (fail closed) or wrong.
    """
    expected = settings.agent_host_token
    if not expected:
        # THE FAIL-CLOSED BRANCH. Not a development convenience.
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="the agent host is not configured",
        )

    scheme, _, given = (authorization or "").partition(" ")
    if scheme.lower() != "bearer" or not given:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="bad agent host token"
        )

    given_bytes = given.strip().encode("utf-8")
    want_bytes = expected.encode("utf-8")
    if len(given_bytes) != len(want_bytes) or not hmac.compare_digest(
        given_bytes, want_bytes
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="bad agent host token"
        )


@app.get("/health", dependencies=[Depends(require_token)])
def health() -> dict[str, object]:
    """Liveness, plus whether the local model is answering.

    Authenticated like every other route, per the fail-closed rule: an
    unauthenticated health endpoint would happily tell a stranger which model
    this host runs and whether it is up.

    `llm_reachable` being false is NOT unhealthy — triage degrades to rules, so
    the service is still doing its job.
    """
    from .llm import health as llm_health

    return {"status": "ok", "llm_reachable": llm_health()}


@app.post("/triage", response_model=TriageProposal, dependencies=[Depends(require_token)])
def triage(request: ServiceRequestInput) -> TriageProposal:
    """Triage one service request. Always answers, model up or down."""
    return triage_service_request(request)


@app.post(
    "/discover/suppliers",
    response_model=SupplierDiscoveryResult,
    dependencies=[Depends(require_token)],
)
def suppliers(request: ScrapeRequest) -> SupplierDiscoveryResult:
    """Extract suppliers and parts from one allowlisted page."""
    try:
        return discover_suppliers(request)
    except ScrapeRefused as exc:
        # 400, not 500: the request was understood and refused on purpose, and
        # the operator is told which guard refused it.
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc


@app.post(
    "/discover/leads",
    response_model=LeadDiscoveryResult,
    dependencies=[Depends(require_token)],
)
def leads(request: ScrapeRequest) -> LeadDiscoveryResult:
    """Extract candidate leads from one allowlisted page."""
    try:
        return discover_leads(request)
    except ScrapeRefused as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc


__all__ = ["app", "require_token"]
