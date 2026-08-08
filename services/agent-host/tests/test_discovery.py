"""Supplier and lead discovery, with fetching and extraction injected.

No network and no model is touched. The point under test is the normalisation
layer: what the skills do with whatever a small local model hands back.
"""

from __future__ import annotations

from app.schemas import (
    LeadDiscoveryResult,
    ScrapeRequest,
    SupplierDiscoveryResult,
)
from app.skills.lead_discovery import discover_leads
from app.skills.supplier_discovery import discover_suppliers

_HTML = "<html><body><h1>Parts catalogue</h1></body></html>"


def _fetcher(url: str) -> tuple[str, str]:
    return url, _HTML


# --------------------------------------------------------------------------
# Suppliers
# --------------------------------------------------------------------------


def test_supplier_discovery_returns_a_valid_schema(settings):
    def _extractor(_prompt, _html):
        return {
            "suppliers": [
                {
                    "name": "Accra Auto Parts Ltd",
                    "country": "Ghana",
                    "city": "Accra",
                    "website": "https://accraautoparts.example.com",
                    "contact": "+233 30 123 4567",
                }
            ],
            "parts": [
                {
                    "name": "Front brake disc",
                    "part_number": "BD-4417",
                    "category": "braking",
                    "price": "1,299.00",
                    "currency": "GHS",
                }
            ],
        }

    result = discover_suppliers(
        ScrapeRequest(url="https://parts.example.com/catalogue"),
        settings=settings,
        fetcher=_fetcher,
        extractor=_extractor,
    )

    assert isinstance(result, SupplierDiscoveryResult)
    SupplierDiscoveryResult.model_validate(result.model_dump())
    assert result.source == "model"
    assert result.suppliers[0].name == "Accra Auto Parts Ltd"
    # "1,299.00" is parsed, not dropped and not stored as a string.
    assert result.parts[0].price == 1299.0
    assert result.parts[0].currency == "GHS"


def test_every_candidate_carries_the_source_url_WE_fetched(settings):
    """The model's opinion about provenance is discarded on principle.

    Here the model claims both records came from a site we never visited. An
    unsourced — or falsely sourced — price is worthless, so the URL is stamped
    from the fetch, not read from the payload.
    """

    def _extractor(_prompt, _html):
        return {
            "suppliers": [{"name": "S1", "source_url": "https://attacker.example/fake"}],
            "parts": [{"name": "P1", "source_url": "https://attacker.example/fake"}],
        }

    result = discover_suppliers(
        ScrapeRequest(url="https://parts.example.com/catalogue"),
        settings=settings,
        fetcher=_fetcher,
        extractor=_extractor,
    )

    assert result.suppliers[0].source_url == "https://parts.example.com/catalogue"
    assert result.parts[0].source_url == "https://parts.example.com/catalogue"


def test_source_url_follows_a_redirect_to_the_page_actually_read(settings):
    """When the fetch landed somewhere else, that is what gets cited."""

    def _redirecting_fetcher(url: str) -> tuple[str, str]:
        return "https://parts.example.com/catalogue/v2", _HTML

    result = discover_suppliers(
        ScrapeRequest(url="https://parts.example.com/catalogue"),
        settings=settings,
        fetcher=_redirecting_fetcher,
        extractor=lambda p, h: {"suppliers": [{"name": "S1"}], "parts": []},
    )

    assert result.source_url == "https://parts.example.com/catalogue/v2"
    assert result.suppliers[0].source_url == "https://parts.example.com/catalogue/v2"


def test_extraction_failure_degrades_to_an_empty_explained_result(settings):
    """A dead model gives an empty list WITH a reason, not a 500."""
    result = discover_suppliers(
        ScrapeRequest(url="https://parts.example.com/catalogue"),
        settings=settings,
        fetcher=_fetcher,
        extractor=lambda p, h: None,
    )

    assert result.source == "none"
    assert result.suppliers == [] and result.parts == []
    assert "unreachable" in result.notes


