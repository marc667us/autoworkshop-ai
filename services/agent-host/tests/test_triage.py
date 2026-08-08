"""Triage: the rules floor, the model overlay, and the honesty of `source`."""

from __future__ import annotations

import pytest

from app.schemas import ServiceRequestInput, Technician, TriageProposal
from app.skills.triage import triage_by_rules, triage_service_request


def test_returns_a_valid_schema_on_a_canned_input(brake_request, unreachable_llm):
    proposal = triage_service_request(brake_request, llm_json=unreachable_llm)

    assert isinstance(proposal, TriageProposal)
    # Re-validating proves the model is constructible from its own dump, which
    # is what the HTTP layer and any future ADK FunctionTool rely on.
    TriageProposal.model_validate(proposal.model_dump())
    assert 0.0 <= proposal.confidence <= 1.0
    assert proposal.summary
    assert proposal.technician_reason


def test_falls_back_to_rules_when_the_llm_is_unreachable(brake_request, unreachable_llm):
    """The headline degradation case: Ollama is down, the desk still works."""
    proposal = triage_service_request(brake_request, llm_json=unreachable_llm)

    assert proposal.source == "rules"  # labelled, not silently passed off
    assert proposal.priority == "urgent"
    assert proposal.fault_category == "braking"
    assert proposal.suggested_technician_id is not None


def test_falls_back_to_rules_when_the_llm_RAISES(brake_request):
    """A misbehaving injected callable must not reach the caller as a 500."""

    def _explodes(_prompt: str):
        raise RuntimeError("connection reset")

    proposal = triage_service_request(brake_request, llm_json=_explodes)
    assert proposal.source == "rules"
    assert proposal.priority == "urgent"


@pytest.mark.parametrize(
    ("complaint", "expected_priority", "expected_category"),
    [
        ("The brakes are grinding", "urgent", "braking"),
        ("There is smoke coming from the bonnet", "urgent", "fire_or_smoke"),
        ("The engine keeps overheating on the motorway", "urgent", "cooling"),
        ("The steering pulls hard to the left", "urgent", "steering_suspension"),
        ("Engine management warning light is on", "high", "engine"),
        ("The clutch is slipping", "high", "transmission"),
        ("Need an MOT and a service", "normal", "routine_service"),
        ("There is a scratch on the rear bumper", "low", "bodywork"),
    ],
)
def test_keyword_rules(complaint, expected_priority, expected_category):
    request = ServiceRequestInput(complaint=complaint)
    proposal = triage_by_rules(request)

    assert proposal.priority == expected_priority
    assert proposal.fault_category == expected_category
    assert proposal.source == "rules"


def test_unrecognised_complaint_is_not_treated_as_low_priority():
    """An unknown fault is uncertain, not unimportant."""
    proposal = triage_by_rules(ServiceRequestInput(complaint="It makes a funny feeling"))

    assert proposal.priority == "normal"
    assert proposal.fault_category == "general"
    assert proposal.confidence <= 0.4  # honest about knowing little


def test_model_path_is_labelled_source_model(brake_request):
    def _llm(_prompt: str):
        return {
            "priority": "urgent",
            "fault_category": "braking",
            "summary": "Front brakes grinding with a soft pedal. Do not drive it.",
            "suggested_technician_id": "tech-3",
            "technician_reason": "Yaw specialises in brakes and has one open job.",
            "confidence": 0.88,
        }

    proposal = triage_service_request(brake_request, llm_json=_llm)

    assert proposal.source == "model"
    assert proposal.suggested_technician_id == "tech-3"
    assert proposal.confidence == 0.88


def test_a_model_may_NOT_downgrade_a_safety_critical_complaint(brake_request):
    """A 3B model answering "low" to a brake fault does not get to win.

    This is the safety floor. The model is allowed to be wrong about wording;
    it is not allowed to be wrong about whether a car with failing brakes goes
    back on the road.
    """
    def _llm(_prompt: str):
        return {
            "priority": "low",
            "fault_category": "braking",
            "summary": "Minor noise.",
            "suggested_technician_id": "tech-1",
            "technician_reason": "any",
            "confidence": 0.9,
        }

    proposal = triage_service_request(brake_request, llm_json=_llm)
    assert proposal.priority == "urgent"


