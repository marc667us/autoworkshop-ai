# AutoWorkshop AI — IMPLEMENTATION PLAN EXTENSION (v1, revision 2)

**Review status — recorded exactly as it happened, including what the reviewer did not do.**

| Pass | Result |
|---|---|
| Codex 1 | 6 findings (3 High, 3 Medium) against the extension — **all 6 accepted and applied**. Answered 5 of 6 questions; **skipped the coverage question**. No verdict line. |
| Supervisor coverage | **1 CRITICAL omission Codex missed** — see below. Applied as §2A, §2B, Phase 14. |
| Codex 2 | **Zero findings against the extension.** 4 findings against `COMBINED_PLAN_v2` itself (2 High, 2 Medium) — all 4 verified and fixed in that document. No verdict line again. |

**Codex never emitted an `APPROVED` token in either pass**, despite an explicit output format requiring one.
What it did do is raise no CRITICAL or HIGH defect against this extension on pass 2. That is the substance of
an approval, and it is reported as substance rather than dressed up as a verdict the reviewer did not give.
Both transcripts are in the session record.

**Codex pass 1 detail:**
Supervisor coverage pass → **1 CRITICAL omission found that Codex missed**: the whole of `07.txt` part 2
(the workshop-side user model, §1–52) and the community features had no home in the plan. Applied as §2A
and §2B. Codex answered 5 of its 6 review questions and **skipped the coverage question**, which is the one
that would have found this — recorded so the next review weights it accordingly.


**Extends** `COMBINED_PLAN_v2.md`. It does **not** replace it. Every locked decision (D1–D8), every ADR,
the four-gate quality bar, §0.1 ADK-only, §0.2 orchestration-first, §0.3 reusability, the zero-cost rule and
the "build everything structurally, stage only content" principle carry over unchanged and are re-asserted,
not re-litigated.

## 0. Provenance

| Source | Adds |
|---|---|
| `autoworkshop 07.txt` **part 1** (lines 1–1797, §1–25) | Vehicle-user scenarios — Car Owner, Owner-Driver, Organization Transport Manager, Fleet Manager |
| `autoworkshop 07.txt` **part 2** (lines 1798–5069, §1–52) | **A second, separate document: the entire workshop-side user model** — workshop sign-up, staff invitation, Owner / Manager / Reception / Technician scenarios, inboxes, the complete repair flow through QC, release, invoicing, warranty, and per-role workspace navigation |
| `autoworkshop08.txt` (2,444 lines) | 3D Fault Simulation and 3D Repair Solution Simulation |
| `autoworkshop 09.txt` (1,143 lines) | Technical Repair Library, External Technical Research Agent, technician approval |

**Nothing here is a new product direction.** All three specs deepen areas the approved plan already owns:
07 → Phases 4 and 7 · 08 → Phase 10's "3D repair viewer" · 09 → Phases 8 and 9. The extension's job is to
say what "built" now means for those rows, and to name the three places where the new specs impose
constraints the v2 plan does not yet encode.

## 1. Alignment check against COMBINED_PLAN_v2 — no decision is reopened

| v2 decision | Extension's position |
|---|---|
| **D2 stack** (Next + NestJS + Postgres + Redis + Keycloak) | Unchanged. 3D uses Three.js, already named in v2 §2. |
| **D4 / ADR-013** — ADK over MCP, MCP the only cross-language boundary | Unchanged. The three new agents in §5 are ADK agents behind MCP servers. No new boundary. |
| **D5 Keycloak mandatory** | Unchanged. 07's four account types are Keycloak roles + memberships, not a parallel auth path. |
| **D6/D8 zero cost** | Unchanged, and load-bearing here: §7 shows every new capability on FOSS. No paid 3D pipeline, no paid search API, no paid model. |
| **D7 bring-your-own-connection** | Extended: OEM data sources and 3D geometry become tenant-suppliable, per the same principle. |
| **v2 §2 staging rule** — build features, stage content | The governing rule for this whole extension. 08's OEM geometry and 09's manufacturer manuals are **content**, and stage exactly as v2 already ruled for the 3D viewer and knowledge library. |
| **§0.2 orchestration-first** | New agents hang off a conductor, never called from a route. §5 gives the topology. |
| **Four gates** | Unchanged. Codex → Supervisor → Work Reviewer → Work Scheduler. |