def test_nameless_and_malformed_rows_are_dropped(settings):
    def _extractor(_prompt, _html):
        return {
            "suppliers": [
                {"name": "Good Supplier"},
                {"name": ""},  # empty
                {"name": None},  # null
                {"country": "Ghana"},  # no name at all
                "not even an object",
                {"name": {"nested": "dict"}},  # wrong type
            ],
            "parts": [],
        }

    result = discover_suppliers(
        ScrapeRequest(url="https://parts.example.com/x"),
        settings=settings,
        fetcher=_fetcher,
        extractor=_extractor,
    )

    assert [s.name for s in result.suppliers] == ["Good Supplier"]


def test_placeholder_strings_become_null_not_data(settings):
    """"not stated" is the model saying it does not know, not a city called that."""

    def _extractor(_prompt, _html):
        return {
            "suppliers": [{"name": "S1", "city": "not stated", "country": "N/A", "contact": "unknown"}],
            "parts": [],
        }

    result = discover_suppliers(
        ScrapeRequest(url="https://parts.example.com/x"),
        settings=settings,
        fetcher=_fetcher,
        extractor=_extractor,
    )
    supplier = result.suppliers[0]
    assert supplier.city is None and supplier.country is None and supplier.contact is None


def test_an_uninterpretable_price_becomes_null_not_zero(settings):
    """Zero is a price. "call us" is not, and must never become 0.0."""

    def _extractor(_prompt, _html):
        return {"suppliers": [], "parts": [{"name": "Clutch kit", "price": "call for price"}]}

    result = discover_suppliers(
        ScrapeRequest(url="https://parts.example.com/x"),
        settings=settings,
        fetcher=_fetcher,
        extractor=_extractor,
    )
    assert result.parts[0].price is None


def test_max_items_is_enforced(settings):
    def _extractor(_prompt, _html):
        return {
            "suppliers": [{"name": f"S{i}"} for i in range(50)],
            "parts": [{"name": f"P{i}"} for i in range(50)],
        }

    result = discover_suppliers(
        ScrapeRequest(url="https://parts.example.com/x", max_items=5),
        settings=settings,
        fetcher=_fetcher,
        extractor=_extractor,
    )
    assert len(result.suppliers) == 5 and len(result.parts) == 5


# --------------------------------------------------------------------------
# Leads
# --------------------------------------------------------------------------


def test_lead_discovery_returns_a_valid_schema(settings):
    def _extractor(_prompt, _html):
        return {
            "leads": [
                {
                    "organisation_name": "Kumasi Taxi Union",
                    "lead_type": "taxi_or_rideshare",
                    "contact": "info@kumasitaxi.example.org",
                    "location": "Kumasi, Ghana",
                    "rationale": "Operates a fleet of 120 taxis needing regular servicing.",
                }
            ]
        }

    result = discover_leads(
        ScrapeRequest(url="https://parts.example.com/directory"),
        settings=settings,
        fetcher=_fetcher,
        extractor=_extractor,
    )

    assert isinstance(result, LeadDiscoveryResult)
    LeadDiscoveryResult.model_validate(result.model_dump())
    assert result.leads[0].lead_type == "taxi_or_rideshare"
    assert result.leads[0].rationale
    assert result.leads[0].source_url == "https://parts.example.com/directory"


def test_unknown_lead_type_becomes_other_rather_than_dropping_the_lead(settings):
    def _extractor(_prompt, _html):
        return {"leads": [{"organisation_name": "Some Co", "lead_type": "haulage-company"}]}

    result = discover_leads(
        ScrapeRequest(url="https://parts.example.com/x"),
        settings=settings,
        fetcher=_fetcher,
        extractor=_extractor,
    )

    assert result.leads[0].lead_type == "other"
    assert result.leads[0].organisation_name == "Some Co"


def test_lead_type_is_normalised_from_loose_spellings(settings):
    def _extractor(_prompt, _html):
        return {"leads": [{"organisation_name": "X", "lead_type": "Taxi Or Rideshare"}]}

    result = discover_leads(
        ScrapeRequest(url="https://parts.example.com/x"),
        settings=settings,
        fetcher=_fetcher,
        extractor=_extractor,
    )
    assert result.leads[0].lead_type == "taxi_or_rideshare"


def test_lead_extraction_failure_degrades(settings):
    result = discover_leads(
        ScrapeRequest(url="https://parts.example.com/x"),
        settings=settings,
        fetcher=_fetcher,
        extractor=lambda p, h: None,
    )

    assert result.source == "none"
    assert result.leads == []
    assert result.notes
