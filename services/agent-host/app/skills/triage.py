"""Triage a customer's service request into a proposal reception can act on.

`triage_service_request` is a PURE FUNCTION: everything it knows arrives in the
argument, and the only outside thing it touches is an injectable LLM callable.
It queries nothing (ADR-010) and it holds no state, which is what makes it
trivially wrappable in an ADK `FunctionTool` later without being rewritten.

TWO PATHS, ALWAYS LABELLED.

A local model improves the wording and the category. It is not allowed to be
load-bearing, because a workshop cannot stop taking cars in when Ollama is
down. So the deterministic rules run FIRST, unconditionally, and the model is
an overlay on top of a result that is already complete and usable. The `source`
field says which one the caller is looking at, and it is never guessed at.

⚠️ A MODEL MAY ESCALATE A SAFETY-CRITICAL COMPLAINT BUT MAY NEVER DOWNGRADE
ONE. If the rules matched brakes, smoke, overheating or steering, a 3B model
answering "low" does not get to overrule that. See `_SAFETY_CRITICAL`.
"""

from __future__ import annotations

import json
import re
from collections.abc import Callable
from typing import Any

from ..schemas import Priority, ServiceRequestInput, Technician, TriageProposal

# Ordered worst-first. The first family whose keywords appear wins, so the
# urgent families are listed before the routine ones and a complaint that
# mentions both "brake" and "service" is triaged on the brake.
#
# (category, priority, keywords)
_FAULT_RULES: list[tuple[str, Priority, tuple[str, ...]]] = [
    (
        "braking",
        "urgent",
        (
            "brake",
            "brakes",
            "braking",
            "abs",
            "brake pedal",
            "handbrake",
            "stopping distance",
        ),
    ),
    (
        "fire_or_smoke",
        "urgent",
        ("smoke", "smoking", "burning smell", "smell of burning", "fire", "flames"),
    ),
    (
        "cooling",
        "urgent",
        (
            "overheat",
            "overheating",
            "temperature warning",
            "coolant",
            "steam",
            "boiling",
            "head gasket",
        ),
    ),
    (
        "steering_suspension",
        "urgent",
        ("steering", "steers", "power steering", "wheel wobble", "wandering", "pulling to"),
    ),
    (
        "fuel_system",
        "urgent",
        ("fuel leak", "petrol leak", "diesel leak", "smell of petrol", "smell of fuel"),
    ),
    (
        "safety_restraints",
        "urgent",
        ("airbag", "seatbelt", "seat belt", "wheel came off", "wheel loose"),
    ),
    (
        "engine",
        "high",
        (
            "misfire",
            "misfiring",
            "stalling",
            "stalls",
            "won't start",
            "wont start",
            "will not start",
            "knocking",
            "loss of power",
            "engine light",
            "warning light",
            "engine management",
            "rough idle",
        ),
    ),
    (
        "transmission",
        "high",
        ("gearbox", "clutch", "transmission", "slipping out of gear", "crunching", "gears"),
    ),
    (
        "electrical",
        "high",
        (
            "battery",
            "alternator",
            "no power",
            "electrical",
            "flat battery",
            "immobiliser",
            "central locking",
            "starter motor",
        ),
    ),
    (
        "suspension",
        "high",
        ("suspension", "shock absorber", "bouncing", "knocking over bumps", "spring"),
    ),
    ("exhaust", "high", ("exhaust", "emissions", "catalytic", "dpf", "blowing")),
    (
        "tyres",
        "normal",
        ("tyre", "tire", "puncture", "tread", "flat tyre", "wheel balance", "tracking"),
    ),
    (
        "hvac",
        "normal",
        ("air con", "aircon", "air conditioning", "a/c", "heater", "climate", "blower"),
    ),
    (
        "routine_service",
        "normal",
        ("service", "mot", "inspection", "oil change", "filter", "annual check"),
    ),
    (
        "bodywork",
        "low",
        ("scratch", "dent", "paint", "cosmetic", "valet", "upholstery", "trim", "bumper"),
    ),
    ("ancillaries", "low", ("wiper", "washer", "bulb", "mirror", "radio", "speaker")),
]