**One reconciliation — now DECIDED, not left open** *(Codex finding 2)*. ADR-013 fixes the MCP server count
at **19**, and v2 §3 requires "ALL 19 skeletons from day one". Leaving this open was wrong: Phase 1
scaffolding, the gateway allowlist, CI contract tests and package layout all key off that number, so an
unresolved count is a blocking ambiguity dressed up as a question.

**Decision: the three new surfaces are CAPABILITIES on existing servers, not new servers. The count stays 19.**
`repair-library` and `external-research` are capabilities of the knowledge server; `simulation` is a capability
of the diagnostics server. Rationale: the gateway allowlist and audit surface stay stable, ADR-013 needs no
amendment, and nothing in specs 08/09 requires process isolation between these and the knowledge/diagnostics
surfaces they already sit beside. The owner can overrule; if so it is an ADR-013 amendment and a Phase 1
scaffolding change, which is why it is settled here rather than at build time.

---

## 2. Spec 07 — vehicle users. Extends Phases 4 and 7.

07 is the most immediately actionable of the three because it constrains screens already scheduled.

### 2.1 What it adds

- **Four account types chosen at sign-up** (§3): Car Owner, Owner-Driver, Organization Transport Manager,
  Fleet Manager. Each has different verification, different workspace provisioning and different approval
  limits. Today's Phase 2 identity work has organizations and memberships but no account-type concept.

  **Invariant, because "chosen at sign-up" is a privilege-escalation hole if taken literally**
  *(Codex finding 6 — accepted)*. The account type a user *selects* is a **request**, never a grant:
  - Car Owner and Owner-Driver are **self-service** — they confer no authority over anyone else's data.
  - Organization Transport Manager and Fleet Manager **require organization approval** before any elevated
    capability activates; §3.3/§3.4 already say the user joins an organization "subject to approval".
  - Account type is **single-valued and not self-mutable**; changing it is an administrative action with an
    audit record, not a profile edit.
  - **Authority derives from membership and role, never from the account type claim itself.** The account
    type shapes onboarding and which workspace is provisioned; it is not an input to any authorization
    decision. This keeps the rule that tenant context comes only from validated claims and membership.
- **"My Workspace" entry flow** (§6) — a single Home Page control that resolves to a different workspace per
  role, after checking role, organization, vehicle registration and approval authority.
- **Personal vehicle workspace + My Repair Dashboard** (§7) — the Car Owner's end-to-end journey: request
  service → quotation → approve/reject/modify → progress → QC → payment → history.
- **Emergency towing flow with live location** (§8, §15) — permission-gated geolocation, provider selection,
  live tracking, and conversion of a towing record into a repair request.

  **Location is the most sensitive data this product handles, and "permission-gated" was not an acceptance
  criterion** *(Codex finding 3 — accepted)*. Binding criteria, all testable:
  - **Retention**: precise location is retained only for the life of the active towing request plus a defined
    window for dispute resolution, then coarsened to the pickup locality. Not indefinite.
  - **Sharing**: shared only with the *accepted* provider, only while the request is active. Not with
    providers who merely saw the request, and not with the workshop unless the vehicle is delivered there.
  - **Organization and fleet visibility**: a Transport or Fleet Manager sees vehicle location for *fleet*
    vehicles only, never for a driver's personal vehicle, and §19's moderation rule against publishing
    confidential fleet information applies to any derived view.
  - **Revocation**: the user can stop sharing mid-request; the request degrades to a manually-entered
    pickup point rather than failing.
  - **Denied permission is a supported path, not an error state** — an emergency flow that dead-ends when
    the browser denies geolocation is unusable at exactly the moment it matters. Manual address or map-pin
    entry is required.
  - **Audit**: every location read, share and revocation is an audit event with actor, purpose and recipient.
