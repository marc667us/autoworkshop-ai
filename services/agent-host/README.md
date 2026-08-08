# AutoWorkshop AI — Agent Host

A small, stateless Python service with three skills:

| Skill | What it does |
|---|---|
| **Triage** | Turns a customer's free-text complaint into a priority, a fault category, a plain-English summary for reception, and a suggested technician — with a stated reason and a confidence. |
| **Supplier discovery** | Reads one allowlisted web page and extracts candidate suppliers and parts. |
| **Lead discovery** | Reads one allowlisted web page and extracts candidate customers — fleets, garages, taxi operators, dealerships. |

---

## 🔴 It holds no credentials and it cannot reach the database

This is the point of the service, not a footnote. Stated plainly:

- **There is no database connection, and no way to make one.** No `psycopg`, no
  `asyncpg`, no SQLAlchemy, no DSN, no connection string. The dependency is not
  installed and the config object has no field to put one in.
- **It holds no database, storage, payment or admin credential.** It knows
  exactly two secrets, neither of which grants access to any of this system's
  data: `AGENT_HOST_TOKEN`, the shared secret callers present *to* it, and the
  optional `SCRAPEGRAPH_API_KEY`, which buys a hosted extraction backend and
  nothing else.
- **Data arrives as JSON in the request and leaves as JSON in the response.**
  Everything a skill knows — the complaint, the vehicle, the roster of
  technicians and their workloads — is passed *in* by the caller. The service
  looks nothing up.
- **Nothing it returns is a decision.** Every output is a *proposal* for a human
  or a domain service to accept or override.

This is `CLAUDE.md` §3 / ADR-010, and it is **asserted, not promised** —
`tests/test_adr010_boundary.py` greps every source file for a driver import,
parses the AST for nested imports, checks `sys.modules` after importing the
package, and fails the build if `pyproject.toml` ever declares one.

---

## Running it

```bash
# from services/agent-host
./.venv/Scripts/python.exe -m uvicorn app.http:app --port 8099
```

Configuration is entirely from the environment — there are no hardcoded paths.

| Variable | Default | Meaning |
|---|---|---|
| `AGENT_HOST_TOKEN` | *(empty)* | Shared secret for every route. **Empty means every request is refused.** |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Local model server. |
| `OLLAMA_TEXT_MODEL` | `llama3.2` | Model used for triage. |
| `LLM_TIMEOUT_SECONDS` | `60` | Bounded. On timeout, triage degrades to rules. |
| `SCRAPEGRAPH_API_KEY` | *(empty)* | **Optional.** Empty = local Ollama extraction, zero cost. |
| `SCRAPE_ALLOWLIST` | *(empty)* | Comma-separated hosts. **Empty means no page may be fetched.** |
| `SCRAPE_TIMEOUT_SECONDS` | `20` | Per-request bound. |
| `SCRAPE_MAX_BYTES` | `2000000` | Response read bound. |
| `SCRAPE_MIN_INTERVAL_SECONDS` | `2.0` | Politeness gap between fetches of one host. |
| `SCRAPE_RESPECT_ROBOTS` | `true` | Honour `robots.txt`. |

### Routes

All four require `Authorization: Bearer $AGENT_HOST_TOKEN`, compared with
`hmac.compare_digest`. **When the token is unset every route is refused, not
opened** — a missing configuration must never become a public endpoint. The
shape is copied from the NestJS notifications drain
(`apps/api/src/notifications/notifications.controller.ts`).

```
GET  /health
POST /triage
POST /discover/suppliers
POST /discover/leads
```

`/health` is authenticated too: an open health endpoint tells a stranger which
model this host runs and whether it is up.

---

## Triage degrades; it does not fail

A workshop cannot stop taking cars in because a local model is slow. So the
deterministic keyword rules run **first and unconditionally**, and the model is
an overlay on a result that is already complete and usable.

- `source: "rules"` — the model was unreachable, slow, or returned nonsense.
- `source: "model"` — the model answered and its answer was validated.

The field is never guessed at, because a rules-derived priority and a
model-derived one carry very different weight at a reception desk.