# Families where the rules' verdict is a FLOOR the model cannot go below.
_SAFETY_CRITICAL = frozenset(
    {"braking", "fire_or_smoke", "cooling", "steering_suspension", "fuel_system", "safety_restraints"}
)

_PRIORITY_ORDER: dict[str, int] = {"low": 0, "normal": 1, "high": 2, "urgent": 3}

# Which technician specialisms suit which fault family, as
# `(primary, fallback)`. Matching is substring based in both directions, so a
# technician listing "auto-electrics" matches the token "electric".
#
# ⚠️ THE SPLIT IS LOAD-BEARING, AND A FLAT KEYWORD COUNT GOT THIS WRONG.
# Primary tokens are the actual specialism ("brake"); fallback tokens are
# generic competence ("mechanic"). Scoring every match equally meant a
# technician listing "brakes, mechanical" outranked one listing "brakes,
# suspension" who had a THIRD of the workload — the generic word, which says
# nothing about brakes, broke the tie. Among equally qualified technicians the
# job belongs to the least busy one, so qualification is a TIER and workload
# decides within it.
_CATEGORY_SKILLS: dict[str, tuple[tuple[str, ...], tuple[str, ...]]] = {
    "braking": (("brake",), ("mechanic",)),
    "fire_or_smoke": (("diagnos", "engine"), ("mechanic",)),
    "cooling": (("cooling", "radiator"), ("engine", "mechanic")),
    "steering_suspension": (("steering", "suspension"), ("mechanic",)),
    "fuel_system": (("fuel", "injection"), ("engine", "diagnos")),
    "safety_restraints": (("airbag", "restraint"), ("electric", "diagnos", "mechanic")),
    "engine": (("engine", "diagnos"), ("mechanic",)),
    "transmission": (("transmission", "gearbox", "clutch"), ("mechanic",)),
    "electrical": (("electric", "auto-electric"), ("diagnos",)),
    "suspension": (("suspension",), ("mechanic",)),
    "exhaust": (("exhaust", "emission"), ("mechanic",)),
    "tyres": (("tyre", "tire", "wheel"), ("mechanic",)),
    "hvac": (("hvac", "climate", "aircon", "air con"), ("electric",)),
    "routine_service": (("service",), ("mechanic", "general")),
    "bodywork": (("body", "paint", "panel"), ()),
    "ancillaries": (("general",), ("mechanic",)),
    "general": (("general",), ("mechanic",)),
}

_SYSTEM_PROMPT = (
    "You are a service adviser at a vehicle repair workshop. You triage customer "
    "complaints. You are cautious: anything affecting braking, steering, fuel or "
    "fire risk is urgent. Reply with JSON only."
)


def _normalise(text: str) -> str:
    """Lower-case and collapse whitespace so keyword matching is predictable."""
    return re.sub(r"\s+", " ", text.lower())


def _match_rules(complaint: str) -> tuple[str, Priority, list[str]]:
    """Return `(category, priority, matched_signals)` for a complaint.

    Falls back to `("general", "normal", [])` when nothing matches — an
    unrecognised complaint is not thereby a low-priority one.
    """
    haystack = _normalise(complaint)
    for category, priority, keywords in _FAULT_RULES:
        hits = [kw for kw in keywords if kw in haystack]
        if hits:
            return category, priority, hits
    return "general", "normal", []