- **Organization and fleet flows** (§9, §10) — multi-vehicle views, approval limits, cost centres,
  delegated authority.

### 2.2 Where it lands

| Work | Phase | Release |
|---|---|---|
| Account types, verification variants, workspace provisioning per type | **2** (identity) | — |
| `My Workspace` resolver + Home Page card | **3** (shell) — extends the shell already built | 0.2.x |
| Personal vehicle workspace, My Repair Dashboard, service request, approve/reject/modify | **4** | 0.3 |
| Organization Transport + Fleet Manager workspaces, approval limits, cost centres | **7** | 0.6 |
| Emergency towing request, provider dispatch, live tracking | **7** | 0.6 |

### 2.3 Consequence for work already done

`viewerGrants()` (the demo grant source in `packages/next-shell`) becomes account-type aware when T-0003/T-0005
land. **This is the single function already flagged as "the one to replace"** — 07 does not add a second
place to change, which is the outcome the shell was designed for.

The 7-workspace navigation model gains no new workspace: Car Owner and Owner-Driver are both the `customer`
workspace with different grants; Transport Manager and Fleet Manager are both `fleet`. **Account type ≠
workspace.** Conflating them would fork the nav tree four ways for no benefit.

---

---

## 2A. Spec 07 part 2 — the workshop-side user model. Extends Phase 5.

**This section was missing from the first draft of this extension and was caught by the Supervisor coverage
pass, not by the reviewer.** Recorded plainly because the owner's standing direction is *stop cutting*, and a
silently omitted half of a specification is the most expensive kind of cut — it looks like a finished plan.

Lines 1798–5069 are a second document with its own §1–52. v2's Phase 5 already owns "workshop dashboard,
reception, intake, complaint inbox, job cards, repair staging board, technician/bay assignment, inspection,
diagnosis, repair plan, quotation, Solution Studio, execution, testing, QC, release". 07 part 2 does not add
a new product area — **it specifies that row operationally**, which is what Phase 5 needs in order to be
buildable rather than aspirational.

### 2A.1 What it pins down

| Spec | Adds | Lands |
|---|---|---|
| §2, §3 | Workshop sign-up and **staff invitation flow** — roles, default permissions, approval limits assigned at invitation | Phase 2 (identity) |
| §5–§9 | Workshop Home Page and the **Owner / Manager / Reception / Technician** scenarios | Phase 5 |
| §10–§12 | **Repair Request inbox, Customer Complaint inbox, Notification inbox** | Phase 5 |
| §14–§17 | Technician dashboard, initial inspection, fault-diagnosis tools, knowledge-base access | Phase 5 |
| §18–§21 | Repair procedures library, DTC search, **fault simulation and repair-solution simulation entry points** | Phase 9 / 12 (the tools themselves), Phase 5 (the entry point) |
| §22–§26 | Repair planning, plan-work tool, find-parts, parts compatibility, tools/equipment planning | Phase 5 / 6 |
| §27–§30 | **Internal technical review, specialist consultation**, quotation preparation, customer approval | Phase 5 |
| §31–§39 | Repair execution, **variation flow**, technician time recording, test results, post-repair scan, road test, QC, vehicle release | Phase 5 |
| §40–§44 | Invoice preparation, send invoice, receive payment, **partial payment and balance**, workshop warranty, return/warranty claim | Phase 7 |
| §46–§50 | **Per-role workspace navigation** for all four workshop roles + role-based control summary | Phase 3 (nav model) |
| §51, §52 | Complete workshop repair flow + acceptance criteria | Phase 5 acceptance |

