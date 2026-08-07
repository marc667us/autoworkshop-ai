# ADR-018 — The repair orchestrator is deterministic, not Google ADK

**Date:** 2026-08-07
**Status:** Accepted
**Decision owner:** the project owner (instructed 2026-08-06, restated on being asked to confirm)

## Context

The owner's customer value chain, step 9: *"an ochestrated agen the takes over
and work with other gaents run with the workshop to fix the car."*

Root `CLAUDE.md` **§0.1** names Google ADK as the only agent framework and
requires any departure to be recorded in an ADR. **§0.2** requires a Root
Orchestrator with department Conductors.

The owner's standing instruction for this project is that Google ADK is **not**
to be used — for building, not merely for opening as a session tool. When this
was (wrongly) re-raised as an open question, the owner restated it.

## Decision

The repair orchestrator ships as a **deterministic rules engine**:
`apps/api/src/repair/repair-orchestration.ts`, a set of pure functions over the
existing 20-stage machine. No agent framework, no model in the loop, no ADK.

This follows the house precedent already set by **Solar**, this project's
reference implementation under ADR-011:

- **ADR-0008 — AI-SOC** — shipped deterministic, no ADK.
- **ADR-0009 — Billing Agent** — shipped deterministic, no ADK.

Solar is the reference implementation, so this is the house style for agent-shaped
work here, not a workaround.

## What "orchestration" means in this implementation

The stage machine already answers two questions: which moves are **legal**
(`STAGE_TRANSITIONS`) and **who may make them** (`ROLE_TARGET_STAGES`). Nothing
answered the operational one a workshop asks every morning:

> Of everything open right now, what needs doing next, by whom, and what is
> nobody doing anything about?

The orchestrator answers exactly that: for each open repair it derives the next
action, the owning role, and — the distinction the staging board cannot make —
**who is being waited on**: the workshop, the customer, or a supplier. It ranks
work the workshop owns above work it is waiting on, because the first kind is the
kind trying harder actually fixes.

## Consequences

**Good.**
- The same card always produces the same instruction. A wrong instruction is a
  bug someone can find and fix, not a prompt someone has to re-tune.
- It is exhaustively testable, and is exhaustively tested: a stage with no
  instruction fails the suite by name. That check was verified by injection —
  removing one stage's entry fails it.
- Zero marginal cost, which the zero-cost rule (ADR-012) requires anyway.

**Limits, stated plainly.**
- It **directs; it does not decide**. It moves no stage and writes no row. The
  stage machine remains the single authority on a repair's state — an
  orchestrator that advanced work silently would be a second authority, and two
  authorities drift.
- The next action per stage is a **fixed mapping**. It does not weigh technician
  skill, bay availability or part lead times. Those are real scheduling inputs
  and would be a separate, larger piece of work.
- It cannot infer anything the stage does not already encode. Notably it cannot
  read a free-text complaint and decide what is wrong with the car.

**If ADK is ever adopted here**, this module is the natural tool surface for it:
the rules are pure and already isolated, so an agent would call them rather than
replace them. Nothing in this decision forecloses that.

## Alternatives considered

- **Google ADK orchestrator (§0.1 default).** Ruled out by the owner's standing
  instruction. Would also require a model provider, which the zero-cost rule
  constrains.
- **A model-in-the-loop that reads the complaint and proposes next steps.**
  Rejected for this slice: the workshop's next action is fully determined by the
  stage, so a model would add nondeterminism, cost and an explanation burden to a
  question that has an exact answer.
- **Do nothing, and rely on the staging board.** Rejected: the board shows where
  a car *is*, and cannot distinguish a repair nobody in the workshop can move
  from one that is somebody's job today. Both look equally busy in their columns.

## Related

- `docs/00-project/CUSTOMER_VALUE_CHAIN.md` — the owner's chain, steps 1–9
- ADR-011 — Solar is the reference implementation, never entangled
- ADR-012 — zero cost, including production
- `apps/api/src/repair/repair-orchestration.ts` + `.spec.ts`