def _pick_technician(
    category: str, technicians: list[Technician]
) -> tuple[str | None, str]:
    """Choose a technician and say why. Returns `(id_or_none, reason)`.

    Ranks on specialism match, then on the lightest workload, then on name so
    that the same input always produces the same answer.
    """
    if not technicians:
        return None, (
            "No technicians were supplied with this request, so no assignment "
            "could be suggested."
        )

    primary, fallback = _CATEGORY_SKILLS.get(category, _CATEGORY_SKILLS["general"])

    def tier(tech: Technician) -> int:
        """2 = holds the specialism, 1 = generally competent, 0 = neither."""
        skills = [s.lower() for s in tech.skills]

        def matches(tokens: tuple[str, ...]) -> bool:
            return any(
                token in skill or skill in token for token in tokens for skill in skills
            )

        if matches(primary):
            return 2
        if matches(fallback):
            return 1
        return 0

    # Qualification first, then the lightest load, then the name so that the
    # same roster always yields the same answer.
    ranked = sorted(technicians, key=lambda t: (-tier(t), t.open_jobs, t.display_name))
    best = ranked[0]
    best_tier = tier(best)
    readable = category.replace("_", " ")

    if best_tier == 0:
        return best.id, (
            f"No technician lists a specialism for a {readable} fault, so "
            f"{best.display_name} is suggested as the least loaded "
            f"({best.open_jobs} open job(s))."
        )

    peers = [t for t in technicians if tier(t) == best_tier]
    matched_skills = ", ".join(best.skills) or "the relevant specialism"
    qualification = (
        f"specialises in {readable} faults" if best_tier == 2 else "is generally qualified"
    )
    return best.id, (
        f"{best.display_name} {qualification} (skills: {matched_skills}) and has "
        f"the lightest load among the {len(peers)} equally qualified "
        f"technician(s), with {best.open_jobs} open job(s)."
    )


def _rules_summary(
    request: ServiceRequestInput, category: str, priority: Priority, signals: list[str]
) -> str:
    """A plain-English sentence for whoever is standing at the desk."""
    vehicle_bits = [b for b in (request.vehicle_description, request.registration) if b]
    vehicle = " ".join(vehicle_bits) if vehicle_bits else "the vehicle"

    complaint = request.complaint.strip()
    if len(complaint) > 220:
        complaint = complaint[:217].rstrip() + "..."

    reason = (
        f"the complaint mentions {', '.join(repr(s) for s in signals)}"
        if signals
        else "no specific fault keyword was recognised"
    )
    readable = category.replace("_", " ")
    return (
        f"Customer reports on {vehicle}: \"{complaint}\" "
        f"Classified as a {readable} issue at {priority} priority because {reason}."
    )


def _rules_confidence(signals: list[str], category: str) -> float:
    """How much the rules themselves deserve to be believed.

    A single generic keyword is weaker evidence than several specific ones, and
    matching nothing at all is explicitly low.
    """
    if not signals:
        return 0.3
    base = 0.6 + 0.1 * min(len(signals), 3)
    if category in _SAFETY_CRITICAL:
        base += 0.05
    return round(min(base, 0.95), 2)


def triage_by_rules(request: ServiceRequestInput) -> TriageProposal:
    """The deterministic path. Never fails, never calls anything.

    This is the answer the workshop gets when the model is unreachable, and it
    is a complete one — `source` is `"rules"` so nobody mistakes it for the
    model's.
    """
    category, priority, signals = _match_rules(request.complaint)
    tech_id, tech_reason = _pick_technician(category, request.technicians)
    return TriageProposal(
        priority=priority,
        fault_category=category,
        summary=_rules_summary(request, category, priority, signals),
        suggested_technician_id=tech_id,
        technician_reason=tech_reason,
        confidence=_rules_confidence(signals, category),
        source="rules",
        signals=signals,
    )


def _build_prompt(request: ServiceRequestInput, rules: TriageProposal) -> str:
    """Prompt the model with the same facts the rules had — and no others."""
    roster = [
        {
            "id": t.id,
            "name": t.display_name,
            "skills": t.skills,
            "open_jobs": t.open_jobs,
        }
        for t in request.technicians
    ]
    return (
        "Triage this vehicle service request.\n\n"
        f"Complaint: {request.complaint}\n"
        f"Vehicle: {request.vehicle_description or 'not stated'}\n"
        f"Registration: {request.registration or 'not stated'}\n"
        f"Available technicians (JSON): {json.dumps(roster)}\n\n"
        "Reply with a JSON object with exactly these keys:\n"
        '  "priority": one of "low", "normal", "high", "urgent"\n'
        '  "fault_category": a short snake_case category, e.g. "braking"\n'
        '  "summary": one or two plain-English sentences for a receptionist '
        "who is not a mechanic\n"
        '  "suggested_technician_id": the id of one technician from the list '
        "above, or null if none is suitable\n'"
        '  "technician_reason": why that technician\n'
        '  "confidence": a number between 0 and 1\n\n'
        f"For reference, a keyword rule classified this as "
        f"{rules.fault_category} / {rules.priority}. Disagree if the text "
        "warrants it, but never downgrade a braking, steering, fuel, smoke or "
        "overheating complaint."
    )


