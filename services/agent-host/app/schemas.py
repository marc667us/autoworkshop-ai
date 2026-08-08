"""The contract surface.

Every skill takes one of these models and returns another. Nothing in this file
knows about HTTP, and nothing knows about a database — these are the typed
inputs and outputs that make each skill trivially wrappable in an ADK
`FunctionTool` later (Phase 8) without touching the skill body.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

Priority = Literal["low", "normal", "high", "urgent"]

# Where an answer came from. This is never cosmetic: a rules-derived priority
# and a model-derived priority carry very different weight at a reception desk,
# and conflating them is how a workshop learns to trust the wrong one.
Source = Literal["model", "rules"]
ExtractionSource = Literal["model", "none"]


# --------------------------------------------------------------------------
# Triage
# --------------------------------------------------------------------------


class Technician(BaseModel):
    """A technician the workshop could assign this job to.

    Passed IN by the caller. The agent host does not know who works here and
    has no way to find out — it cannot query anything (ADR-010).
    """

    model_config = ConfigDict(extra="ignore")

    id: str = Field(min_length=1)
    display_name: str = Field(min_length=1)
    # Free-text specialisms, e.g. ["brakes", "diagnostics", "auto-electrics"].
    skills: list[str] = Field(default_factory=list)
    # How much this technician already has on. Used only as a tie-break, so a
    # caller that does not track it can leave it at zero.
    open_jobs: int = Field(default=0, ge=0)


class ServiceRequestInput(BaseModel):
    """What the customer said, plus the context needed to act on it."""

    model_config = ConfigDict(extra="ignore")

    complaint: str = Field(min_length=1, max_length=8000)
    vehicle_description: str | None = Field(default=None, max_length=500)
    registration: str | None = Field(default=None, max_length=32)
    technicians: list[Technician] = Field(default_factory=list)


class TriageProposal(BaseModel):
    """A PROPOSAL. Nothing here is a decision.

    The workshop's domain services decide; this is advice a human accepts or
    overrides. Hence "suggested", and hence `confidence` and `source` being
    part of the contract rather than an implementation detail.
    """

    priority: Priority
    fault_category: str
    # Plain English for whoever is standing at the desk, not for a mechanic.
    summary: str
    suggested_technician_id: str | None = None
    # Always populated, including when no technician was suggested — "why not"
    # is as useful to reception as "why".
    technician_reason: str
    confidence: float = Field(ge=0.0, le=1.0)
    source: Source
    # The keywords/observations that drove the rules. Makes a wrong answer
    # diagnosable instead of mysterious.
    signals: list[str] = Field(default_factory=list)


# --------------------------------------------------------------------------
# Discovery (shared)
# --------------------------------------------------------------------------


class ScrapeRequest(BaseModel):
    """A request to read ONE page that the operator has allowlisted."""

    model_config = ConfigDict(extra="ignore")

    url: str = Field(min_length=1, max_length=2048)
    # Optional nudge for the extractor, e.g. "brake discs for Toyota Hilux".
    focus: str | None = Field(default=None, max_length=500)
    max_items: int = Field(default=25, ge=1, le=100)


# --------------------------------------------------------------------------
# Supplier discovery
# --------------------------------------------------------------------------


class SupplierCandidate(BaseModel):
    """A possible supplier. `source_url` is mandatory and always set by us."""

    name: str
    country: str | None = None
    city: str | None = None
    website: str | None = None
    contact: str | None = None
    source_url: str


class PartCandidate(BaseModel):
    """A possible part.

    `price` is the number the page stated, if it stated one — never a guess,
    and never useful without `source_url` to check it against.
    """

    name: str
    part_number: str | None = None
    category: str | None = None
    price: float | None = None
    currency: str | None = None
    source_url: str


class SupplierDiscoveryResult(BaseModel):
    suppliers: list[SupplierCandidate] = Field(default_factory=list)
    parts: list[PartCandidate] = Field(default_factory=list)
    source_url: str
    source: ExtractionSource
    # WHICH BACKEND RAN — the only way a caller can tell. Swapping the local
    # Ollama backend for the hosted API does not change any other field, so
    # without this the difference would be invisible. Never contains the key.
    extraction_backend: str = ""
    # Why the result looks the way it does — especially when it is empty.
    notes: str = ""


# --------------------------------------------------------------------------
# Lead discovery
# --------------------------------------------------------------------------

LeadType = Literal["fleet", "garage", "taxi_or_rideshare", "dealership", "other"]


class LeadCandidate(BaseModel):
    organisation_name: str
    lead_type: LeadType = "other"
    contact: str | None = None
    location: str | None = None
    # Stated in the model's own words, grounded in the page. A lead with no
    # rationale is just a company name.
    rationale: str = ""
    source_url: str


class LeadDiscoveryResult(BaseModel):
    leads: list[LeadCandidate] = Field(default_factory=list)
    source_url: str
    source: ExtractionSource
    # See `SupplierDiscoveryResult.extraction_backend`. Never contains the key.
    extraction_backend: str = ""
    notes: str = ""


__all__ = [
    "ExtractionSource",
    "LeadCandidate",
    "LeadDiscoveryResult",
    "LeadType",
    "PartCandidate",
    "Priority",
    "ScrapeRequest",
    "ServiceRequestInput",
    "Source",
    "SupplierCandidate",
    "SupplierDiscoveryResult",
    "Technician",
    "TriageProposal",
]