### 2A.2 The one structural consequence

§46–§50 give four *distinct* navigation trees inside the single `workshop` workspace. The navigation model in
`packages/navigation` currently holds one tree per workspace. It must become **workspace × role**, resolved
through the same grant filter the shell already uses — not a second mechanism. This is a real change to
shipped code and is scheduled in Phase 3, ahead of Phase 5 consuming it.

§50's "role-based control summary" is the authority for who sees what; it is transcribed into the permission
matrix (`docs/01-product/PERMISSION_MATRIX.md`), not re-invented per screen.

---

## 2B. Community and content — genuinely new, in no existing phase

Three sections of 07 have **no home in the v2 phase table**, and pretending otherwise would be the same
omission again:

| Spec | Feature | Placement |
|---|---|---|
| 07 part 1 §18 | **Auto Repair News Feed** | New Phase 14 → Release 1.3 |
| 07 part 1 §19 | **AutoWorkshop Social Media App** — posts, follows, moderation | New Phase 14 → Release 1.3 |
| 07 part 2 §45 | **Workshop social and knowledge contribution** | New Phase 14 → Release 1.3 |

v2's Phase 9 covers *communication* (chat, voice, video, call summaries) and *knowledge* (CMS, dictionary,
semantic search). Neither is a public feed or a social graph. These are a distinct product surface with their
own moderation, abuse-reporting and content-policy requirements — 07 §19 already lists the moderation rules
(no private customer records, no unapproved repair documents, no personal contact details without consent, no
misleading technical instructions, no unsafe repair practices, no confidential fleet information).

**Placed last, not cut.** They depend on identity, workshops, repair history and the knowledge library all
existing first, and they carry a moderation burden that should not land before 1.0 hardening.

---

## 3. Spec 08 — 3D fault and repair simulation. Extends Phase 10.

v2 already commits to a Three.js viewer with "rotate/zoom/hide/isolate, exploded views, component metadata,
assembly order, animated overlays, generic + CC0 geometry", staging only *vehicle-specific OEM geometry*.
08 turns that viewer into a **diagnostic instrument**, which is a substantially larger deliverable.

### 3.1 What it adds beyond a viewer

1. **A 7-layer vehicle model** (§5) — exterior, structural, mechanical, electrical, electronic/comms,
   fluid/air, hybrid-EV. Layers isolate independently.
2. **Fault simulation** (§7, §10) — inject a fault condition, show predicted propagation and symptoms,
   compare predicted against observed evidence, produce a similarity assessment.
3. **Diagnostic measurement simulation** (§11) — highlight the test point, show expected values, accept the
   technician's **measured** value, and re-rank probable cause from the difference.
4. **Repair procedure animation in 7 stages** (§15) — preparation, safety isolation, access/disassembly,
   repair/replace, reassembly, configuration/calibration, testing/QC.
5. **Alternative solution comparison** (§19) — e.g. repair harness vs replace sub-harness vs replace
   harness, compared on cost, time, durability and risk.
6. **Fault Condition Library** (§9) — electrical, sensor/actuator, network/module, mechanical, fluid/thermal.
7. **Before-and-after simulation** (§18) and **tools/parts integration** (§16, §17).

### 3.2 The honest scope call

**This is not a Phase 10 sub-task. It is a module the size of Phase 5.** Presenting it as a bullet inside an
existing row would repeat the mistake v2 §2 explicitly corrected — under-scoping by inheriting an old
estimate. So:

- **Phase 10 keeps** the viewer, the 7-layer model, component metadata, isolation, exploded views,
  CC0/generic geometry, and the before/after presentation. **Release 0.9.**
- **A new Phase 12 — Simulation Intelligence — takes** fault injection, propagation modelling, measurement
  simulation, probable-cause re-ranking, procedure animation and alternative comparison. **Release 1.1**,
  after the 1.0 hardening release.

