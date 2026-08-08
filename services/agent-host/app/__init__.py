"""AutoWorkshop AI — agent host.

A stateless service with three skills: triage a service request, discover
suppliers and parts from a page, discover sales leads from a page.

WHAT THIS SERVICE CANNOT DO, BY CONSTRUCTION (CLAUDE.md §3 / ADR-010):

  * reach the database — there is no driver installed and no DSN to use;
  * hold a credential — the only secret it knows is the token callers present
    to IT;
  * decide anything — every output is a *proposal* for a human or a domain
    service to accept or override.

Data arrives as JSON in the request and leaves as JSON in the response. That is
its entire world, and `tests/test_adr010_boundary.py` asserts it rather than
trusting this docstring.

Each skill is a PURE FUNCTION over typed pydantic models, so wrapping one in an
ADK `FunctionTool` in Phase 8 is a wrapper, not a rewrite. Note that no agent
loop here is built on ADK, LangChain, LangGraph, AutoGen or CrewAI — see
ADR-018. (scrapegraph-ai vendors LangChain internally; that is its business.)

The `app.http` module is imported lazily via `__getattr__` so that importing a
skill does not drag FastAPI in.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from .config import Settings, get_settings
from .extraction import (
    ExtractionBackend,
    HostedScrapeGraphBackend,
    LocalOllamaBackend,
    select_backend,
)
from .schemas import (
    LeadCandidate,
    LeadDiscoveryResult,
    PartCandidate,
    Priority,
    ScrapeRequest,
    ServiceRequestInput,
    SupplierCandidate,
    SupplierDiscoveryResult,
    Technician,
    TriageProposal,
)
from .scraping import ScrapeRefused, fetch, validate_url
from .skills.lead_discovery import discover_leads
from .skills.supplier_discovery import discover_suppliers
from .skills.triage import triage_by_rules, triage_service_request

if TYPE_CHECKING:  # pragma: no cover
    from .http import app

__version__ = "0.1.0"


def __getattr__(name: str) -> Any:
    """Expose `app.app` (the FastAPI instance) without importing FastAPI eagerly."""
    if name == "app":
        from .http import app as _app

        return _app
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")


__all__ = [
    # Config
    "Settings",
    "get_settings",
    # Skills — the ADK-wrappable surface
    "discover_leads",
    "discover_suppliers",
    "triage_by_rules",
    "triage_service_request",
    # Schemas — the contract
    "LeadCandidate",
    "LeadDiscoveryResult",
    "PartCandidate",
    "Priority",
    "ScrapeRequest",
    "ServiceRequestInput",
    "SupplierCandidate",
    "SupplierDiscoveryResult",
    "Technician",
    "TriageProposal",
    # Scraping safety
    "ScrapeRefused",
    "fetch",
    "validate_url",
    # Extraction backends (ADR-015 bring-your-own-connection)
    "ExtractionBackend",
    "HostedScrapeGraphBackend",
    "LocalOllamaBackend",
    "select_backend",
    # HTTP shell (lazy)
    "app",
    "__version__",
]