def test_a_model_MAY_escalate(technicians):
    """The floor is one-directional — escalation is still allowed."""
    request = ServiceRequestInput(complaint="Just need a routine service", technicians=technicians)

    def _llm(_prompt: str):
        return {
            "priority": "high",
            "fault_category": "routine_service",
            "summary": "Overdue service.",
            "suggested_technician_id": "tech-1",
            "technician_reason": "least loaded",
            "confidence": 0.6,
        }

    assert triage_service_request(request, llm_json=_llm).priority == "high"


def test_a_technician_who_does_not_work_here_is_rejected(brake_request):
    """A hallucinated assignee is worse than none, so the roster pick is kept."""

    def _llm(_prompt: str):
        return {
            "priority": "urgent",
            "fault_category": "braking",
            "summary": "Brakes grinding.",
            "suggested_technician_id": "tech-999-does-not-exist",
            "technician_reason": "made up",
            "confidence": 0.9,
        }

    proposal = triage_service_request(brake_request, llm_json=_llm)

    assert proposal.suggested_technician_id in {"tech-1", "tech-2", "tech-3"}
    assert "not on the supplied roster" in proposal.technician_reason


def test_garbage_model_fields_fall_back_field_by_field(brake_request):
    """A half-answered response still improves on nothing."""

    def _llm(_prompt: str):
        return {
            "priority": "extremely urgent",  # not in the enum
            "fault_category": "",  # empty
            "summary": None,  # wrong type
            "confidence": "very high",  # wrong type
        }

    proposal = triage_service_request(brake_request, llm_json=_llm)

    assert proposal.priority == "urgent"  # from rules
    assert proposal.fault_category == "braking"  # from rules
    assert proposal.summary  # from rules
    assert 0.0 <= proposal.confidence <= 1.0


def test_confidence_is_clamped(brake_request):
    def _llm(_prompt: str):
        return {
            "priority": "urgent",
            "fault_category": "braking",
            "summary": "x",
            "suggested_technician_id": "tech-1",
            "technician_reason": "y",
            "confidence": 47.0,  # nonsense
        }

    assert triage_service_request(brake_request, llm_json=_llm).confidence == 1.0


def test_technician_pick_prefers_specialism_then_lightest_load(brake_request):
    """tech-1 and tech-3 both do brakes; tech-3 has fewer open jobs."""
    proposal = triage_by_rules(brake_request)

    assert proposal.suggested_technician_id == "tech-3"
    assert "brak" in proposal.technician_reason.lower()
    assert "open job" in proposal.technician_reason


def test_no_technicians_supplied_is_explained_not_crashed():
    proposal = triage_by_rules(ServiceRequestInput(complaint="Brakes grinding"))

    assert proposal.suggested_technician_id is None
    assert "No technicians were supplied" in proposal.technician_reason


def test_no_matching_specialism_falls_back_to_least_loaded():
    request = ServiceRequestInput(
        complaint="There is a scratch on the door",
        technicians=[
            Technician(id="a", display_name="A", skills=["brakes"], open_jobs=5),
            Technician(id="b", display_name="B", skills=["brakes"], open_jobs=2),
        ],
    )
    proposal = triage_by_rules(request)

    assert proposal.suggested_technician_id == "b"
    assert "least loaded" in proposal.technician_reason


def test_triage_is_deterministic(brake_request, unreachable_llm):
    """Same complaint, same answer. A retry that re-prioritises is a bug."""
    first = triage_service_request(brake_request, llm_json=unreachable_llm)
    second = triage_service_request(brake_request, llm_json=unreachable_llm)

    assert first.model_dump() == second.model_dump()


def test_use_llm_false_never_calls_the_model(brake_request):
    def _must_not_be_called(_prompt: str):  # pragma: no cover
        raise AssertionError("the model was called despite use_llm=False")

    proposal = triage_service_request(
        brake_request, llm_json=_must_not_be_called, use_llm=False
    )
    assert proposal.source == "rules"