Rationale for sequencing after 1.0: §11 measurement simulation consumes confirmed diagnostic data, and §14's
repair-solution flow depends on the Phase 9 library and the Phase 8 approval gate. Building it earlier means
building it against fixtures. **This is dependency order, not a cut** — v2 §2's "sequencing is not scope"
applies exactly.

### 3.3 Staging — content only, per v2 §2

| Built in full | Staged | Blocker |
|---|---|---|
| Model loader, 7-layer isolation, fault-injection engine, propagation graph, measurement comparison, probable-cause ranking, animation timeline, alternatives comparison, tool/part overlays, the whole Fault Condition Library **schema and its generic entries** | *Vehicle-specific OEM geometry*; OEM-authored procedure timings | **Licensing** — identical to v2's existing 3D row |
| Physics-free behavioural simulation (state propagation over a typed system graph) | High-fidelity multiphysics | **Not required by the spec** — §1 says the simulation "shall support technical decision-making but shall not replace physical inspection" |

The propagation model is a **directed system graph with typed dependencies**, not a physics engine. That
satisfies §10's requirement to show fault propagation, runs in a browser, and costs nothing.

---

## 4. Spec 09 — technical repair library and research agent. Extends Phases 8 and 9.

v2's Phase 9 already commits to a full knowledge CMS with authoring, versioning, technical/safety/copyright
review roles, publication workflow, applicability indexing and pgvector semantic search. 09 specifies the
**automotive-specific structure** on top of that, plus the agent chain and — most importantly — the
**legal and accountability constraints**.

### 4.1 Library structure (§3)

Vehicle catalogue · vehicle-systems catalogue · fault/symptom records · diagnostic procedures · repair
procedures · tools and equipment · diagrams. All tenant-scoped, all versioned, all with the review workflow
Phase 9 already owns.

### 4.2 The agent chain (§6, §7) — three ADK agents

| Agent | Does | Class |
|---|---|---|
| **Repair Knowledge Agent** | Searches the internal library; judges completeness, verification and applicability | A — read-only |
| **External Technical Research Agent** | Activated only when the internal search is insufficient; searches approved sources, extracts, drafts | B — drafts, changes nothing |
| **Library Update Agent** | Prepares an accepted solution for library review | B — proposes, never publishes |

**None of the three may approve, authorize expenditure, begin work, issue parts, alter vehicle records,
copy protected manuals, conceal safety concerns, or replace the accountable technician** (§15). These are
not policy text — they are enforced by tool class and by the approval ledger from ADR-010/§0.2, which is
where v2 already put this boundary.

### 4.3 Technician approval is the product, not a checkbox

§8's Technician Inbox and §19's full flow make the human gate the centre of the design: the technician
**accepts, rejects or requests modification**, and on acceptance **becomes the accountable technical
reviewer**. §9 forbids showing the customer unreviewed agent conclusions, raw manufacturer documents,
internal uncertainty notes or research logs.

This aligns exactly with v2's existing Class C/D gating and the CV/sound "candidate leads, never
deterministic diagnosis" stance. **The extension inherits it rather than inventing a parallel mechanism.**

### 4.4 Copyright and document control (§14) — a hard constraint, new to the plan

Every external record must retain source, title, revision date, access date, **usage rights, storage
permission, distribution limitation** and reviewer. Content is classified as publicly reusable · licensed ·
**link-only** · internal summary · internally created · restricted. Where content cannot be stored, the
system stores **a compliant summary and a reference instead**.

**This is a schema requirement and a blocking gate, not a policy note.** It gets:
- a `content_rights` classification on every library record and diagram, non-null, no default;
- a copyright-review role in the publication workflow (Phase 9 already has the role — 09 makes it mandatory
  for external-origin records);
- a CI check that no record reaches `approved` with `content_rights` unset;
- the research agent forbidden from bypassing authentication, paywalls or access controls (§7.10) — enforced
  in the fetcher, which refuses non-approved hosts and honours `robots.txt`.

