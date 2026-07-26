# Project scope

## In scope — everything in the specifications, built structurally

The owner rejected all scope cuts proposed by both planners. Every capability in the source specs is
built: the 13 business domains, 7 web applications, a mobile app, 19 MCP servers, ~20 AI agents, WebRTC
voice/video, computer-vision inspection, engine-sound analysis, the 3D repair viewer, OBD integration,
the knowledge and training system, offline-first operation, multilingual support, fleet, insurance,
towing, the supplier marketplace, finance and warranty.

## Staged — content and data, not features

Only two things stage, and neither is a feature:

| Staged | Why | Resolution path |
|---|---|---|
| OEM wiring diagrams, manufacturer repair data | **Licensing** — `2.txt`/`3.txt` both say "where licensing permits" | Library, schema, viewer and test-point tooling all ship; copyrighted content does not |
| Vehicle-specific 3D geometry | **Licensing** — `2.txt` says introduce "progressively" | Viewer ships with generic/CC0 geometry |
| Labelled image corpus (damage estimation) | **Data** — does not exist yet | Baseline vision model + assessor gate; corpus accumulates from confirmed jobs |
| Labelled audio corpus (fault classification) | **Data** — does not exist yet | Spectral feature extraction + technician confirmation; corpus accumulates |

Baseline models are surfaced as *candidate leads with confidence*, never as deterministic diagnosis —
which is exactly what `2.txt` requires ("diagnostic leads rather than final conclusions").

## Out of scope

- Paid tools, subscriptions and mandatory paid services (ADR-012)
- Bundling or mandating any external provider — tenants connect their own (ADR-015)
- Any change to the Solar application (ADR-011)

## Constraints

Zero cost including production · FOSS only · self-hosted · no free-tier lock-in · no entanglement with
Solar · agents never reach the database · tenant isolation is Severity-1.
