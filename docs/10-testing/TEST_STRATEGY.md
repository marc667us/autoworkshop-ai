# Test strategy

## Layers

| Layer | Tool | Covers |
|---|---|---|
| Unit | Vitest / pytest | Calculations, validation rules, permissions, workflow transitions |
| Integration | Vitest + testcontainers | API ↔ Postgres, Redis, NATS, MinIO, Keycloak |
| Contract | OpenAPI + event schema | Frontend ↔ backend compatibility, event compatibility |
| E2E | Playwright | Principal user journeys per workspace |
| Visual | Playwright screenshots | Component and page regression (**not** Chromatic — ADR-007/009) |
| Accessibility | axe-core | WCAG checks, a release gate |
| Security | semgrep, gitleaks, osv-scanner, bandit, trivy | Code, dependencies, secrets, containers |
| Agent | Evaluation suite | Tool selection, unsafe refusal, approval recognition, grounding |

## Blocking gates

A pull request **cannot merge** if any of these fail:

1. **Tenant isolation** — tenant A must not reach tenant B by any route
2. **Authorization** — role and workflow-stage enforcement
3. **Migration** — forward and rollback
4. **Approval gates** — work cannot enter an authorised stage without approval
5. **AI boundary** — an agent container attempting direct Postgres/object-store/payment access must FAIL,
   and the test asserts that failure
6. **Prompt injection** — a poisoned document must not trigger a tool call
7. **Zero-cost** — no paid dependency introduced

## Domain-specific testing

- **Repair library:** every procedure has required safety, tools, parts, steps and QC information
- **AI:** verified fault scenarios compared against qualified technician assessments
- **Media:** file type, size, decompression limits, malware status, EXIF stripping, permissions
- **Mobile/offline:** camera, audio recording, encrypted offline queue, sync conflict resolution,
  low-bandwidth mode
- **Approval:** work cannot move to *authorised to start* without the required approval

## Philosophy

Tests encode the rules that would otherwise be enforced only by documentation. Where a rule matters —
tenant isolation, approval gating, the AI boundary — there is a test that fails loudly when it is broken.