### 4.5 Confidence classification (§12)

High / medium / low, carried on every agent output and every library record, and surfaced in the technician
inbox. Same discipline as v2's CV and sound modules. **An agent output with no confidence is a defect.**

### 4.6 Where it lands

| Work | Phase | Release |
|---|---|---|
| Library schema, catalogues, fault/symptom records, procedures, tools, diagrams, `content_rights`, review workflow, semantic search | **9** | 0.8 |
| Repair Knowledge Agent, technician inbox, accept/reject/modify, accountability record | **9** | 0.8 |
| External Technical Research Agent, approved-source registry, robots/paywall guard, source recording, conflict detection | **9** | 0.8 |
| Library Update Agent, library review queue, record status, supersession | **9** | 0.8 |
| Library Administration Dashboard + analytics (§16, §17) — knowledge gaps, failed searches, broken sources | **New Phase 13** | 1.2 |

---

## 5. Agent topology — §0.2 compliance

```
Root Orchestrator
└── knowledge_conductor            (SequentialAgent)
    ├── RepairKnowledgeAgent       internal library search        Class A
    ├── ExternalResearchAgent      approved-source research       Class B
    └── LibraryUpdateAgent         prepares records for review    Class B
└── diagnostics_conductor          (LoopAgent — diagnose → measure → re-rank)
    ├── FaultSimulationAgent       propagation + prediction       Class A
    └── MeasurementAgent           compares expected vs measured  Class A
```

Specialists never call specialists. Routes never call specialists. The loop in `diagnostics_conductor` is
ADK `LoopAgent`, not a hand-rolled while — §0.1.

---

## 6. Data model additions (all tenant-scoped, RLS FORCE, TEXT not VARCHAR)

`account_types` · `workspace_provisioning` · `service_requests` · `towing_requests` · `approval_limits` ·
`cost_centres` · `library_records` · `vehicle_catalogue` · `vehicle_systems` · `fault_records` ·
`diagnostic_procedures` · `repair_procedures` · `tools_equipment` · `diagrams` · `external_sources` ·
`content_rights` · `research_requests` · `technician_reviews` · `library_review_queue` ·
`vehicle_3d_models` · `fault_conditions` · `simulation_sessions` · `measurement_records` ·
`repair_alternatives`.

Append-only, per CLAUDE.md: `technician_reviews`, `research_requests`, `library_review_queue`, and every
approval event. `RETURNING id`, never `lastrowid`. Indexes per the tenant baseline.

---

## 7. Zero-cost confirmation (D6/D8)

| Need | FOSS choice | Cost |
|---|---|---|
| 3D rendering | Three.js | 0 |
| 3D geometry | CC0 / generic + tenant-supplied (D7) | 0 |
| Model format | glTF/GLB | 0 |
| Propagation model | typed system graph, our code | 0 |
| Semantic search | pgvector | 0 |
| Agent runtime | Google ADK + local Ollama | 0 |
| External fetch | our fetcher, robots-respecting, approved hosts only | 0 |
| Geolocation (towing) | browser Geolocation API + OSM/Leaflet tiles | 0 |
| Live tracking | existing NATS + WebSocket | 0 |

**No paid dependency is introduced.** No commercial 3D pipeline, no paid search API, no hosted model.

---

## 8. Phase table — v2 extended, nothing renumbered

