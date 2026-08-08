"""Find potential customers on a page the operator has allowlisted.

A lead, for a workshop, is an organisation that runs vehicles someone has to
maintain: fleet operators, other garages, taxi and ride-hail firms, and
dealerships.

Same shape and same rules as `supplier_discovery` — pure function, injectable
fetcher and extractor, and `source_url` stamped by us from the page we actually
fetched rather than taken from the model. A lead whose provenance the model
invented cannot be checked, and an unverifiable lead wastes a salesperson's
morning.
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from typing import Any, get_args

from ..config import Settings, get_settings
from ..schemas import LeadCandidate, LeadDiscoveryResult, LeadType, ScrapeRequest
from ..scraping import ScrapeRefused, fetch

logger = logging.getLogger(__name__)

_VALID_LEAD_TYPES = frozenset(get_args(LeadType))

_PROMPT = (
    "From this page, extract ORGANISATIONS that could be customers of a "
    "vehicle repair workshop: businesses that operate a vehicle fleet, "
    "garages, taxi or ride-hailing operators, and car dealerships.\n"
    "Return JSON with one key, 'leads', a list of objects with keys: "
    "organisation_name, lead_type, contact, location, rationale.\n"
    "'lead_type' must be one of: fleet, garage, taxi_or_rideshare, "
    "dealership, other.\n"
    "'rationale' is one short sentence saying why this organisation would need "
    "vehicle servicing, based ONLY on what the page says.\n"
    "Use null for anything the page does not state. Do not invent contact "
    "details."
)


def _clean_str(value: Any, limit: int = 300) -> str | None:
    """Accept a string, reject everything else, and bound the length."""
    if not isinstance(value, str):
        return None
    text = value.strip()
    if not text or text.lower() in {"null", "none", "n/a", "not stated", "unknown"}:
        return None
    return text[:limit]


def _clean_lead_type(value: Any) -> LeadType:
    """Map the model's answer onto the enum, defaulting to "other".

    An unrecognised type becomes `other` rather than being dropped: the lead is
    still real, we just do not believe the label.
    """
    if isinstance(value, str):
        candidate = value.strip().lower().replace("-", "_").replace(" ", "_")
        if candidate in _VALID_LEAD_TYPES:
            return candidate  # type: ignore[return-value]
    return "other"


def _as_list(payload: dict[str, Any], key: str) -> list[dict[str, Any]]:
    value = payload.get(key)
    if isinstance(value, dict):
        value = [value]
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, dict)]


def discover_leads(
    request: ScrapeRequest,
    *,
    settings: Settings | None = None,
    fetcher: Callable[[str], tuple[str, str]] | None = None,
    extractor: Callable[[str, str], dict[str, Any] | None] | None = None,
) -> LeadDiscoveryResult:
    """Extract candidate leads from one allowlisted page.

    Args:
        request: the url to read, an optional focus, and a cap on items.
        settings: injected config; defaults to the process settings.
        fetcher: injected `url -> (final_url, html)`; defaults to the guarded
            `app.scraping.fetch`.
        extractor: injected `(prompt, html) -> dict | None`; defaults to
            scrapegraph-ai over Ollama.

    Returns:
        A `LeadDiscoveryResult`, empty with an explanatory `notes` when
        extraction yields nothing.

    Raises:
        ScrapeRefused: from the default fetcher when a safety guard refused.
    """
    cfg = settings or get_settings()
    do_fetch = fetcher or (lambda url: fetch(url, cfg))

    # See `supplier_discovery.discover_suppliers` — the backend is reported
    # explicitly because nothing else in the result distinguishes them.
    backend_name = "injected"
    if extractor is None:
        from ..extraction import select_backend

        backend = select_backend(cfg)
        backend_name = backend.name

        def extractor(prompt: str, html: str) -> dict[str, Any] | None:  # type: ignore[misc]
            return backend.extract(prompt, html)

    final_url, html = do_fetch(request.url)

    prompt = _PROMPT
    if request.focus:
        prompt += f"\nFocus especially on: {request.focus}"

    payload = extractor(prompt, html)
    if not payload:
        return LeadDiscoveryResult(
            leads=[],
            source_url=final_url,
            source="none",
            extraction_backend=backend_name,
            notes=(
                "The page was fetched, but structured extraction returned "
                "nothing. The local model may be unreachable or the page may "
                "not list any organisations."
            ),
        )

    leads: list[LeadCandidate] = []
    for item in _as_list(payload, "leads")[: request.max_items]:
        name = _clean_str(item.get("organisation_name")) or _clean_str(item.get("name"))
        if not name:
            continue  # an unnamed organisation is not a lead
        leads.append(
            LeadCandidate(
                organisation_name=name,
                lead_type=_clean_lead_type(item.get("lead_type")),
                contact=_clean_str(item.get("contact")),
                location=_clean_str(item.get("location"), 200),
                rationale=_clean_str(item.get("rationale"), 500) or "",
                # Ours, from the page actually fetched.
                source_url=final_url,
            )
        )

    return LeadDiscoveryResult(
        leads=leads,
        source_url=final_url,
        source="model",
        extraction_backend=backend_name,
        notes=f"Extracted {len(leads)} lead(s).",
    )


__all__ = ["ScrapeRefused", "discover_leads"]
