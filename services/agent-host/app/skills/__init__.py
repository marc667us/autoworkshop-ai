"""The skills.

Each is a PURE FUNCTION taking a typed pydantic input and returning a typed
pydantic result. No skill reads global state, opens a connection, or writes
anything. That is what makes each one wrappable in an ADK `FunctionTool` later
(Phase 8) with no change to its body — and what makes them testable without a
network.
"""

from __future__ import annotations

from .lead_discovery import discover_leads
from .supplier_discovery import discover_suppliers
from .triage import triage_by_rules, triage_service_request

__all__ = [
    "discover_leads",
    "discover_suppliers",
    "triage_by_rules",
    "triage_service_request",
]