| Phase | Release | Change |
|---|---|---|
| 2 Identity | — | **+** account types (as requests), verification variants, workspace provisioning, **workshop staff invitation with role + approval limits** |
| 3 Shell | 0.2.x | **+** My Workspace resolver + Home Page card, **navigation model becomes workspace × role** (07 pt2 §46–§50) |
| 4 Customer + Vehicle | 0.3 | **+** personal vehicle workspace, My Repair Dashboard, service request, approve/reject/modify, search technician/workshop, repair work history |
| 5 Workshop + Repair | 0.4 | **+** the whole of 07 pt2 §5–§39: Owner/Manager/Reception/Technician scenarios, three inboxes, inspection, planning, internal review, specialist consultation, execution, variation, time recording, tests, road test, QC, release |
| 7 Finance + Partners | 0.6 | **+** transport-manager and fleet workspaces, approval limits, cost centres, emergency towing + tracking + **location privacy criteria**, invoicing, partial payment, workshop warranty and return claims |
| 8 MCP + AI | 0.7 | **+** 3 knowledge agents registered, Class A/B; simulation agents scaffolded |
| 9 Communication + Knowledge | 0.8 | **+** the whole 09 library, agent chain, technician inbox, copyright control |
| 10 Multimedia | 0.9 | **+** 7-layer model, isolation, exploded views, before/after |
| 11 Hardening | 1.0 | unchanged |
| **12 Simulation Intelligence** *(new)* | **1.1** | fault injection, propagation, measurement simulation, cause re-ranking, procedure animation, alternatives |
| **13 Knowledge Operations** *(new)* | **1.2** | library admin dashboard, analytics, knowledge-gap reporting, source health |
| **14 Community** *(new)* | **1.3** | auto-repair news feed, social app, workshop knowledge contribution, moderation and abuse reporting (07 pt1 §18–§19, pt2 §45) |

---

## 9. Open questions — separated into blocking and non-blocking

The first draft labelled everything here "nothing is blocked" while simultaneously asking the owner to
confirm sequencing. That was incoherent *(Codex finding 4 — accepted)*. Split properly:

**Resolved in this revision — no longer questions:**
- MCP server count → **capabilities, count stays 19** (§1).
- Account-type authority → **request, not grant; authority from membership** (§2.1).
- Location retention/sharing/revocation → **binding criteria** (§2.1).

**Genuinely blocking — must be answered before the work it gates starts:**
1. **Approved-source registry ownership** — who authorises a host for the External Research Agent? Blocks
   Phase 9's research agent, nothing earlier. Recommendation: platform admin, plus a per-tenant opt-in list
   under D7.

**Non-blocking product decisions — the owner may change these at any time before the phase starts:**
2. **Phase 12/13/14 sequencing after 1.0.** They can be pulled earlier at the cost of building against
   fixtures. Nothing in Phases 1–11 depends on the answer, and **no Phase 1–11 artefact may advertise these
   capabilities as present** — that is the condition that keeps the question non-blocking.
3. **Capacity claim inherited from v2** *(Codex finding 5)*. v2 §9 calls a single always-free ARM VM running
   Postgres + Keycloak + Redis + MinIO + coturn + observability "comfortable". That is an untested assertion,
   and this extension adds 3D asset serving and semantic search on top of it. It is not this extension's
   claim to make or unmake, but it **must become a measured benchmark gate in Phase 11** with stated minimum
   concurrency and media limits, rather than an adjective.

## 10. Risks

| Risk | Mitigation |
|---|---|
| 3D simulation scope creeps into a physics project | §3.3 fixes it as a typed graph; §1 of the spec explicitly forbids replacing physical inspection |
| External research agent scrapes something it must not | Approved-host allowlist, robots.txt, no auth/paywall bypass, refusal by default, every fetch audited |
| Copyright classification skipped under delivery pressure | Non-null column + CI gate; a record cannot reach `approved` without it |
| Agent output treated as diagnosis | Confidence on every output; technician acceptance is the only path to a customer-facing document |
| Library seeded with unverified content | `Library Update Agent` proposes only; review queue is the sole publication path |

## 11. Definition of done

Unchanged from v2 / `05.txt` §6, plus two additions specific to this extension:
- **no library record reaches `approved` with `content_rights` unset**;
- **no agent output reaches a customer-facing surface without a recorded technician acceptance.**