**A model may escalate a safety-critical complaint but may never downgrade
one.** If the rules matched brakes, smoke, overheating, steering, fuel or
restraints, a small model answering "low" does not get to put the car back on
the road. A technician the model invents is likewise rejected — the suggested id
must appear in the roster the caller supplied.

> **Measured on this workstation:** `llama3.2` on CPU took ~150 s for a full
> triage and ~95 s warm for a trivial prompt. With the default 60 s bound the
> model path will therefore **not** engage here and triage runs on rules — which
> is the designed behaviour, not a fault. Raise `LLM_TIMEOUT_SECONDS`, use a
> smaller model, or provide a GPU if you want the model path in practice.

---

## Extraction backends — bring your own connection (ADR-015)

Scraping extraction has two interchangeable backends behind one contract, the
same shape as `apps/api/src/notifications/mail-transport.ts`:

| Backend | Selected when | Cost |
|---|---|---|
| `local-ollama` | **default — no key set** | Zero. |
| `hosted-scrapegraph` | `SCRAPEGRAPH_API_KEY` is set | Bills credits. |

The local path is the **supported default**, not a degraded stub: ADR-012 makes
zero cost a hard rule, so the product is fully functional with no key at all.

Choosing a backend **does not change the response schema**. Callers cannot tell
which ran except through the explicit `extraction_backend` field.

**The key is never a literal in source.** It is read from the environment
through `Settings` and nowhere else — no default argument, no fixture, no
docstring example. This repository is public and gitleaks scans history on every
push, so `describe()` reports only *that* a key is configured (tested against
every 4-character substring of the key), and a test scans the tree for the
credential prefix.

---

## Scraping safety

The only outbound request to a caller-supplied address is in `app/scraping.py`,
written on the assumption that the URL is hostile. Four guards, in order:

1. **Allowlist** — from config, not from the caller. Unset means nothing is
   fetchable.
2. **Resolved-IP check** — the hostname is *resolved* and every address it
   answers with must be public. Loopback, RFC1918, link-local, reserved,
   multicast, `0.0.0.0`, cloud metadata (`169.254.169.254`) and IPv4-mapped IPv6
   are all refused. Checking the string would be decorative: the attacker owns
   the DNS record.
3. **robots.txt** — parsed with `urllib.robotparser`, but fetched with `httpx`
   under our own timeout, because `RobotFileParser.read()` has none.
4. **Bounds** — timeout, response size, per-host rate limit, real User-Agent.

**Redirects are not followed automatically.** An allowlisted host answering
`302 → http://127.0.0.1/` would walk straight past guards 1 and 2, which already
ran against the *original* URL, so every hop is re-validated from scratch.

**scrapegraph-ai is never handed a URL** — only HTML this service already
fetched. Its own fetcher can therefore never run, and never bypass any of the
above. The hosted client is called with `html=`, never `url=`, for the same
reason.

---

## Tests

```bash
./.venv/Scripts/python.exe -m pytest -q
```

98 passed, 0 failed, 0 skipped. The suite is hermetic — no network, no model, no
database. Fetching and extraction are injected, which is what being pure
functions buys.

Each guard was verified **by injection** rather than assumed: disabling the
resolved-IP check fails 9 tests, sneaking a function-local `import psycopg` into
a module fails 2, and making auth fail *open* fails 4.

---

## Why there is no agent framework here

No ADK, LangChain, LangGraph, AutoGen or CrewAI agent loop — per **ADR-018**,
which records the same decision for the repair orchestrator, and Solar's
precedent (ADR-0008, ADR-0009) of shipping agent-shaped work deterministically.
There is no loop to build one on: each skill is one pure function.

scrapegraph-ai vendors LangChain as its own internal dependency. That is
unavoidable and permitted — what is forbidden is building *our* reasoning loop
on it.

Every skill is a **pure function over typed pydantic models**
(`app/schemas.py` is the contract surface), so wrapping one in an ADK
`FunctionTool` in Phase 8 is a wrapper, not a rewrite:

```python
from app import triage_service_request, ServiceRequestInput   # already exported
```
