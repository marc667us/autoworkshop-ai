"""Find suppliers and parts on a page the operator has allowlisted.

`discover_suppliers` is a pure function over `(ScrapeRequest, injected fetcher,
injected extractor)`. It stores nothing and queries nothing.

⚠️ EVERY CANDIDATE'S `source_url` IS SET BY US, FROM THE URL WE ACTUALLY
FETCHED — never from whatever the model put in that field. A price with a
source the model invented is worse than no price at all, because it looks
checkable. The model's opinion about provenance is discarded on principle, not
merely validated.
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from typing import Any

from ..config import Settings, get_settings
from ..schemas import (
    PartCandidate,
    ScrapeRequest,
    SupplierCandidate,
    SupplierDiscoveryResult,
)
from ..scraping import ScrapeRefused, fetch

logger = logging.getLogger(__name__)

_PROMPT = (
    "From this page, extract vehicle-parts SUPPLIERS and PARTS.\n"
    "Return JSON with exactly two keys, 'suppliers' and 'parts'.\n"
    "'suppliers' is a list of objects with keys: name, country, city, website, "
    "contact (phone or email).\n"
    "'parts' is a list of objects with keys: name, part_number, category, "
    "price, currency.\n"
    "Use null for anything the page does not state. NEVER invent a price, a "
    "part number or a contact. Extract only what is written on the page."
)


def _clean_str(value: Any, limit: int = 300) -> str | None:
    """Accept a string, reject everything else, and bound the length.

    A model that returns a dict or a list where a name belongs has not answered
    the question; coercing it with `str()` would store `"{'name': ...}"` as a
    supplier's name.
    """
    if not isinstance(value, str):
        return None
    text = value.strip()
    if not text or text.lower() in {"null", "none", "n/a", "not stated", "unknown"}:
        return None
    return text[:limit]


def _clean_price(value: Any) -> float | None:
    """A price is a number the page stated, or nothing."""
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        # Tolerate "1,299.00" and "£45.50" — strip anything that is not part of
        # a decimal number, then require what is left to parse.
        cleaned = "".join(ch for ch in value if ch.isdigit() or ch in ".-").strip(".-")
        cleaned = cleaned.replace(",", "")
        try:
            return float(cleaned) if cleaned else None
        except ValueError:
            return None
    return None


def _as_list(payload: dict[str, Any], key: str) -> list[dict[str, Any]]:
    """Pull a list of objects out of the model's payload, defensively."""
    value = payload.get(key)
    if isinstance(value, dict):  # a single object where a list was asked for
        value = [value]
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, dict)]


def discover_suppliers(
    request: ScrapeRequest,
    *,
    settings: Settings | None = None,
    fetcher: Callable[[str], tuple[str, str]] | None = None,
    extractor: Callable[[str, str], dict[str, Any] | None] | None = None,
) -> SupplierDiscoveryResult:
    """Extract supplier and part candidates from one allowlisted page.

    Args:
        request: the url to read, an optional focus, and a cap on items.
        settings: injected config; defaults to the process settings.
        fetcher: injected `url -> (final_url, html)`; defaults to the guarded
            `app.scraping.fetch`. Tests inject a stub so no network is touched.
        extractor: injected `(prompt, html) -> dict | None`; defaults to
            scrapegraph-ai over Ollama.

    Returns:
        A `SupplierDiscoveryResult`. Refusals and failures come back as an
        empty result with `notes` explaining why — never as an exception.

    Raises:
        ScrapeRefused: only from the default fetcher, and only when a safety
            guard refused. The HTTP layer turns this into a 400 so the operator
            is told which guard refused and why.
    """
    cfg = settings or get_settings()
    do_fetch = fetcher or (lambda url: fetch(url, cfg))

    # Which backend ran is reported explicitly, because nothing else in the
    # result distinguishes them (ADR-015). An injected extractor is named as
    # such rather than being passed off as either real backend.
    backend_name = "injected"
    if extractor is None:
        from ..extraction import select_backend

        backend = select_backend(cfg)
        backend_name = backend.name

        def extractor(prompt: str, html: str) -> dict[str, Any] | None:  # type: ignore[misc]
            return backend.extract(prompt, html)

    # A refusal is deliberately allowed to propagate: "we would not fetch that,
    # here is which guard stopped it" is an answer the operator needs, not an
    # empty list they might read as "nothing there".
    final_url, html = do_fetch(request.url)

    prompt = _PROMPT
    if request.focus:
        prompt += f"\nFocus especially on: {request.focus}"

    payload = extractor(prompt, html)
    if not payload:
        return SupplierDiscoveryResult(
            suppliers=[],
            parts=[],
            source_url=final_url,
            source="none",
            extraction_backend=backend_name,
            notes=(
                "The page was fetched, but structured extraction returned "
                "nothing. The local model may be unreachable or the page may "
                "not contain supplier or part data."
            ),
        )

    suppliers: list[SupplierCandidate] = []
    for item in _as_list(payload, "suppliers")[: request.max_items]:
        name = _clean_str(item.get("name"))
        if not name:
            continue  # a supplier with no name is not a candidate
        suppliers.append(
            SupplierCandidate(
                name=name,
                country=_clean_str(item.get("country"), 100),
                city=_clean_str(item.get("city"), 100),
                website=_clean_str(item.get("website"), 500),
                contact=_clean_str(item.get("contact"), 300),
                # Ours, not the model's. See the module docstring.
                source_url=final_url,
            )
        )

    parts: list[PartCandidate] = []
    for item in _as_list(payload, "parts")[: request.max_items]:
        name = _clean_str(item.get("name"))
        if not name:
            continue
        parts.append(
            PartCandidate(
                name=name,
                part_number=_clean_str(item.get("part_number"), 100),
                category=_clean_str(item.get("category"), 100),
                price=_clean_price(item.get("price")),
                currency=_clean_str(item.get("currency"), 10),
                source_url=final_url,
            )
        )

    return SupplierDiscoveryResult(
        suppliers=suppliers,
        parts=parts,
        source_url=final_url,
        source="model",
        extraction_backend=backend_name,
        notes=f"Extracted {len(suppliers)} supplier(s) and {len(parts)} part(s).",
    )


__all__ = ["ScrapeRefused", "discover_suppliers"]