def _coerce_priority(value: Any) -> Priority | None:
    if isinstance(value, str) and value.lower().strip() in _PRIORITY_ORDER:
        return value.lower().strip()  # type: ignore[return-value]
    return None


def triage_service_request(
    request: ServiceRequestInput,
    *,
    llm_json: Callable[[str], dict[str, Any] | None] | None = None,
    use_llm: bool = True,
) -> TriageProposal:
    """Triage a service request. ALWAYS returns a usable proposal.

    Args:
        request: the complaint plus the roster to assign from. Everything the
            function knows is in here — it looks nothing up.
        llm_json: injectable JSON-returning LLM callable, for tests and for the
            ADK wrapper later. Defaults to the Ollama client. Must return
            `None` rather than raise when the model is unreachable.
        use_llm: set False to force the deterministic path.

    Returns:
        A `TriageProposal` whose `source` field honestly reports which path
        produced it.
    """
    rules = triage_by_rules(request)
    if not use_llm:
        return rules

    if llm_json is None:
        # Imported here so that the rules path has no import-time dependency on
        # the LLM client at all.
        from ..llm import generate_json

        def llm_json(prompt: str) -> dict[str, Any] | None:  # type: ignore[misc]
            return generate_json(prompt, system=_SYSTEM_PROMPT)

    try:
        raw = llm_json(_build_prompt(request, rules))
    except Exception:  # noqa: BLE001 - an injected callable that misbehaves
        raw = None

    if not raw:
        return rules  # source stays "rules". This is the degraded, honest path.

    # --- Validate every field the model returned. Anything unusable falls back
    # to the rules value rather than to a default, so a half-answered response
    # still improves on nothing.
    priority = _coerce_priority(raw.get("priority")) or rules.priority

    # The safety floor. A model may raise the priority of a brake complaint; it
    # may not lower it.
    if rules.fault_category in _SAFETY_CRITICAL and (
        _PRIORITY_ORDER[priority] < _PRIORITY_ORDER[rules.priority]
    ):
        priority = rules.priority

    category = raw.get("fault_category")
    if not isinstance(category, str) or not category.strip():
        category = rules.fault_category

    summary = raw.get("summary")
    if not isinstance(summary, str) or not summary.strip():
        summary = rules.summary

    # A suggested technician who does not work here is worse than none. The id
    # must appear in the roster the CALLER supplied.
    valid_ids = {t.id for t in request.technicians}
    suggested = raw.get("suggested_technician_id")
    reason = raw.get("technician_reason")
    if isinstance(suggested, str) and suggested in valid_ids:
        technician_id = suggested
        technician_reason = (
            reason.strip()
            if isinstance(reason, str) and reason.strip()
            else f"Suggested by the model for a {category} fault."
        )
    else:
        technician_id = rules.suggested_technician_id
        technician_reason = rules.technician_reason
        if suggested is not None:
            technician_reason += (
                " (The model proposed a technician who is not on the supplied "
                "roster, so the workload-based suggestion was kept.)"
            )

    confidence = raw.get("confidence")
    if isinstance(confidence, (int, float)) and not isinstance(confidence, bool):
        confidence = round(min(max(float(confidence), 0.0), 1.0), 2)
    else:
        confidence = rules.confidence

    return TriageProposal(
        priority=priority,
        fault_category=category.strip(),
        summary=summary.strip(),
        suggested_technician_id=technician_id,
        technician_reason=technician_reason,
        confidence=confidence,
        source="model",
        # The rules' signals are kept even on the model path: they are why the
        # safety floor is where it is.
        signals=rules.signals,
    )


__all__ = ["triage_by_rules", "triage_service_request"]
