# Review: codex-review

_Generated: 2026-07-27T16:05:16-07:00 · backend: codex · model: llama3.2_

## Prompt

> You are Codex acting as Independent Pair Programmer for this repository. Review the latest implementation against the stated requirement in README.md and (if present) docs/IMPLEMENTATION_LOG.md. Identify anything Claude Code missed, misunderstood, or only partially implemented. Return a checklist of defects with: severity (critical/high/medium/low), file:line, what's wrong, recommended fix, why it matters.

## Repository context

### Changed files (HEAD~1..HEAD)
```
 apps/admin-web/next.config.mjs      | 14 -------------
 apps/customer-web/next.config.mjs   | 14 -------------
 apps/fleet-web/next.config.mjs      | 14 -------------
 apps/insurance-web/next.config.mjs  | 14 -------------
 apps/supplier-web/next.config.mjs   | 14 -------------
 apps/towing-web/next.config.mjs     | 14 -------------
 apps/workshop-web/next.config.mjs   | 14 -------------
 scripts/guardrails/verify_claims.py | 40 +++++++++++++++++++++++++++++--------
 8 files changed, 32 insertions(+), 106 deletions(-)
```

### Diff snippet (first 100 lines)
```diff
diff --git a/apps/admin-web/next.config.mjs b/apps/admin-web/next.config.mjs
index 9d12f4b..ac1fcc3 100644
--- a/apps/admin-web/next.config.mjs
+++ b/apps/admin-web/next.config.mjs
@@ -22,20 +22,6 @@ const constrainedBuild = process.env.SKIP_BUILD_CHECKS === '1';
 const nextConfig = {
   eslint: { ignoreDuringBuilds: constrainedBuild },
   typescript: { ignoreBuildErrors: constrainedBuild },
-  /**
-   * One worker, in-process, on the deploy builder.
-   *
-   * After the checks were skipped the build still died — instantly, in the same
-   * second, with no output, at "Collecting page data". That step forks a worker
-   * pool sized from the CPU count, and an immediate silent death there is the
-   * pool failing to start rather than a page failing to load: a page that
-   * throws prints its own stack. Next swallows a worker that never comes up.
-   *
-   * `cpus: 1` plus `workerThreads: false` keeps page collection in one process.
-   * It is slower, which is irrelevant for a deploy and would be annoying
-   * locally — hence the flag.
-   */
-  experimental: constrainedBuild ? { cpus: 1, workerThreads: false } : {},
   reactStrictMode: true,
   // Shared workspace packages are compiled by this app rather than pre-built,
   // so a token change is picked up without a separate build step.
diff --git a/apps/customer-web/next.config.mjs b/apps/customer-web/next.config.mjs
index 9d12f4b..ac1fcc3 100644
--- a/apps/customer-web/next.config.mjs
+++ b/apps/customer-web/next.config.mjs
@@ -22,20 +22,6 @@ const constrainedBuild = process.env.SKIP_BUILD_CHECKS === '1';
 const nextConfig = {
   eslint: { ignoreDuringBuilds: constrainedBuild },
   typescript: { ignoreBuildErrors: constrainedBuild },
-  /**
-   * One worker, in-process, on the deploy builder.
-   *
-   * After the checks were skipped the build still died — instantly, in the same
-   * second, with no output, at "Collecting page data". That step forks a worker
-   * pool sized from the CPU count, and an immediate silent death there is the
-   * pool failing to start rather than a page failing to load: a page that
-   * throws prints its own stack. Next swallows a worker that never comes up.
-   *
-   * `cpus: 1` plus `workerThreads: false` keeps page collection in one process.
-   * It is slower, which is irrelevant for a deploy and would be annoying
-   * locally — hence the flag.
-   */
-  experimental: constrainedBuild ? { cpus: 1, workerThreads: false } : {},
   reactStrictMode: true,
   // Shared workspace packages are compiled by this app rather than pre-built,
   // so a token change is picked up without a separate build step.
diff --git a/apps/fleet-web/next.config.mjs b/apps/fleet-web/next.config.mjs
index 9d12f4b..ac1fcc3 100644
--- a/apps/fleet-web/next.config.mjs
+++ b/apps/fleet-web/next.config.mjs
@@ -22,20 +22,6 @@ const constrainedBuild = process.env.SKIP_BUILD_CHECKS === '1';
 const nextConfig = {
   eslint: { ignoreDuringBuilds: constrainedBuild },
   typescript: { ignoreBuildErrors: constrainedBuild },
-  /**
-   * One worker, in-process, on the deploy builder.
-   *
-   * After the checks were skipped the build still died — instantly, in the same
-   * second, with no output, at "Collecting page data". That step forks a worker
-   * pool sized from the CPU count, and an immediate silent death there is the
-   * pool failing to start rather than a page failing to load: a page that
-   * throws prints its own stack. Next swallows a worker that never comes up.
-   *
-   * `cpus: 1` plus `workerThreads: false` keeps page collection in one process.
-   * It is slower, which is irrelevant for a deploy and would be annoying
-   * locally — hence the flag.
-   */
-  experimental: constrainedBuild ? { cpus: 1, workerThreads: false } : {},
   reactStrictMode: true,
   // Shared workspace packages are compiled by this app rather than pre-built,
   // so a token change is picked up without a separate build step.
diff --git a/apps/insurance-web/next.config.mjs b/apps/insurance-web/next.config.mjs
index 9d12f4b..ac1fcc3 100644
--- a/apps/insurance-web/next.config.mjs
+++ b/apps/insurance-web/next.config.mjs
@@ -22,20 +22,6 @@ const constrainedBuild = process.env.SKIP_BUILD_CHECKS === '1';
 const nextConfig = {
   eslint: { ignoreDuringBuilds: constrainedBuild },
   typescript: { ignoreBuildErrors: constrainedBuild },
-  /**
-   * One worker, in-process, on the deploy builder.
-   *
-   * After the checks were skipped the build still died — instantly, in the same
-   * second, with no output, at "Collecting page data". That step forks a worker
-   * pool sized from the CPU count, and an immediate silent death there is the
-   * pool failing to start rather than a page failing to load: a page that
-   * throws prints its own stack. Next swallows a worker that never comes up.
-   *
-   * `cpus: 1` plus `workerThreads: false` keeps page collection in one process.
-   * It is slower, which is irrelevant for a deploy and would be annoying
-   * locally — hence the flag.
-   */
-  experimental: constrainedBuild ? { cpus: 1, workerThreads: false } : {},
   reactStrictMode: true,
   // Shared workspace packages are compiled by this app rather than pre-built,
   // so a token change is picked up without a separate build step.
```

## Findings

Findings checklist:

- [ ] **High** — [scripts/guardrails/verify_claims.py](/C:/Users/USER/Documents/autoworkshop-ai/scripts/guardrails/verify_claims.py:218): Missing `file:line` citation targets are skipped with `continue`, and in `--citations-only` mode the later path check never runs.
  **Fix:** fail immediately when `CITE_RE` matches a target path that does not exist.
  **Why:** `scripts/guardrails/README.md` says citations-only is safe for reviews; currently a review can cite a nonexistent file and still pass.

- [ ] **High** — [scripts/guardrails/verify_claims.py](/C:/Users/USER/Documents/autoworkshop-ai/scripts/guardrails/verify_claims.py:69), [scripts/guardrails/verify_claims.py](/C:/Users/USER/Documents/autoworkshop-ai/scripts/guardrails/verify_claims.py:292), [.claude/TASK_QUEUE.md](/C:/Users/USER/Documents/autoworkshop-ai/.claude/TASK_QUEUE.md:9): `complete` is normalized to `done`, so `**code complete ..., GATES PENDING**` is treated as done even though the same row says review and Playwright are not done.
  **Fix:** parse only explicit verdict tokens at the start of the bold status, or add a separate non-done status such as `gates pending`; do not map arbitrary “complete” prose to `done`.
  **Why:** this guardrail exists to prevent stale status claims. Treating “code complete, gates pending” as done can green-light follow-on work prematurely.

- [ ] **Medium** — [scripts/guardrails/verify_claims.py](/C:/Users/USER/Documents/autoworkshop-ai/scripts/guardrails/verify_claims.py:265): task rows with unparseable statuses are silently ignored for status comparison.
  **Fix:** record a WARN/FAIL for any `TASK_QUEUE.md` row whose status cell cannot be parsed, while still counting the task ID as known.
  **Why:** the current fix avoids false “missing task” failures, but it can also create false greens when the queue uses a typo or new status word.

- [ ] **Medium** — [scripts/guardrails/verify_claims.py](/C:/Users/USER/Documents/autoworkshop-ai/scripts/guardrails/verify_claims.py:172), [scripts/guardrails/verify_claims.py](/C:/Users/USER/Documents/autoworkshop-ai/scripts/guardrails/verify_claims.py:178): `resolve_path()` claims it accepts an “unambiguous suffix match,” but the code returns true on the first suffix match without checking ambiguity.
  **Fix:** collect suffix matches and return true only when there is exactly one; warn/fail on multiple matches.
  **Why:** documentation can appear grounded while pointing at an ambiguous path, weakening the review evidence trail.

- [ ] **Low** — [apps/admin-web/next.config.mjs](/C:/Users/USER/Documents/autoworkshop-ai/apps/admin-web/next.config.mjs:15) and the other non-`workshop-web` configs: comments still say “Only the deploy sets `SKIP_BUILD_CHECKS=1`,” while ADR-017 says the other six Next apps have no deployment story yet.
  **Fix:** either scope that comment to `workshop-web` or reword it as “a constrained/deploy build may set...”.
  **Why:** it leaves future operators with a false mental model after removing the worker workaround.

No critical defects found. I could not run `python scripts/guardrails/verify_claims.py` in this sandbox because script execution was rejected by policy, so this is a static review. The removal of `experimental: { cpus: 1, workerThreads: false }` itself matches ADR-017 and looks correct.
re is the
-   * pool failing to start rather than a page failing to load: a page that
-   * throws prints its own stack. Next swallows a worker that never comes up.
-   *
-   * `cpus: 1` plus `workerThreads: false` keeps page collection in one process.
-   * It is slower, which is irrelevant for a deploy and would be annoying
-   * locally — hence the flag.
-   */
-  experimental: constrainedBuild ? { cpus: 1, workerThreads: false } : {},
   reactStrictMode: true,
   // Shared workspace packages are compiled by this app rather than pre-built,
   // so a token change is picked up without a separate build step.
diff --git a/apps/fleet-web/next.config.mjs b/apps/fleet-web/next.config.mjs
index 9d12f4b..ac1fcc3 100644
--- a/apps/fleet-web/next.config.mjs
+++ b/apps/fleet-web/next.config.mjs
@@ -22,20 +22,6 @@ const constrainedBuild = process.env.SKIP_BUILD_CHECKS === '1';
 const nextConfig = {
   eslint: { ignoreDuringBuilds: constrainedBuild },
   typescript: { ignoreBuildErrors: constrainedBuild },
-  /**
-   * One worker, in-process, on the deploy builder.
-   *
-   * After the checks were skipped the build still died — instantly, in the same
-   * second, with no output, at "Collecting page data". That step forks a worker
-   * pool sized from the CPU count, and an immediate silent death there is the
-   * pool failing to start rather than a page failing to load: a page that
-   * throws prints its own stack. Next swallows a worker that never comes up.
-   *
-   * `cpus: 1` plus `workerThreads: false` keeps page collection in one process.
-   * It is slower, which is irrelevant for a deploy and would be annoying
-   * locally — hence the flag.
-   */
-  experimental: constrainedBuild ? { cpus: 1, workerThreads: false } : {},
   reactStrictMode: true,
   // Shared workspace packages are compiled by this app rather than pre-built,
   // so a token change is picked up without a separate build step.
diff --git a/apps/insurance-web/next.config.mjs b/apps/insurance-web/next.config.mjs
index 9d12f4b..ac1fcc3 100644
--- a/apps/insurance-web/next.config.mjs
+++ b/apps/insurance-web/next.config.mjs
@@ -22,20 +22,6 @@ const constrainedBuild = process.env.SKIP_BUILD_CHECKS === '1';
 const nextConfig = {
   eslint: { ignoreDuringBuilds: constrainedBuild },
   typescript: { ignoreBuildErrors: constrainedBuild },
-  /**
-   * One worker, in-process, on the deploy builder.
-   *
-   * After the checks were skipped the build still died — instantly, in the same
-   * second, with no output, at "Collecting page data". That step forks a worker
-   * pool sized from the CPU count, and an immediate silent death there is the
-   * pool failing to start rather than a page failing to load: a page that
-   * throws prints its own stack. Next swallows a worker that never comes up.
-   *
-   * `cpus: 1` plus `workerThreads: false` keeps page collection in one process.
-   * It is slower, which is irrelevant for a deploy and would be annoying
-   * locally — hence the flag.
-   */
-  experimental: constrainedBuild ? { cpus: 1, workerThreads: false } : {},
   reactStrictMode: true,
   // Shared workspace packages are compiled by this app rather than pre-built,
   // so a token change is picked up without a separate build step.
```
codex
I’ll review this as a code review against the repo’s written requirement, starting with README/log context and then the exact changed files. Since the workspace is read-only, I’ll only inspect and report defects.
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'git diff --stat HEAD~1..HEAD; git diff -- scripts/guardrails/verify_claims.py' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'Get-Content -Path README.md' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'if (Test-Path docs/IMPLEMENTATION_LOG.md) { Get-Content -Path docs/IMPLEMENTATION_LOG.md }' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg -n "SKIP_BUILD_CHECKS|experimental|cpus|workerThreads|verify_claims|claim|Next|Collecting page data|build" README.md docs scripts apps -S' in C:\Users\USER\Documents\autoworkshop-ai
 declined in 0ms:
`"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'if (Test-Path docs/IMPLEMENTATION_LOG.md) { Get-Content -Path docs/IMPLEMENTATION_LOG.md }'` rejected: blocked by policy
2026-07-27T23:06:55.593836Z ERROR codex_core::tools::router: error=`"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'if (Test-Path docs/IMPLEMENTATION_LOG.md) { Get-Content -Path docs/IMPLEMENTATION_LOG.md }'` rejected: blocked by policy
 succeeded in 1088ms:
 apps/admin-web/next.config.mjs      | 14 -------------
 apps/customer-web/next.config.mjs   | 14 -------------
 apps/fleet-web/next.config.mjs      | 14 -------------
 apps/insurance-web/next.config.mjs  | 14 -------------
 apps/supplier-web/next.config.mjs   | 14 -------------
 apps/towing-web/next.config.mjs     | 14 -------------
 apps/workshop-web/next.config.mjs   | 14 -------------
 scripts/guardrails/verify_claims.py | 40 +++++++++++++++++++++++++++++--------
 8 files changed, 32 insertions(+), 106 deletions(-)

 succeeded in 2772ms:
# AutoWorkshop AI

**The Complete AI-Powered Automotive Service, Repair and Workshop Operating System.**

Live target: [`autoworkshop.aiappinvent.com`](https://autoworkshop.aiappinvent.com) Â· Status: **Phase 1 â€” Release 0.1 (foundation)**

One platform connecting vehicle owners, workshops, technicians, auto electricians, electronics
specialists, body repairers, spray painters, welders, vulcanizers, upholsterers, suppliers, fleet
operators, insurers and towing providers.

The promise, end to end: **report the problem â†’ diagnose the fault â†’ simulate the solution â†’ approve the
work â†’ verify the parts â†’ track the repair** â€” every step authenticated, authorised, audited and recoverable.

---

## Zero-cost policy (hard)

Per `autoworkshop 05.txt` Â§1, Â§2, Â§6, Â§8 and ADR-012, this project uses **only zero-cost and open-source
tools â€” including in production**. No paid tool, subscription or mandatory paid service may be introduced.
A task is not complete if it added a paid dependency.

Where a capability normally costs money, it is built as a **disabled adapter behind an interface**:

- **Bring-your-own-connection (D7)** â€” each tenant connects their *own* OBD device, payment merchant
  account, SMTP server or model API key if they want one. The application works fully with none configured.
- **Upgrade-ready (D8)** â€” everything is self-hosted FOSS with full infrastructure-as-code, so moving to
  commercial infrastructure later (only if the product goes commercial) is a *hosting* change, not a rewrite.

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js (App Router) Â· React Â· TypeScript Â· Tailwind Â· shadcn/ui Â· Radix |
| Backend | NestJS Â· TypeScript â€” modular monolith, 13 bounded domains |
| Database | PostgreSQL + `pgvector` â€” row-level security (`FORCE`) on every tenant table |
| Cache / jobs | Redis + BullMQ Â· **NATS** for domain events |
| Identity | Keycloak â€” own realm, OAuth 2.1 + PKCE |
| Storage | MinIO (S3-compatible) |
| Realtime | WebRTC + self-hosted `coturn` |
| AI | **Google ADK** (Python) â†’ **MCP Gateway** â†’ 19 MCP servers â†’ NestJS domain services |
| LLM | Local Ollama (`llama3.2`, `llava`) via ADK `LiteLlm` |
| Design | **Penpot** Â· Storybook Â· Playwright (incl. visual regression) Â· axe-core Â· Vitest |
| Ops | Docker Â· Prometheus Â· Grafana Â· Loki |

**The AI never touches the database.** Agents hold no database, storage, payment or admin credentials;
they call the MCP Gateway, which calls authoritative NestJS domain services, which enforce every business
rule. Enforced in infrastructure and asserted by negative tests in CI â€” not by policy text.

---

## Repository layout

```
apps/        customer-web workshop-web supplier-web fleet-web insurance-web towing-web admin-web
             mobile (React Native/Expo, Android first) Â· api (NestJS) Â· mcp-gateway Â· mcp-servers
             agent-host (Python + ADK) Â· media-worker Â· storybook
packages/    design-tokens ui navigation forms tables charts workflow media offline-sync i18n
             ai-assistant mcp-ui accessibility auth api-client domain-contracts validation events â€¦
python-packages/  adk-core adk-agents mcp-client agent-evals
domains/     13 bounded contexts â€” pure business logic
infrastructure/   docker compose keycloak migrations policies
tests/       playwright visual a11y tenant-isolation offline mcp
docs/        00-project â€¦ 14-user-guides
```

## Branches & commits

`master` (production-ready) Â· `develop` (integration) Â· short-lived `feature/*` branches.
Conventional commits: `feat(scope):` Â· `fix(scope):` Â· `chore(scope):` Â· `docs(scope):`.

## Documentation

`ARCHITECTURE.md` Â· `SECURITY.md` Â· `ROADMAP.md` Â· `CLAUDE.md` Â· `docs/`
Approved plan: `Documents\autoworkshop app\_plan\COMBINED_PLAN_v2.md`
(passed Codex `PASS WITH CORRECTIONS` â†’ Supervisor `PASS WITH CONDITIONS`, all applied).

**Reference implementation: [`solar-pv-designer-lite`](https://github.com/marc667us/solar-pv-designer-lite)** â€”
patterns, CI shape and operational lessons are taken from it. The two applications are deliberately
**not** entangled: separate repo, database, Keycloak realm, deployment, secrets and CI. If Solar were
deleted tomorrow, this must still build, deploy and run.

 succeeded in 7170ms:
README.md:35:| Frontend | Next.js (App Router) · React · TypeScript · Tailwind · shadcn/ui · Radix |
README.md:82:deleted tomorrow, this must still build, deploy and run.
scripts\_codex-runner.sh:125:  # Python both builds the JSON body (safe escaping) and parses the response.
scripts\supervise-codex.sh:48:echo "Next steps:"
scripts\seed-dev-identity.sh:6:# T-0005 wires a real Keycloak session into the seven Next apps, and until this
scripts\seed-dev-identity.sh:24:# a realm rebuild, a database reset, or either one alone.
scripts\seed-dev-identity.sh:103:# database reset with its credentials intact, or a realm rebuild that left the
scripts\quality-gate.sh:8:# It is cheap and it fails fast, so a broken claim or a banned idiom is caught
scripts\quality-gate.sh:15:PYTHONIOENCODING=utf-8 python scripts/guardrails/verify_claims.py || GUARDRAIL_RC=1
scripts\guardrails\verify_claims.py:12:Worse, the fix itself introduced new false claims: a reference to two review
scripts\guardrails\verify_claims.py:34:    python verify_claims.py                 # check the default document set
scripts\guardrails\verify_claims.py:35:    python verify_claims.py --strict        # warnings become failures
scripts\guardrails\verify_claims.py:36:    python verify_claims.py PATH...         # check specific files
scripts\guardrails\verify_claims.py:47:# Documents whose factual claims are load-bearing for the next session.
scripts\guardrails\verify_claims.py:84:# How close a status word must be to a task id to count as a claim about it.
scripts\guardrails\verify_claims.py:187:    skip = {".git", "node_modules", ".next", "dist", "build", ".guardrails", "__pycache__"}
scripts\guardrails\verify_claims.py:238:            # ("a package.json"), not a claim about a specific file here.
scripts\guardrails\verify_claims.py:264:            # compare a claim against -- so say nothing rather than guess.
scripts\guardrails\verify_claims.py:271:            # Only a status word in the SAME CLAUSE is a claim about this id.
scripts\guardrails\verify_claims.py:285:            claimed = [w for w in STATUS_WORDS if w in low]
scripts\guardrails\verify_claims.py:287:                claimed = [w for w in claimed if w != "blocked"]
scripts\guardrails\verify_claims.py:288:            if not claimed:
scripts\guardrails\verify_claims.py:291:            # "complete" and "done" are the same claim.
scripts\guardrails\verify_claims.py:293:            claimed_n = {norm.get(c, c) for c in claimed}
scripts\guardrails\verify_claims.py:295:            if truth_n not in claimed_n:
scripts\guardrails\verify_claims.py:297:                      f"{tid} is described as {sorted(claimed_n)} but TASK_QUEUE.md says '{truth}'")
scripts\guardrails\verify_claims.py:301:    ap = argparse.ArgumentParser(description="Verify factual claims in project documentation.")
scripts\guardrails\verify_claims.py:326:    print(f"=== claim verification -- {checked} document(s), "
scripts\guardrails\verify_claims.py:329:        print("  OK        every checked claim resolves")
scripts\guardrails\scoped-review.sh:79:# --- 2. build the grounded context pack ------------------------------------
scripts\guardrails\scoped-review.sh:80:# Rebuild EVERY run. Reusing an existing index would let a review be grounded in
scripts\guardrails\scoped-review.sh:82:# ground truth, which is a worse failure than no evidence at all. The build is
scripts\guardrails\scoped-review.sh:84:echo "  building retrieval index..."
scripts\guardrails\scoped-review.sh:85:if ! PYTHONIOENCODING=utf-8 python scripts/guardrails/rag.py build > "$WORK/index-build.log" 2>&1; then
scripts\guardrails\scoped-review.sh:86:  echo "  ! index build FAILED - see $WORK/index-build.log" >&2
scripts\guardrails\scoped-review.sh:133:  echo "GROUNDING RULE: cite file:line for every claim. If the evidence for a claim is not in"
scripts\guardrails\README.md:16:| 2. Claim verification | `verify_claims.py` | Documentation that asserts things that are not true |
scripts\guardrails\README.md:36:python scripts/guardrails/rag.py build --extra-root "C:/Users/USER/Documents/autoworkshop app"
scripts\guardrails\README.md:41:Every retrieved span carries `file:line` provenance, so any claim built on it can
scripts\guardrails\README.md:50:## Layer 2 — `verify_claims.py`: documentation has no compiler
scripts\guardrails\README.md:53:build behind it, so unverified assertions accumulate in it silently.
scripts\guardrails\README.md:64:python scripts/guardrails/verify_claims.py            # control files
scripts\guardrails\README.md:65:python scripts/guardrails/verify_claims.py --strict   # warnings become failures
scripts\guardrails\README.md:66:python scripts/guardrails/verify_claims.py --citations-only reviews/*.md
scripts\guardrails\README.md:84:- A status word only counts as a claim if it is in the **same clause** as the
scripts\guardrails\README.md:98:1. **Ground it** — build a retrieval pack so the reviewer reads real spans with
scripts\guardrails\README.md:137:The run now aborts rather than proceeding ungrounded if the index build fails,
scripts\guardrails\README.md:171:python scripts/guardrails/verify_claims.py
scripts\guardrails\README.md:181:looks and *whether* a claim is checkable, which is a narrower job than reviewing
scripts\guardrails\rag.py:17:and every claim can be checked back against a retrievable span.
scripts\guardrails\rag.py:35:    python rag.py build [--extra-root DIR]...     # build the index
scripts\guardrails\rag.py:55:# a guardrail: build artifacts and vendored code are not evidence about this
scripts\guardrails\rag.py:68:    ".git", "node_modules", ".next", "dist", "build", "coverage", ".turbo",
scripts\guardrails\rag.py:161:def build(roots: list[Path], out_path: Path) -> dict:
scripts\guardrails\rag.py:214:        sys.exit(f"no index at {index_path} -- run: python {Path(__file__).name} build")
scripts\guardrails\rag.py:264:def cmd_build(args):
scripts\guardrails\rag.py:266:    idx = build(roots, Path(args.out))
scripts\guardrails\rag.py:289:    is labelled with file:line so a claim can be traced, and the header states
scripts\guardrails\rag.py:297:    print("#   1. Cite file:line for every claim you make.")
scripts\guardrails\rag.py:298:    print("#   2. If the evidence for a claim is not in this pack, say NOT IN CONTEXT.")
scripts\guardrails\rag.py:339:    b = sub.add_parser("build");  b.add_argument("--extra-root", action="append")
scripts\guardrails\rag.py:340:    b.set_defaults(func=cmd_build)
docs\05-database\BACKUP_AND_RESTORE.md:93:This was a **false claim before it was a feature**: the code reused `S3_ACCESS_KEY`/`S3_SECRET_KEY` —
docs\05-database\BACKUP_AND_RESTORE.md:135:| Pre-backup rows recovered | The backup contains what it claimed |
docs\05-database\BACKUP_AND_RESTORE.md:193:   cluster without a dump/restore rebuild. **The production cluster must be initialised fresh with
docs\05-database\BACKUP_AND_RESTORE.md:199:   be enabled at bucket creation, so this needs a bucket rebuild.
apps\workshop-web\package.json:7:    "build": "next build",
apps\workshop-web\next.config.mjs:2: * `next build` re-runs ESLint and the TypeScript checker.
apps\workshop-web\next.config.mjs:4: * On a constrained deploy builder that step is the one that dies — and it dies
apps\workshop-web\next.config.mjs:5: * SILENTLY: the Render build log ends at "Linting and checking validity of
apps\workshop-web\next.config.mjs:15: * OPT-IN, NEVER THE DEFAULT. Only the deploy sets SKIP_BUILD_CHECKS=1. A local
apps\workshop-web\next.config.mjs:16: * or CI `pnpm build` still lints and type-checks in full, so a broken build
apps\workshop-web\next.config.mjs:19:const constrainedBuild = process.env.SKIP_BUILD_CHECKS === '1';
apps\workshop-web\next.config.mjs:21:/** @type {import('next').NextConfig} */
apps\workshop-web\next.config.mjs:30:   * host that runs it, because Render's builder fails this build for reasons
apps\workshop-web\next.config.mjs:33:   * enough to be worth doing: no pnpm store, no workspace, no build toolchain.
apps\workshop-web\next.config.mjs:35:   * Safe locally — `next start` prefers a normal build when one is present, and
apps\workshop-web\next.config.mjs:47:  // so a token change is picked up without a separate build step.
apps\workshop-web\middleware.ts:19: * The matcher is written out rather than imported because Next requires
apps\workshop-web\Dockerfile:5:# Render's own builder fails `next build` for this repo with exit 1 and
apps\workshop-web\Dockerfile:12:# Rather than keep guessing at someone else's build host, the build moves to a
apps\workshop-web\Dockerfile:21:# ─── build ────────────────────────────────────────────────────────────────────
apps\workshop-web\Dockerfile:22:FROM node:20.19.2-bookworm-slim AS builder
apps\workshop-web\Dockerfile:24:# libvips is what `sharp` links against; without it sharp falls back to building
apps\workshop-web\Dockerfile:49:# so an absent value fails the build. This placeholder is compile-time only and
apps\workshop-web\Dockerfile:51:ENV SKIP_BUILD_CHECKS=1 \
apps\workshop-web\Dockerfile:54:    AUTH_SECRET=build-time-placeholder-replaced-at-runtime \
apps\workshop-web\Dockerfile:56:RUN pnpm --filter @autoworkshop/workshop-web build
apps\workshop-web\Dockerfile:75:COPY --from=builder --chown=node:node /repo/apps/workshop-web/.next/standalone ./
apps\workshop-web\Dockerfile:78:COPY --from=builder --chown=node:node /repo/apps/workshop-web/.next/static ./apps/workshop-web/.next/static
apps\admin-web\package.json:7:    "build": "next build",
apps\admin-web\next.config.mjs:2: * `next build` re-runs ESLint and the TypeScript checker.
apps\admin-web\next.config.mjs:4: * On a constrained deploy builder that step is the one that dies — and it dies
apps\admin-web\next.config.mjs:5: * SILENTLY: the Render build log ends at "Linting and checking validity of
apps\admin-web\next.config.mjs:15: * OPT-IN, NEVER THE DEFAULT. Only the deploy sets SKIP_BUILD_CHECKS=1. A local
apps\admin-web\next.config.mjs:16: * or CI `pnpm build` still lints and type-checks in full, so a broken build
apps\admin-web\next.config.mjs:19:const constrainedBuild = process.env.SKIP_BUILD_CHECKS === '1';
apps\admin-web\next.config.mjs:21:/** @type {import('next').NextConfig} */
apps\admin-web\next.config.mjs:27:  // so a token change is picked up without a separate build step.
apps\admin-web\middleware.ts:19: * The matcher is written out rather than imported because Next requires
docs\04-security\TENANT_ISOLATION.md:11:| 1 | Request context | NestJS request-scoped tenant context from **validated Keycloak claims + membership records only** |
apps\workshop-web\app\[...slug]\page.tsx:7: * own `app/<group>/<item>/page.tsx`, which Next resolves ahead of this.
apps\workshop-web\app\home\dashboard\page.tsx:17: * the viewer was a hardcoded demo: module scope is evaluated ONCE, when Next
apps\workshop-web\app\home\dashboard\page.tsx:122:        aria-label="About this build"
apps\workshop-web\app\home\dashboard\page.tsx:131:          What is real in this build
apps\insurance-web\package.json:7:    "build": "next build",
apps\insurance-web\next.config.mjs:2: * `next build` re-runs ESLint and the TypeScript checker.
apps\insurance-web\next.config.mjs:4: * On a constrained deploy builder that step is the one that dies — and it dies
apps\insurance-web\next.config.mjs:5: * SILENTLY: the Render build log ends at "Linting and checking validity of
apps\insurance-web\next.config.mjs:15: * OPT-IN, NEVER THE DEFAULT. Only the deploy sets SKIP_BUILD_CHECKS=1. A local
apps\insurance-web\next.config.mjs:16: * or CI `pnpm build` still lints and type-checks in full, so a broken build
apps\insurance-web\next.config.mjs:19:const constrainedBuild = process.env.SKIP_BUILD_CHECKS === '1';
apps\insurance-web\next.config.mjs:21:/** @type {import('next').NextConfig} */
apps\insurance-web\next.config.mjs:27:  // so a token change is picked up without a separate build step.
apps\insurance-web\middleware.ts:19: * The matcher is written out rather than imported because Next requires
apps\towing-web\package.json:7:    "build": "next build",
apps\towing-web\next.config.mjs:2: * `next build` re-runs ESLint and the TypeScript checker.
apps\towing-web\next.config.mjs:4: * On a constrained deploy builder that step is the one that dies — and it dies
apps\towing-web\next.config.mjs:5: * SILENTLY: the Render build log ends at "Linting and checking validity of
apps\towing-web\next.config.mjs:15: * OPT-IN, NEVER THE DEFAULT. Only the deploy sets SKIP_BUILD_CHECKS=1. A local
apps\towing-web\next.config.mjs:16: * or CI `pnpm build` still lints and type-checks in full, so a broken build
apps\towing-web\next.config.mjs:19:const constrainedBuild = process.env.SKIP_BUILD_CHECKS === '1';
apps\towing-web\next.config.mjs:21:/** @type {import('next').NextConfig} */
apps\towing-web\next.config.mjs:27:  // so a token change is picked up without a separate build step.
apps\towing-web\middleware.ts:19: * The matcher is written out rather than imported because Next requires
apps\admin-web\app\[...slug]\page.tsx:7: * own `app/<group>/<item>/page.tsx`, which Next resolves ahead of this.
apps\insurance-web\app\[...slug]\page.tsx:7: * own `app/<group>/<item>/page.tsx`, which Next resolves ahead of this.
apps\insurance-web\app\layout.tsx:13:  description: 'Insurers — claims, assessment, repair authorization',
apps\towing-web\app\[...slug]\page.tsx:7: * own `app/<group>/<item>/page.tsx`, which Next resolves ahead of this.
apps\fleet-web\package.json:7:    "build": "next build",
apps\fleet-web\next.config.mjs:2: * `next build` re-runs ESLint and the TypeScript checker.
apps\fleet-web\next.config.mjs:4: * On a constrained deploy builder that step is the one that dies — and it dies
apps\fleet-web\next.config.mjs:5: * SILENTLY: the Render build log ends at "Linting and checking validity of
apps\fleet-web\next.config.mjs:15: * OPT-IN, NEVER THE DEFAULT. Only the deploy sets SKIP_BUILD_CHECKS=1. A local
apps\fleet-web\next.config.mjs:16: * or CI `pnpm build` still lints and type-checks in full, so a broken build
apps\fleet-web\next.config.mjs:19:const constrainedBuild = process.env.SKIP_BUILD_CHECKS === '1';
apps\fleet-web\next.config.mjs:21:/** @type {import('next').NextConfig} */
apps\fleet-web\next.config.mjs:27:  // so a token change is picked up without a separate build step.
apps\fleet-web\middleware.ts:19: * The matcher is written out rather than imported because Next requires
docs\02-architecture\adr\ADR-017-PREBUILT-IMAGES-FOR-PRODUCTION-DEPLOYS.md:1:# ADR-017 — Production deploys run a prebuilt image, not a host build
docs\02-architecture\adr\ADR-017-PREBUILT-IMAGES-FOR-PRODUCTION-DEPLOYS.md:10:domain was already `verified`. The blocker was that **Render's builder cannot
docs\02-architecture\adr\ADR-017-PREBUILT-IMAGES-FOR-PRODUCTION-DEPLOYS.md:11:build this repository**.
docs\02-architecture\adr\ADR-017-PREBUILT-IMAGES-FOR-PRODUCTION-DEPLOYS.md:13:The failure signature is hostile to diagnosis: `next build` exits **1**
docs\02-architecture\adr\ADR-017-PREBUILT-IMAGES-FOR-PRODUCTION-DEPLOYS.md:23:| Out of memory | builder reports 48 CPUs / 95 GB RAM, 8 GB cgroup; exit code **1**, not 137 |
docs\02-architecture\adr\ADR-017-PREBUILT-IMAGES-FOR-PRODUCTION-DEPLOYS.md:24:| Build worker pool | `experimental.cpus: 1` + `workerThreads: false` changed nothing |
docs\02-architecture\adr\ADR-017-PREBUILT-IMAGES-FOR-PRODUCTION-DEPLOYS.md:26:| `sharp` native build | `require('sharp')` tested directly on the builder |
docs\02-architecture\adr\ADR-017-PREBUILT-IMAGES-FOR-PRODUCTION-DEPLOYS.md:27:| The code itself | a clean checkout builds in ~25 s on `ubuntu-latest` |
docs\02-architecture\adr\ADR-017-PREBUILT-IMAGES-FOR-PRODUCTION-DEPLOYS.md:28:| **V8 heap limit (448 MB)** | **reproduced deliberately at 496 MB in CI — the build still passed** |
docs\02-architecture\adr\ADR-017-PREBUILT-IMAGES-FOR-PRODUCTION-DEPLOYS.md:34:At that point the useful question stopped being "why does Render's builder fail"
docs\02-architecture\adr\ADR-017-PREBUILT-IMAGES-FOR-PRODUCTION-DEPLOYS.md:35:and became "why is Render's builder in the critical path at all".
docs\02-architecture\adr\ADR-017-PREBUILT-IMAGES-FOR-PRODUCTION-DEPLOYS.md:39:**CI builds a container image, proves it serves, publishes it to GHCR, and
docs\02-architecture\adr\ADR-017-PREBUILT-IMAGES-FOR-PRODUCTION-DEPLOYS.md:53:10-target build and were still broken the moment the app was started:
docs\02-architecture\adr\ADR-017-PREBUILT-IMAGES-FOR-PRODUCTION-DEPLOYS.md:68:**Good.** An unexplained third-party build host is permanently out of the
docs\02-architecture\adr\ADR-017-PREBUILT-IMAGES-FOR-PRODUCTION-DEPLOYS.md:71:Deploys become an image pull, which is faster and cannot fail for build reasons.
docs\02-architecture\adr\ADR-017-PREBUILT-IMAGES-FOR-PRODUCTION-DEPLOYS.md:78:- **`NEXT_PUBLIC_*` variables are baked in at build time.** Setting them on the
docs\02-architecture\adr\ADR-017-PREBUILT-IMAGES-FOR-PRODUCTION-DEPLOYS.md:80:  requires a rebuild, not a restart.
docs\02-architecture\adr\ADR-017-PREBUILT-IMAGES-FOR-PRODUCTION-DEPLOYS.md:81:- **The root cause of the Render build failure is still unknown.** This decision
docs\02-architecture\adr\ADR-017-PREBUILT-IMAGES-FOR-PRODUCTION-DEPLOYS.md:83:  because the build now happens somewhere its output can be read.
docs\02-architecture\adr\ADR-017-PREBUILT-IMAGES-FOR-PRODUCTION-DEPLOYS.md:84:- The other six Next apps still have no deployment story. Only `workshop-web` is
docs\02-architecture\adr\ADR-016-ZERO-COST-NOW.md:7:The owner directed that after build and test, if the product goes commercial, it will move to commercial infrastructure. Codex's engineering concern about free-tier dependability is deferred, not dismissed.
docs\02-architecture\adr\ADR-016-ZERO-COST-NOW.md:15:The zero-cost build is the production system, not a throwaway prototype. Scaling it is a hosting decision, not a software decision. Nothing built now has to be unbuilt later.
apps\supplier-web\package.json:7:    "build": "next build",
apps\supplier-web\next.config.mjs:2: * `next build` re-runs ESLint and the TypeScript checker.
apps\supplier-web\next.config.mjs:4: * On a constrained deploy builder that step is the one that dies — and it dies
apps\supplier-web\next.config.mjs:5: * SILENTLY: the Render build log ends at "Linting and checking validity of
apps\supplier-web\next.config.mjs:15: * OPT-IN, NEVER THE DEFAULT. Only the deploy sets SKIP_BUILD_CHECKS=1. A local
apps\supplier-web\next.config.mjs:16: * or CI `pnpm build` still lints and type-checks in full, so a broken build
apps\supplier-web\next.config.mjs:19:const constrainedBuild = process.env.SKIP_BUILD_CHECKS === '1';
apps\supplier-web\next.config.mjs:21:/** @type {import('next').NextConfig} */
apps\supplier-web\next.config.mjs:27:  // so a token change is picked up without a separate build step.
apps\supplier-web\middleware.ts:19: * The matcher is written out rather than imported because Next requires
apps\fleet-web\app\[...slug]\page.tsx:7: * own `app/<group>/<item>/page.tsx`, which Next resolves ahead of this.
docs\02-architecture\adr\ADR-011-MULTI-TENANCY-AND-THE-SOLAR-BOUNDARY.md:15:Acceptance test: if Solar were deleted tomorrow, AutoWorkshop must still build, deploy and run. CI fails the build if any code references the Solar repository.
docs\02-architecture\adr\ADR-002-NEXT.JS-APP-ROUTER-FOR-ALL-SEVEN-WEB-APPLICATIONS.md:1:# ADR-002 — Next.js App Router for all seven web applications
docs\02-architecture\adr\ADR-002-NEXT.JS-APP-ROUTER-FOR-ALL-SEVEN-WEB-APPLICATIONS.md:7:`autoworkshop 1.txt` §5 specifies the Next.js App Router. `01 (1).txt` §86 lists seven distinct apps. Codex argued for a single app with role-based workspaces; the spec is explicit and won.
docs\02-architecture\adr\ADR-002-NEXT.JS-APP-ROUTER-FOR-ALL-SEVEN-WEB-APPLICATIONS.md:11:Seven separate Next.js apps. The shared shell, navigation and design system live in `packages/` and are consumed by all seven.
apps\supplier-web\app\[...slug]\page.tsx:7: * own `app/<group>/<item>/page.tsx`, which Next resolves ahead of this.
docs\01-product\BUSINESS_RULES.md:41:20. Tenant context is derived from validated claims and membership — never from client input.
apps\e2e\package.json:6:    "build": "echo 'e2e has no build artefact'",
apps\customer-web\package.json:7:    "build": "next build",
apps\customer-web\next.config.mjs:2: * `next build` re-runs ESLint and the TypeScript checker.
apps\customer-web\next.config.mjs:4: * On a constrained deploy builder that step is the one that dies — and it dies
apps\customer-web\next.config.mjs:5: * SILENTLY: the Render build log ends at "Linting and checking validity of
apps\customer-web\next.config.mjs:15: * OPT-IN, NEVER THE DEFAULT. Only the deploy sets SKIP_BUILD_CHECKS=1. A local
apps\customer-web\next.config.mjs:16: * or CI `pnpm build` still lints and type-checks in full, so a broken build
apps\customer-web\next.config.mjs:19:const constrainedBuild = process.env.SKIP_BUILD_CHECKS === '1';
apps\customer-web\next.config.mjs:21:/** @type {import('next').NextConfig} */
apps\customer-web\next.config.mjs:27:  // so a token change is picked up without a separate build step.
apps\customer-web\middleware.ts:19: * The matcher is written out rather than imported because Next requires
apps\e2e\tsconfig.json:5:    "module": "ESNext",
apps\storybook\stories\TopNav.stories.tsx:11: *    the docstring claimed "none of them silently no-op". An action without
apps\storybook\stories\Tabs.stories.tsx:56:      { id: 'insurance', label: 'Insurance', content: <p>Policy and claims.</p> },
docs\00-project\PLAN_EXTENSION_v1.md:25:the "build everything structurally, stage only content" principle carry over unchanged and are re-asserted,
docs\00-project\PLAN_EXTENSION_v1.md:46:| **D2 stack** (Next + NestJS + Postgres + Redis + Keycloak) | Unchanged. 3D uses Three.js, already named in v2 §2. |
docs\00-project\PLAN_EXTENSION_v1.md:51:| **v2 §2 staging rule** — build features, stage content | The governing rule for this whole extension. 08's OEM geometry and 09's manufacturer manuals are **content**, and stage exactly as v2 already ruled for the 3D viewer and knowledge library. |
docs\00-project\PLAN_EXTENSION_v1.md:65:scaffolding change, which is why it is settled here rather than at build time.
docs\00-project\PLAN_EXTENSION_v1.md:86:  - **Authority derives from membership and role, never from the account type claim itself.** The account
docs\00-project\PLAN_EXTENSION_v1.md:88:    decision. This keeps the rule that tenant context comes only from validated claims and membership.
docs\00-project\PLAN_EXTENSION_v1.md:148:buildable rather than aspirational.
docs\00-project\PLAN_EXTENSION_v1.md:162:| §40–§44 | Invoice preparation, send invoice, receive payment, **partial payment and balance**, workshop warranty, return/warranty claim | Phase 7 |
docs\00-project\PLAN_EXTENSION_v1.md:235:building it against fixtures. **This is dependency order, not a cut** — v2 §2's "sequencing is not scope"
docs\00-project\PLAN_EXTENSION_v1.md:376:| 7 Finance + Partners | 0.6 | **+** transport-manager and fleet workspaces, approval limits, cost centres, emergency towing + tracking + **location privacy criteria**, invoicing, partial payment, workshop warranty and return claims |
docs\00-project\PLAN_EXTENSION_v1.md:403:2. **Phase 12/13/14 sequencing after 1.0.** They can be pulled earlier at the cost of building against
docs\00-project\PLAN_EXTENSION_v1.md:406:3. **Capacity claim inherited from v2** *(Codex finding 5)*. v2 §9 calls a single always-free ARM VM running
docs\00-project\PLAN_EXTENSION_v1.md:409:   claim to make or unmake, but it **must become a measured benchmark gate in Phase 11** with stated minimum
docs\00-project\COMBINED_PLAN_v2.md:32:Next.js (App Router) · React · TypeScript · Tailwind · shadcn/ui · Radix — frontend.
docs\00-project\COMBINED_PLAN_v2.md:65:**Acceptance test:** *if Solar were deleted tomorrow, would AutoWorkshop still build, deploy and run?*
docs\00-project\COMBINED_PLAN_v2.md:101:## 2. Scope: build everything — stage content, not features
docs\00-project\COMBINED_PLAN_v2.md:156:│   ├── insurance-web/ towing-web/ admin-web/     Next.js — 7 apps per `01 (1).txt` §86
docs\00-project\COMBINED_PLAN_v2.md:202:request resolves exactly one active tenant context, derived solely from validated Keycloak claims and
docs\00-project\COMBINED_PLAN_v2.md:210:claims. Application filters remain; Postgres is the final backstop. Isolation is enforced at six layers:
docs\00-project\COMBINED_PLAN_v2.md:259:tool call fails the build.
docs\00-project\COMBINED_PLAN_v2.md:296:| 1 Foundation | **0.1** | Monorepo, 7 Next.js apps scaffolded, NestJS, Postgres, Redis, Docker compose, Git flow, lint/format/TS, CI skeleton, design tokens, Storybook, ~25 seed docs, `.claude/` control files, **env bootstrap (§11)** |
docs\00-project\COMBINED_PLAN_v2.md:302:| 7 Finance + Partners | **0.6** | Invoices, payments, receipts, balances, warranty records + claims, fleet vehicles/requests/approvals, insurance claims + repair authorisation, towing requests + dispatch |
docs\00-project\COMBINED_PLAN_v2.md:306:| 11 Hardening + Release | **1.0** | Full test suite, security + accessibility + responsive review, backup/restore drill, DR exercise, production build, deploy, pilot onboarding |
docs\00-project\COMBINED_PLAN_v2.md:325:build + SBOM (syft) → **E2E** (Playwright journeys + role-access + **tenant-isolation** + **offline**) →
docs\00-project\COMBINED_PLAN_v2.md:377:**Owner direction 2026-07-25: "after build and test, if we are going commercial we will upgrade to more
docs\00-project\COMBINED_PLAN_v2.md:403:**Practical consequence:** the zero-cost build is not throwaway and not a prototype to be rewritten. It is the
docs\00-project\COMBINED_PLAN_v2.md:429:This is also achievable, because every tool the spec approves is FOSS and self-hostable — Next.js, NestJS,
docs\00-project\COMBINED_PLAN_v2.md:465:**Consequence for §2 — corrected after Supervisor audit.** My earlier claim that coturn made WebRTC
docs\00-project\COMBINED_PLAN_v2.md:466:"fully buildable with no staged tail" was **overclaiming, and is withdrawn**. Self-hosting coturn removes the
docs\00-project\COMBINED_PLAN_v2.md:479:| Always-free ARM compute | small ARM instance; **capacity shortages and idle reclaim are documented provider behaviour** | keep-alive checks; full IaC rebuild; off-VM backups |
docs\00-project\COMBINED_PLAN_v2.md:491:1. Always-free tiers require card verification (not charged) and can reclaim idle instances → keep-alive
docs\00-project\COMBINED_PLAN_v2.md:493:2. Single VM = single point of failure. Mitigated by: infrastructure-as-code so the whole stack rebuilds from
docs\00-project\COMBINED_PLAN_v2.md:527:| 12 | Always-free VM reclaimed / single point of failure | Full IaC (`docker compose up` rebuilds everything) + off-VM nightly backups + keep-alive health checks + **monthly tested** restore runbook |
docs\00-project\COMBINED_PLAN_v2.md:566:0. ~~Scope deferrals~~ — **CLOSED**: build everything; stage only licensed content + TURN bandwidth + OBD hardware.
docs\00-project\COMBINED_PLAN_v2.md:592:above (D6 capacity envelope; WebRTC overclaim withdrawn). Conditions 3–8 follow.
docs\00-project\COMBINED_PLAN_v2.md:699:6. Supervisor — I overclaimed "WebRTC fully buildable, no staged tail"; withdrawn (C2)
docs\00-project\COMBINED_PLAN_v2.md:713:## 16. Ready to build
docs\00-project\COMBINED_PLAN_v2.md:718:always-free host account is a prerequisite for *deployment*, not for building. It becomes blocking at the
docs\00-project\COMBINED_PLAN_v2.md:728:5. 7 Next.js apps scaffolded; NestJS `api`; Postgres + Redis + MinIO + NATS via `docker compose`
apps\storybook\stories\PageHeader.stories.tsx:42:    title: 'Warranty claims awaiting manufacturer response and internal review',
apps\storybook\stories\Dialog.stories.tsx:61:    title: 'Submitting warranty claim',
apps\storybook\stories\Dialog.stories.tsx:63:    confirmLabel: 'Submit claim',
apps\storybook\stories\Dialog.stories.tsx:74:    title: 'Submit warranty claim',
apps\storybook\stories\Dialog.stories.tsx:77:    error: 'The manufacturer portal rejected the claim: policy number not recognised.',
apps\storybook\stories\Breadcrumbs.stories.tsx:9: * Storybook, tests and all seven Next apps without a shim.
apps\storybook\stories\AppShell.stories.tsx:13: * Next apps.
apps\storybook\package.json:7:    "build": "storybook build -o storybook-static",
apps\storybook\package.json:10:    "test": "echo 'stories are exercised by build + visual regression'"
apps\e2e\tests\a11y-storybook.spec.ts:11: * engine into a gate: every story, every run, failing the build.
apps\e2e\tests\a11y-storybook.spec.ts:30:      `Storybook build not found at ${indexPath}.\n` +
apps\e2e\tests\a11y-storybook.spec.ts:31:        `Run: pnpm --filter @autoworkshop/storybook build`,
apps\customer-web\app\[...slug]\page.tsx:7: * own `app/<group>/<item>/page.tsx`, which Next resolves ahead of this.
apps\e2e\tests\a11y-workspaces.spec.ts:10: * order across composed regions, a nav and a main that both claim the same
apps\api\package.json:6:    "build": "nest build",
apps\e2e\playwright.config.ts:13: * build while broken. They were found by reading the code adversarially and by
apps\e2e\playwright.config.ts:20: *   shell-journey   — real browser against the built Next apps
apps\e2e\playwright.config.ts:62:     * serving a build that no longer exists on disk.
apps\e2e\playwright.config.ts:70:     * A running Next server resolves its chunk manifest once at boot, so it
apps\e2e\playwright.config.ts:71:     * kept emitting HTML referencing chunk hashes the rebuild had deleted.
apps\e2e\playwright.config.ts:83:     * ("stop the servers before rebuilding") was already written down in
apps\e2e\playwright.config.ts:87:      name: 'build-guard',
apps\e2e\playwright.config.ts:88:      testMatch: /build-freshness\.setup\.ts/,
apps\e2e\playwright.config.ts:95:      dependencies: ['build-guard'],
apps\e2e\playwright.config.ts:101:      dependencies: ['build-guard'],
apps\e2e\playwright.config.ts:105:  // Serving the static Storybook build and the seven built Next apps. Playwright
apps\e2e\playwright.config.ts:119:      // it to serve apps built with 15.1.3. Next 14 cannot read a Next 15 build:
apps\e2e\playwright.config.ts:120:      // it dies on a missing `font-manifest.json`, a file Next 15 no longer
apps\e2e\playwright.config.ts:125:      // by the same Next it was built with.
apps\e2e\tests\shell-journey.spec.ts:16: * build. None of them were caught by a gate; all were found by reading the code
apps\e2e\tests\shell-journey.spec.ts:107: * not with the app. On a loaded box — seven Next servers plus a nine-target
apps\e2e\tests\shell-journey.spec.ts:108: * build, which is exactly the state this repo was in on 2026-07-26 — 400ms is
apps\e2e\tests\shell-journey.spec.ts:152:      // which Next serialises into the RSC flight payload inside <script> tags
apps\e2e\tests\shell-journey.spec.ts:243:   * with count badges and no handler, while the TopNav docstring claimed "none
apps\e2e\tests\shell-journey.spec.ts:276:    // text until T-0016 builds their switchers. A button that does nothing is
apps\api\src\tenancy\tenant-context.ts:8: *    membership claims."
apps\api\src\tenancy\tenant-context.ts:34: * signature and claims have been verified.
apps\api\src\tenancy\tenant-context.ts:121: *    from validated membership rows rather than user input, building SQL by
apps\e2e\tests\build-freshness.setup.ts:17: * from an earlier build; the apps were then rebuilt underneath them, and
apps\e2e\tests\build-freshness.setup.ts:20: * emitting HTML that referenced chunk hashes the rebuild had already deleted.
apps\e2e\tests\build-freshness.setup.ts:33: * "Stop the servers before rebuilding" was already documented in
apps\e2e\tests\build-freshness.setup.ts:41: * disk is proof the server's in-memory build and the build on disk have
apps\e2e\tests\build-freshness.setup.ts:52: * The URL must be percent-DECODED first. Next's catch-all route ships as
apps\e2e\tests\build-freshness.setup.ts:55: * filesystem reports that file as missing on a perfectly fresh build — a guard
apps\e2e\tests\build-freshness.setup.ts:65:  test(`${server.name}-web serves a build that exists on disk`, async ({ page }) => {
apps\e2e\tests\build-freshness.setup.ts:75:    // Every static asset the document references, in BOTH forms Next emits:
apps\e2e\tests\build-freshness.setup.ts:106:        `\n\nThe server on port ${server.port} booted from an earlier build and the app was ` +
apps\e2e\tests\build-freshness.setup.ts:111:        `or restart it yourself after the build.`,
apps\api\src\main.ts:9:  // derived from validated Keycloak claims + membership in Phase 2.
apps\api\src\identity\identity.controllers.ts:112: * The endpoint the Next apps call to stop guessing. Everything it returns is
apps\api\src\identity\me.service.ts:34: * Next apps hold a Keycloak session they call this instead, and every value
apps\api\src\identity\membership.service.ts:26: * role, never from the account type claim itself." Whoever can mint one can

codex
The README requirement is broad, but the relevant written acceptance point is that the system must still build, deploy, and run independently. I found an ADR directly tied to this change, so I’m reading that and the guardrail script now.
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'Get-ChildItem -Path docs -Filter IMPLEMENTATION_LOG.md -Recurse' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'git diff --unified=80 HEAD~1..HEAD -- scripts/guardrails/verify_claims.py' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'Get-Content -Path docs/02-architecture/adr/ADR-017-PREBUILT-IMAGES-FOR-PRODUCTION-DEPLOYS.md' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$i=0; Get-Content -Path scripts/guardrails/verify_claims.py | ForEach-Object { $i++; '"'{0,4}: {1}' -f "'$i, $_ }' in C:\Users\USER\Documents\autoworkshop-ai
 declined in 0ms:
`"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$i=0; Get-Content -Path scripts/guardrails/verify_claims.py | ForEach-Object { $i++; '"'{0,4}: {1}' -f "'$i, $_ }'` rejected: blocked by policy
2026-07-27T23:07:18.507098Z ERROR codex_core::tools::router: error=`"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$i=0; Get-Content -Path scripts/guardrails/verify_claims.py | ForEach-Object { $i++; '"'{0,4}: {1}' -f "'$i, $_ }'` rejected: blocked by policy
 succeeded in 881ms:
diff --git a/scripts/guardrails/verify_claims.py b/scripts/guardrails/verify_claims.py
index d21204d..6c4e231 100644
--- a/scripts/guardrails/verify_claims.py
+++ b/scripts/guardrails/verify_claims.py
@@ -1,321 +1,345 @@
 #!/usr/bin/env python3
 """
 Claim verifier (guardrail layer 2) -- catches hallucinated and stale assertions.
 
 WHY THIS EXISTS
 ---------------
 On 2026-07-26 the control files stated that T-0018 and T-0019 were the top open
 items. They had shipped hours earlier in 71a17fd. Nothing detected it, because
 nothing checks documentation against reality -- documentation is the one artifact
 in the repo with no compiler, no test and no type system behind it.
 
 Worse, the fix itself introduced new false claims: a reference to two review
 files that did not exist, and a "working tree clean at 3877835" written while
 five files were modified. Prose is where unverified assertions accumulate, and a
 confidently wrong status file is more dangerous than an obviously stale one --
 the next session trusts it and plans against it.
 
 WHAT IT CHECKS (all machine-checkable -- no model, no judgement, no network)
 ---------------------------------------------------------------------------
   1. PATHS      every repo-relative path referenced in prose must exist
   2. COMMITS    every git SHA cited must resolve in this repository
   3. TASK IDS   every T-#### referenced must exist in TASK_QUEUE.md
   4. STATUS     no document may contradict TASK_QUEUE.md about a task's status
                 -- this is the exact failure of 2026-07-26
   5. CITATIONS  every `file:line` citation must exist and be in range
 
 Historical statements are exempt from check 4: a sentence containing "was",
 "until", "previously", "no longer" and similar is describing the past on
 purpose, and forcing those to match current state would make honest history
 unwritable.
 
 Exit codes: 0 clean · 1 findings · 2 usage error.
 
     python verify_claims.py                 # check the default document set
     python verify_claims.py --strict        # warnings become failures
     python verify_claims.py PATH...         # check specific files
 """
 
 from __future__ import annotations
 
 import argparse
 import re
 import subprocess
 import sys
 from pathlib import Path
 
 # Documents whose factual claims are load-bearing for the next session.
 DEFAULT_TARGETS = [
     ".claude/SESSION_HANDOVER.md",
     ".claude/TASK_QUEUE.md",
     ".claude/CURRENT_PHASE.md",
     ".claude/CURRENT_TASK.md",
     "docs/05-database/BACKUP_AND_RESTORE.md",
     "README.md",
 ]
 
 # `reviews/` is deliberately NOT in the default set. A review is a point-in-time
 # record: it SHOULD say "nothing is scheduled" if that was true when it was
 # written. Rewriting history to satisfy a linter would destroy the audit trail.
 # Their citations are still checkable via --citations-only.
 
 TASK_QUEUE = Path(".claude/TASK_QUEUE.md")
 
+# "closed" is how the queue records a task investigated and dismissed -- T-0030
+# and T-0031 are both "**closed ... NOT A DEFECT**". Its absence here did not
+# merely mislabel them: because presence used to be inferred from status parsing,
+# an unrecognised word made a row that plainly exists invisible, and the checker
+# reported 15 real, correctly-documented references as missing from the queue.
 STATUS_WORDS = ["done", "queued", "partial", "blocked", "in progress", "complete", "open",
-                "withdrawn"]
+                "withdrawn", "closed"]
 HISTORICAL_MARKERS = [
     "was ", "were ", "until", "previously", "no longer", "used to", "had ",
     "shipped without", "said otherwise", "went stale", "before", "history",
     "originally", "at the time", "old ", "stale", "stopped", "stated",
 ]
 
 # A token that looks like a path: has a slash and a file-ish suffix.
 PATH_RE = re.compile(r"`([A-Za-z0-9_./\-]+\.(?:ts|tsx|js|sh|ps1|sql|py|md|json|yml|yaml|cron|txt))`")
 # file:line or file:line-line
 CITE_RE = re.compile(r"`?([A-Za-z0-9_./\-]+\.(?:ts|tsx|js|sh|ps1|sql|py|md|json|yml|yaml|cron)):(\d+)(?:-(\d+))?`?")
 SHA_RE = re.compile(r"`([0-9a-f]{7,40})`")
 TASK_RE = re.compile(r"\bT-(\d{4})\b")
 
 # How close a status word must be to a task id to count as a claim about it.
 PROXIMITY = 45
 
 
 class Findings:
     def __init__(self) -> None:
         self.items: list[tuple[str, str, str]] = []   # (level, where, message)
 
     def add(self, level: str, where: str, msg: str) -> None:
         self.items.append((level, where, msg))
 
     @property
     def failures(self) -> int:
         return sum(1 for lvl, _, _ in self.items if lvl == "FAIL")
 
     @property
     def warnings(self) -> int:
         return sum(1 for lvl, _, _ in self.items if lvl == "WARN")
 
 
 def git_object_exists(sha: str) -> bool:
     try:
         r = subprocess.run(
             ["git", "cat-file", "-t", sha],
             capture_output=True, text=True, timeout=15,
         )
         return r.returncode == 0 and r.stdout.strip() == "commit"
     except (OSError, subprocess.SubprocessError):
         return False
 
 
-def canonical_task_status(queue_text: str) -> dict[str, str]:
+def canonical_task_status(queue_text: str) -> tuple[set[str], dict[str, str]]:
     """
     Parse the TASK_QUEUE table -- it is the single source of truth for status.
 
+    Returns (known_ids, statuses). THESE ARE TWO DIFFERENT QUESTIONS and
+    conflating them was a bug: a row whose status cell used a word outside
+    STATUS_WORDS produced no entry at all, so "does this task exist" answered
+    NO for a task documented on its own line. That reported 15 correct
+    references as missing and failed the gate for the wrong reason -- the sort
+    of false positive that gets a guardrail switched off.
+
+    So presence is now recorded for EVERY row carrying a task id, and status is
+    recorded only when it can actually be read.
+
     The status cell is prose as well as a verdict: T-0003 reads
     "**partial** -- organizations + tenant DB layer + audit done; ... outstanding".
     Scanning for the first status word anywhere in that cell returns "done",
     which is the opposite of what the row says. So the **bolded** verdict wins,
     and only if there is none do we fall back to a bare scan.
     """
+    known: set[str] = set()
     statuses: dict[str, str] = {}
     for line in queue_text.splitlines():
         if not line.strip().startswith("|"):
             continue
         cells = [c.strip() for c in line.strip().strip("|").split("|")]
         if len(cells) < 4:
             continue
         m = TASK_RE.search(cells[0])
         if not m:
             continue
+        known.add(f"T-{m.group(1)}")
         cell = cells[3]
         bold = re.findall(r"\*\*([^*]+)\*\*", cell)
         candidates = [b.lower() for b in bold] or [cell.lower()]
         chosen = None
         for cand in candidates:
             for w in STATUS_WORDS:
                 if w in cand:
                     chosen = w
                     break
             if chosen:
                 break
         if chosen:
             statuses[f"T-{m.group(1)}"] = chosen
-    return statuses
+    return known, statuses
 
 
 def resolve_path(ref: str, repo_files: dict[str, list[Path]]) -> bool:
     """
     Does this referenced path point at a real file?
 
     Documentation legitimately writes paths relative to the directory it is
     talking about -- `./check-backup-health.sh` inside a section whose commands
     all run from `infrastructure/backup`. Demanding repo-root-relative paths
     everywhere would flag correct prose, and a checker that flags correct prose
     is one an operator learns to ignore. So: try root-relative first, then
     accept any unambiguous suffix match elsewhere in the repo.
     """
     clean = ref.lstrip("./")
     if Path(ref).exists() or Path(clean).exists():
         return True
     name = Path(clean).name
     for cand in repo_files.get(name, []):
         if str(cand).replace("\\", "/").endswith(clean):
             return True
     return False
 
 
 def index_repo_files() -> dict[str, list[Path]]:
     """Map basename -> paths, so a relative reference can be resolved by suffix."""
     out: dict[str, list[Path]] = {}
     skip = {".git", "node_modules", ".next", "dist", "build", ".guardrails", "__pycache__"}
     for p in Path(".").rglob("*"):
         parts = set(p.parts)
         if parts & skip or not p.is_file():
             continue
         out.setdefault(p.name, []).append(p)
     return out
 
 
 def is_historical(line: str) -> bool:
     low = line.lower()
     return any(mark in low for mark in HISTORICAL_MARKERS)
 
 
-def check_document(path: Path, canonical: dict[str, str], f: Findings, citations_only: bool,
+def check_document(path: Path, known_ids: set[str], canonical: dict[str, str],
+                   f: Findings, citations_only: bool,
                    repo_files: dict[str, list[Path]]) -> None:
     try:
         text = path.read_text(encoding="utf-8", errors="replace")
     except OSError as e:
         f.add("FAIL", str(path), f"cannot read: {e}")
         return
 
     for lineno, line in enumerate(text.splitlines(), 1):
         where = f"{path}:{lineno}"
 
         # --- 5. citations: file:line must exist and be in range ------------
         for m in CITE_RE.finditer(line):
             target, start, end = m.group(1), int(m.group(2)), m.group(3)
             tp = Path(target)
             if not tp.exists():
                 continue        # handled by the path check below
             try:
                 n_lines = len(tp.read_text(encoding="utf-8", errors="replace").splitlines())
             except OSError:
                 continue
             hi = int(end) if end else start
             if start < 1 or hi > n_lines:
                 f.add("FAIL", where,
                       f"citation {target}:{m.group(2)}{'-' + end if end else ''} is out of range "
                       f"(file has {n_lines} lines)")
 
         if citations_only:
             continue
 
         # --- 1. paths must exist -------------------------------------------
         for m in PATH_RE.finditer(line):
             ref = m.group(1)
             if ref.startswith(("http", "//")) or " " in ref:
                 continue
             # Bare filenames without a directory are usually generic prose
             # ("a package.json"), not a claim about a specific file here.
             if "/" not in ref:
                 continue
             if not resolve_path(ref, repo_files):
                 f.add("FAIL", where, f"referenced path does not exist: {ref}")
 
         # --- 2. commit SHAs must resolve ------------------------------------
         for m in SHA_RE.finditer(line):
             sha = m.group(1)
             if not re.fullmatch(r"[0-9a-f]+", sha):
                 continue
             # Skip things that are plainly not SHAs: all digits, or hex that is
             # actually a status code like 0xC000013A written without the 0x.
             if sha.isdigit():
                 continue
             if not git_object_exists(sha):
                 f.add("WARN", where, f"cited commit does not resolve in this repo: {sha}")
 
         # --- 3 & 4. task ids and status agreement ---------------------------
         for m in TASK_RE.finditer(line):
             tid = f"T-{m.group(1)}"
-            if tid not in canonical:
+            if tid not in known_ids:
                 f.add("FAIL", where, f"{tid} is referenced but is not in TASK_QUEUE.md")
                 continue
+            # The row exists but its verdict is not machine-readable. That is a
+            # documentation nit, not a contradiction, and there is nothing to
+            # compare a claim against -- so say nothing rather than guess.
+            if tid not in canonical:
+                continue
             if path.samefile(TASK_QUEUE) if TASK_QUEUE.exists() else False:
                 continue
             if is_historical(line):
                 continue
             # Only a status word in the SAME CLAUSE is a claim about this id.
             # "the backup thread is complete, with delivery outstanding as
             # T-0023" describes the thread; "(T-0018). Phase 4 is blocked by..."
             # describes Phase 4. Clause boundaries separate them; raw proximity
             # does not, and a checker that flags correct prose gets switched off.
             lo = max((line.rfind(c, 0, m.start()) for c in ".;:"), default=-1) + 1
             hi_candidates = [line.find(c, m.end()) for c in ".;:"]
             hi_candidates = [h for h in hi_candidates if h != -1]
             hi = min(hi_candidates) if hi_candidates else len(line)
             clause = line[lo:hi]
             low = clause.lower()
 
             # "X is blocked ON T-0003" states a dependency, not T-0003's status.
             dep = re.search(r"blocked\s+on\s+" + re.escape(tid), clause, re.I)
             claimed = [w for w in STATUS_WORDS if w in low]
             if dep:
                 claimed = [w for w in claimed if w != "blocked"]
             if not claimed:
                 continue
             truth = canonical[tid]
             # "complete" and "done" are the same claim.
             norm = {"complete": "done"}
             claimed_n = {norm.get(c, c) for c in claimed}
             truth_n = norm.get(truth, truth)
             if truth_n not in claimed_n:
                 f.add("WARN", where,
                       f"{tid} is described as {sorted(claimed_n)} but TASK_QUEUE.md says '{truth}'")
 
 
 def main() -> int:
     ap = argparse.ArgumentParser(description="Verify factual claims in project documentation.")
     ap.add_argument("targets", nargs="*", help="files to check (default: control files)")
     ap.add_argument("--strict", action="store_true", help="treat warnings as failures")
     ap.add_argument("--citations-only", action="store_true",
                     help="only validate file:line citations (safe for reviews/)")
     args = ap.parse_args()
 
     if not TASK_QUEUE.exists():
         print(f"! {TASK_QUEUE} not found -- run from the repository root", file=sys.stderr)
         return 2
 
-    canonical = canonical_task_status(TASK_QUEUE.read_text(encoding="utf-8", errors="replace"))
+    known_ids, canonical = canonical_task_status(
+        TASK_QUEUE.read_text(encoding="utf-8", errors="replace"))
     targets = [Path(t) for t in (args.targets or DEFAULT_TARGETS)]
 
     repo_files = index_repo_files()
     f = Findings()
     checked = 0
     for t in targets:
         if not t.exists():
             f.add("WARN", str(t), "target document does not exist")
             continue
         checked += 1
-        check_document(t, canonical, f, args.citations_only, repo_files)
+        check_document(t, known_ids, canonical, f, args.citations_only, repo_files)
 
     print(f"=== claim verification -- {checked} document(s), "
-          f"{len(canonical)} known task ids ===")
+          f"{len(known_ids)} known task ids ===")
     if not f.items:
         print("  OK        every checked claim resolves")
     for level, where, msg in f.items:
         print(f"  {level:<9} {where}: {msg}")
 
     print()
     if f.failures or (args.strict and f.warnings):
         print(f"RESULT: FAIL -- {f.failures} failure(s), {f.warnings} warning(s)")
         return 1
     if f.warnings:
         print(f"RESULT: PASS WITH WARNINGS -- {f.warnings} warning(s)")
         return 0
     print("RESULT: PASS")
     return 0
 
 
 if __name__ == "__main__":
     sys.exit(main())

 succeeded in 1111ms:
 succeeded in 1154ms:
# ADR-017 â€” Production deploys run a prebuilt image, not a host build

**Status:** Accepted Â· 2026-07-27
**Supersedes:** the `runtime: node` half of the `render.yaml` blueprint (ADR-012 still governs cost)

## Context

`autoworkshop.aiappinvent.com` was not live. The blocker was not DNS, not the
custom domain and not the service definition â€” all three were correct and the
domain was already `verified`. The blocker was that **Render's builder cannot
build this repository**.

The failure signature is hostile to diagnosis: `next build` exits **1**
immediately after "Skipping linting", with **completely empty stderr**. A log
with no error in it is consistent with every hypothesis, which is exactly why
six fixes were attempted across two sessions and **two of them were fixes for
wrong diagnoses**.

What has been ruled out, each by measurement rather than argument:

| Hypothesis | How it was killed |
|---|---|
| Out of memory | builder reports 48 CPUs / 95 GB RAM, 8 GB cgroup; exit code **1**, not 137 |
| Build worker pool | `experimental.cpus: 1` + `workerThreads: false` changed nothing |
| Lint / type-check | skipping both moved the failure without fixing it |
| `sharp` native build | `require('sharp')` tested directly on the builder |
| The code itself | a clean checkout builds in ~25 s on `ubuntu-latest` |
| **V8 heap limit (448 MB)** | **reproduced deliberately at 496 MB in CI â€” the build still passed** |

The last row is the one that closed the argument. The 448 MB heap was the best
remaining explanation and it is *wrong*; had it been applied as a fix it would
have been the seventh attempt and the third wrong diagnosis.

At that point the useful question stopped being "why does Render's builder fail"
and became "why is Render's builder in the critical path at all".

## Decision

**CI builds a container image, proves it serves, publishes it to GHCR, and
Render runs that image. Render compiles nothing.**

- `apps/workshop-web/Dockerfile` â€” multi-stage, `output: 'standalone'`, pinned to
  the same Node and pnpm versions as CI.
- `.github/workflows/release.yml` â€” the production gate.
- A new **image-runtime** Render service. A service's runtime cannot be changed
  from `node` to `image` in place, which is why the existing
  `srv-d9jsliu7r5hc73b1kncg` is retired rather than repaired.

### The gate is "does it serve", not "does it compile"

This is the part that matters, and it is not a formality. **Twice** this repo has
shipped changes that were green on typecheck, lint, 122 unit tests and a
10-target build and were still broken the moment the app was started:

1. `UntrustedHost` â€” Auth.js v5 rejects an unrecognised Host and only
   auto-detects Vercel.
2. A Keycloak provider with **no `issuer`** â€” so no authorization, token or JWKS
   endpoint existed.

Both produced **500 on every `/api/auth/*` route while ordinary pages returned
200**. That asymmetry is invisible to any check that merely loads a page, which
is why `release.yml` starts the real container and calls
`/api/auth/providers` and `/api/auth/session` explicitly, and asserts the
session document contains no tokens before publishing.

## Consequences

**Good.** An unexplained third-party build host is permanently out of the
deploy path. The artifact that runs in production is byte-identical to the one
that was smoke-tested â€” the deploy pins the commit-sha tag, not `:latest`.
Deploys become an image pull, which is faster and cannot fail for build reasons.

**Costs and limits, stated rather than discovered:**

- **The GHCR package must be public.** Render pulls anonymously; a private
  package fails with `manifest unknown`, which does not look like a permissions
  error. The repository is already public, so this leaks nothing new.
- **`NEXT_PUBLIC_*` variables are baked in at build time.** Setting them on the
  Render service affects server-side reads only. Changing a client-visible one
  requires a rebuild, not a restart.
- **The root cause of the Render build failure is still unknown.** This decision
  routes around it; it does not explain it. That is an acceptable trade only
  because the build now happens somewhere its output can be read.
- The other six Next apps still have no deployment story. Only `workshop-web` is
  containerised.

## Not decided here

Postgres, Keycloak, Redis, NATS and the NestJS API remain undeployed, so the
live site renders its **signed-out** state. That is correct behaviour, not a
fault â€” see `render.yaml` and ADR-016. Sign-in going live is a separate decision
about where identity is hosted, and Render's free Postgres is ruled out by
COMBINED_PLAN_v2 Â§6 (30-day expiry â€” the exact failure that took Solar down on
2026-07-09).

codex
There is no `docs/IMPLEMENTATION_LOG.md` in this checkout, so I’m using README plus the ADRs and guardrail docs as the stated implementation record. The diff is not just cosmetic: it removes the worker-pool workaround after ADR-017 says that workaround was measured and ineffective.
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "rg -n \"output: 'standalone'|SKIP_BUILD_CHECKS|constrainedBuild|experimental|eslint|typescript|standalone\" apps/*-web/next.config.mjs" in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'Get-Content -Path scripts/guardrails/README.md' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg -n "STATUS_WORDS|def canonical_task_status|known.add|if tid not in known_ids|if tid not in canonical|claim verification|CITE_RE|PATH_RE|for m in CITE_RE" scripts/guardrails/verify_claims.py' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'Get-Content -Path .claude/TASK_QUEUE.md' in C:\Users\USER\Documents\autoworkshop-ai
 exited 1 in 1035ms:
rg: apps/*-web/next.config.mjs: IO error for operation on apps/*-web/next.config.mjs: The filename, directory name, or volume label syntax is incorrect. (os error 123)

2026-07-27T23:07:37.097438Z ERROR codex_core::tools::router: error=Exit code: 1
Wall time: 1 seconds
Output:
rg: apps/*-web/next.config.mjs: IO error for operation on apps/*-web/next.config.mjs: The filename, directory name, or volume label syntax is incorrect. (os error 123)

 succeeded in 1092ms:
69:STATUS_WORDS = ["done", "queued", "partial", "blocked", "in progress", "complete", "open",
78:PATH_RE = re.compile(r"`([A-Za-z0-9_./\-]+\.(?:ts|tsx|js|sh|ps1|sql|py|md|json|yml|yaml|cron|txt))`")
80:CITE_RE = re.compile(r"`?([A-Za-z0-9_./\-]+\.(?:ts|tsx|js|sh|ps1|sql|py|md|json|yml|yaml|cron)):(\d+)(?:-(\d+))?`?")
115:def canonical_task_status(queue_text: str) -> tuple[set[str], dict[str, str]]:
121:    STATUS_WORDS produced no entry at all, so "does this task exist" answered
146:        known.add(f"T-{m.group(1)}")
152:            for w in STATUS_WORDS:
214:        for m in CITE_RE.finditer(line):
233:        for m in PATH_RE.finditer(line):
259:            if tid not in known_ids:
265:            if tid not in canonical:
285:            claimed = [w for w in STATUS_WORDS if w in low]
326:    print(f"=== claim verification -- {checked} document(s), "

 succeeded in 1203ms:
# Task queue

| ID | Task | Phase | Status |
|---|---|---|---|
| T-0001 | Release 0.1 foundation | 1 | **done** â€” tagged `v0.1.0` |
| T-0002 | Keycloak realm + client + docker wiring | 2 | **done** â€” realm as configuration-as-code |
| T-0003 | Users, organizations, branches, memberships | 2 | **done 2026-07-27** â€” `BranchService`, `UserService`, `MembershipService` + controllers on the `OrganizationService` pattern. 8 routes live under `/api/v1`, all 401 unauthenticated. Role gates, role allow-list, audit, one-way withdrawal. **`viewerGrants()`/`viewerRole()` still demo â€” replacing them is T-0005 (session wiring), not more services** |
| T-0004 | Roles, permissions, permission matrix | 2 | **partial 2026-07-27** â€” `apps/api/src/authz/permission-matrix.ts` maps all 13 grantable roles to the 3 permission keys the nav gates on, from 07 pt2 Â§50 + 01 Â§29/Â§32. Fails closed on an unknown role. Deliberately small: new keys arrive with the modules that gate on them |
| T-0005 | Tenant context resolution from validated claims | 2 | **code complete 2026-07-27, GATES PENDING** (`0b678b5`) â€” `packages/auth` (Auth.js v5 + Keycloak, one factory x7), session-backed `viewerGrants()`/`viewerRole()` via `GET /api/v1/me`, all 7 apps wired with async layouts + middleware + route handler. Codex and Supervisor have NOT reviewed. Playwright NOT re-run. Earlier API side: `KeycloakJwtService`, `TenantGuard`, and now **`GET /api/v1/me`** returning userId/tenant/org/branch/activeRole/permissions/memberships, all derived server-side. **REMAINING: the Next apps have no session at all** â€” no Auth.js, so `viewerGrants()`/`viewerRole()` are still demo data |
| T-0006 | RLS FORCE + tenant-isolation test suite | 2 | **partial** â€” RLS proven as non-superuser; full suite outstanding |
| T-0007 | Audit framework (append-only) | 2 | **done** â€” `AuditService`, same transaction as the work it records |
| T-0008 | WAL archiving + PITR + off-host backup + restore drill (Supervisor C3) | 2 | **done** â€” archiving fixed (had NEVER worked), drill passes 4/4, RTO 16-106s, RPO 0 |
| T-0009 | Top navigation bar | 3 | **done** |
| T-0010 | Collapsible grouped side navigation | 3 | **done** |
| T-0011 | Shell surfaces: tabs, dialogs, drawers, AI assistant panel | 3 | **done** |
| T-0012 | Runtime theming (light / dark / system) | 3 | **done** |
| T-0013 | Responsive shell â€” mobile overlay nav, tablet behaviour | 3 | **done** |
| T-0014 | Storybook stories for every shell component (`01 (1).txt` Â§71) | 3 | **done** â€” 10 story files, 77 stories, axe 84/84 |
| T-0015 | Playwright shell journey + axe-core accessibility gate | 3 | **done** â€” `apps/e2e`, 138 passing, harness defects fixed 2026-07-27 |
| T-0016 | Workspace / organisation / branch switchers | 3 | **unblocked on the data side** (T-0003 done); still needs T-0005 session wiring to know who the viewer is |
| T-0017 | Quick-create, tasks, messages, notifications, help panels (Â§9-Â§14) | 3 | queued |

| T-0018 | Schedule the backup + drill | 2 | **done** â€” 4 Windows tasks live + `autoworkshop-backup.cron` for production; all 4 proven by triggering, `LastResult 0x0` |
| T-0019 | Alert on backup age and on `pg_stat_archiver.failed_count` rising | 2 | **partial** â€” `check-backup-health.sh` detects and exits non-zero (live: HEALTHY 7/7); delivery is cron-mail only, nothing notifies on Windows |
| T-0020 | Drill a restore from the OFF-HOST copy alone | 2 | queued |
| T-0021 | MinIO object-lock / immutability (needs a bucket rebuild) | 2 | queued |
| T-0022 | Rebuild the local cluster with `--data-checksums` on | 2 | queued |

| T-0023 | Deliver the health-check alert somewhere a human sees it (closes T-0019) | 2 | queued |
| T-0025 | ~~axe `color-contrast`~~ | 3 | **withdrawn** â€” the 10 hits came from stories rendering Storybook's error page, not from the palette |
| T-0026 | Dangling `aria-controls` (nav toggle + every collapsed SideNav group) | 3 | **done** â€” both were real; axe rated them CRITICAL |
| T-0027 | Navigation model becomes **workspace x role** (07 pt2 Â§46-Â§50) | 3 | **done 2026-07-27** â€” 4 role trees (Â§46-Â§49) beside the Â§34 workspace default; `viewerRole()` is the single decision point for BOTH the shell and the catch-all router. Verified live: Â§49 routes 200, Â§34-only routes 404. **Phase 5 unblocked** |
| T-0028 | Account types as *requests*, workshop staff invitation, approval limits | 2 | queued |
| T-0029 | Plan extension v1 r2 â€” specs 07/08/09 folded into the phase plan | â€” | **done** â€” `docs/00-project/PLAN_EXTENSION_v1.md` |
| T-0030 | ~~Side nav renders INLINE at 360px~~ | 3 | **closed 2026-07-27 â€” NOT A PRODUCT DEFECT.** A stale `next start` server was serving chunk hashes a later rebuild had deleted; every chunk 404'd, React never hydrated, so `useIsMobile()` never left its SSR default. Reproduced under control (main 103px, overflow 161px, `__react*` absent) and fixed with a build-freshness gate |
| T-0031 | ~~ThemeToggle radiogroup: arrows move focus but not selection~~ | 3 | **closed 2026-07-27 â€” NOT A DEFECT.** Same stale-server cause as T-0030: with no hydration `setPreference` never ran, so `aria-checked` never changed. The roving tabindex and arrow handling were already correct (shipped in the defect-4 fix). Both tests pass on a fresh build |
| T-0024 | Review guardrails: RAG grounding, claim verification, scoped review, idiom lint | 2 | **done** â€” 4 layers in `scripts/guardrails/`, wired as Stage 0 of the quality gate |

**Next up:** see `.claude/NEXT_SESSION_SCHEDULE.md`. Two threads: (1) the Render build fails
silently â€” run the same build in GitHub Actions to get an error message; (2) run Codex +
Supervisor + Playwright on T-0005, which is committed unreviewed.

**Superseded:** T-0005 â€” tenant context from the Keycloak session inside the Next apps. It is now the single blocker for T-0016 (switchers) and is what actually replaces the demo bodies of `viewerGrants()` and `viewerRole()`. Then T-0023, then T-0017.

**Phase 5 is unblocked.** T-0027 landed the workspace Ã— role navigation it was waiting on.

**All four tests left red at the 2026-07-26 close were one environmental fault.** Three were T-0030 and one was T-0031; none was a defect in the shell. The cause was a `next start` server serving a build that had been deleted underneath it.

**The Phase 2 backup thread is now closed except for delivery.** T-0008 is done and drilled (RTO
16â€“106 s, RPO 0, 4/4 runs); T-0018 is done and every job has actually fired; T-0019 detects but does
not deliver, which is T-0023. Live health as of 2026-07-26T19:47Z: **HEALTHY 7/7**, WAL
`archived=50, failed=0`.

âš ï¸ **T-0018/T-0019 shipped without a review gate.** Commit `71a17fd` left no record in `reviews/`
and did not update this file â€” the two facts are related. Retro-reviewed 2026-07-26.

**The retro-review was not a formality â€” it found a CRITICAL and a HIGH sitting in the DR
subsystem:** the off-host-copy check reported `OK` when there were **zero** off-host backups
(`grep -c` prints `0` and exits 1, so `|| echo 0` made `N` the string `"0\n0"` and the integer test
fell through to the healthy branch â€” correct on the healthy path, wrong on the only day it matters),
and the lock was per-job, so daily 02:15 overrunning into weekly 03:15 gave two concurrent
`pg_basebackup`s that the file's own header promised were impossible. Both fixed and re-verified.
See `reviews/codex-review-t0018-scheduling.md` and
`reviews/supervisor-adjudication-t0018-scheduling.md`.

 succeeded in 1270ms:
# Guardrails â€” against drift and hallucination

Four layers that sit *in front of* the review lane. Everything here is
deterministic: no model, no network, no API key, no judgement call. That is the
point â€” the reviewers downstream are probabilistic, and a probabilistic checker
guarding a probabilistic reviewer just compounds the uncertainty.

Every rule exists because the failure it prevents **actually happened in this
repository**, and each one names the incident. A guardrail with no incident
behind it is speculation, and speculation is what gets switched off the first
time it is inconvenient.

| Layer | File | Prevents |
|---|---|---|
| 1. Retrieval (RAG) | `rag.py` | Reviewing from memory instead of from the code |
| 2. Claim verification | `verify_claims.py` | Documentation that asserts things that are not true |
| 3. Scoped review | `scoped-review.sh` | A reviewer wandering off the files it was given |
| 4. Idiom lint | `lint-shell-idioms.sh` | Shell constructs that fail silently |

---

## Layer 1 â€” `rag.py`: retrieve, then reason

Zero-dependency BM25 retrieval over the repo and the source specs. Pure standard
library: no embedding service, no vector database, no network, nothing to pay
for, nothing to keep running.

BM25 rather than embeddings is a deliberate choice. Review questions are
dominated by exact identifiers â€” `grep -c`, `archive_command`, `viewerGrants`,
`T-0018`. Lexical scoring matches those precisely; embeddings blur them into
"something about archiving". It is also **deterministic**, which a gate needs:
the same query returns the same evidence every run, so a failure is reproducible
rather than a coin flip.

```bash
python scripts/guardrails/rag.py build --extra-root "C:/Users/USER/Documents/autoworkshop app"
python scripts/guardrails/rag.py query "off-host backup count" --scope infrastructure/backup
python scripts/guardrails/rag.py pack --scope path/to/file.sh --question "does X hold?"
```

Every retrieved span carries `file:line` provenance, so any claim built on it can
be traced back. Generated outputs (`logs/`, `drills/`, `artifacts/`, `status/`)
are **excluded from the index on purpose**: a drill report describes one past
run, and retrieving it as though it described current behaviour is exactly how a
reviewer concludes "archiving works" from a report written before it broke.

On Windows set `PYTHONIOENCODING=utf-8`, or the cp1252 console mangles `Â§` and
`â€”` on output. The index itself is always UTF-8.

## Layer 2 â€” `verify_claims.py`: documentation has no compiler

Documentation is the only artifact here with no type system, no test and no
build behind it, so unverified assertions accumulate in it silently.

Checks, all mechanical:

1. **Paths** â€” every repo-relative path referenced in prose exists
2. **Commits** â€” every cited SHA resolves in this repository
3. **Task IDs** â€” every `T-####` exists in `TASK_QUEUE.md`
4. **Status** â€” no document contradicts `TASK_QUEUE.md` about a task's status
5. **Citations** â€” every `file:line` reference exists and is in range

```bash
python scripts/guardrails/verify_claims.py            # control files
python scripts/guardrails/verify_claims.py --strict   # warnings become failures
python scripts/guardrails/verify_claims.py --citations-only reviews/*.md
```

**Why check 4 exists:** on 2026-07-26 the control files listed T-0018 and T-0019
as the top open items. Both had shipped hours earlier in `71a17fd`. The next
session would have planned against work that was already done.

**`reviews/` is deliberately not checked by default.** A review is a
point-in-time record and *should* say "nothing is scheduled" if that was true
when written. Rewriting history to satisfy a linter would destroy the audit
trail. Use `--citations-only` on reviews.

Two deliberate design concessions, both learned from a false-CRITICAL in the
backup health check that taught an operator to ignore it:

- Relative paths resolve by unambiguous suffix match, because docs legitimately
  write `./check-backup-health.sh` in a section whose commands run from
  `infrastructure/backup`.
- A status word only counts as a claim if it is in the **same clause** as the
  task id. `"(T-0018). Phase 4 is blocked byâ€¦"` describes Phase 4, and
  `"blocked on T-0003"` states a dependency, not a status.

## Layer 3 â€” `scoped-review.sh`: scope as structure, not as a request

On 2026-07-26 Codex was asked twice to review four shell files. It had the diff
on disk, an explicit allow-list, and an instruction to ignore every `.md` file.
**Both times it drifted onto the Markdown control files and answered none of the
five code questions.** Both real defects in that change â€” a CRITICAL false-healthy
and a HIGH lock defect â€” were found by the Supervisor instead.

Scope stated in a prompt is a request. This makes it structural:

1. **Ground it** â€” build a retrieval pack so the reviewer reads real spans with
   provenance rather than recalling what it thinks the code says.
2. **Fence it** â€” write the allow-listed sources and the diff into an isolated
   directory and point the reviewer there.
3. **Audit it** â€” after the run, extract every file cited and compare against the
   allow-list. Out-of-scope citations mark the review **UNTRUSTED**.

```bash
./scripts/guardrails/scoped-review.sh \
  --scope infrastructure/backup/run-scheduled.sh \
  --question "Can it record success when the job failed?" \
  --out reviews/codex-review-backup.md
```

Drift is reported in **two tiers**, because they mean different things:

- **explored** â€” paths anywhere in the transcript, including the reviewer's own
  `ls` output. Wasted attention; a leading indicator, not a failure.
- **cited** â€” paths in the reviewer's conclusions. These make the review
  untrusted, and they fail the run.

The first version conflated them and reported 176 "drift" hits when there were
about 3. A guardrail that reports 176 problems when there are 3 is one nobody
reads.

### Two false-greens this tool produced about itself

Recorded because they are the sharpest available illustration of why this layer
exists at all â€” and because both are the repo's dominant defect class, *the
metric reads healthy while the mechanism is inert*:

1. **"2/2 questions answered"** â€” the audit matched the output-format template
   echoed back inside the prompt (`ANSWER Q<n>: <direct answerâ€¦>`), not any real
   answer. It reported full marks for a run that answered nothing. Fixed by
   auditing only the reviewer's final message and stripping placeholders.
2. **"0 cited drift"** â€” the audit keyed off the requested output format. Codex
   ignored the format, so the audited region was empty, so drift was zero. Fixed
   by extracting citations from the final message regardless of format.

The run now aborts rather than proceeding ungrounded if the index build fails,
retrieval fails, or the context pack comes back near-empty. **Fail closed: an
ungrounded review is worse than no review, because it carries the same
authority.**

## Layer 4 â€” `lint-shell-idioms.sh`: constructs that fail silently

Three rules, each from a shipped defect:

1. **`grep -c â€¦ || echo 0`** â€” `grep -c` prints `0` *and exits 1* on no matches,
   so the fallback also fires and the value becomes `"0\n0"`. Every integer test
   on it then errors and takes the wrong branch. This shipped a CRITICAL
   false-healthy in `check-backup-health.sh`: the off-host backup count reported
   `OK` when there were **zero** backups. It was then reproduced in
   `scoped-review.sh` **within the same session** â€” which is precisely why it is
   a lint rule and not a note in a review.
2. **`[ -s FILE ]` as proof of content** â€” `openssl` writes a 16-byte salt header
   before failing, so a totally empty encrypted backup passes `-s`.
3. **`docker exec` with a heredoc but no `-i`** â€” stdin is discarded silently;
   `psql` exits 0 having done nothing. Cost one failed restore drill.

The lint reads code only, never comments â€” otherwise every rule would trip on its
own explanation above and the whole file would fail on itself.

---

## Running them

Stage 0 of `./scripts/quality-gate.sh` runs layers 2 and 4 before any Codex pass,
so an objective failure stops the pipeline before five model reviews are spent on
the same diff.

```bash
./scripts/guardrails/lint-shell-idioms.sh
python scripts/guardrails/verify_claims.py
./scripts/guardrails/scoped-review.sh --scope <path> --question "<q>"
```

`.guardrails/` holds the index, context packs and raw transcripts. It is
gitignored â€” generated evidence, not source.

## What these do not do

They do not decide whether code is correct. They constrain *where* a reviewer
looks and *whether* a claim is checkable, which is a narrower job than reviewing
and the reason they can be deterministic.

**The Supervisor still has to read the code.** Every code defect found on
2026-07-26 came from reading it, not from a green gate â€” and that remains true
with these in place. These layers raise the floor; they do not raise the ceiling.

codex
The TASK_QUEUE shows the “closed” status rows that motivated the guardrail change, and it also still contains internally inconsistent text for T-0005. I’m checking whether the new parser masks that inconsistency or catches it.
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "rg -n \"output: 'standalone'|SKIP_BUILD_CHECKS|constrainedBuild|experimental|eslint|typescript|standalone\" apps -g next.config.mjs" in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'git show --stat --oneline HEAD; git show --name-only --format=fuller HEAD' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'python scripts/guardrails/verify_claims.py' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'python scripts/guardrails/verify_claims.py --strict' in C:\Users\USER\Documents\autoworkshop-ai
 declined in 0ms:
`"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'python scripts/guardrails/verify_claims.py'` rejected: blocked by policy
2026-07-27T23:07:51.846012Z ERROR codex_core::tools::router: error=`"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'python scripts/guardrails/verify_claims.py'` rejected: blocked by policy
 declined in 0ms:
`"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'python scripts/guardrails/verify_claims.py --strict'` rejected: blocked by policy
2026-07-27T23:07:51.847856Z ERROR codex_core::tools::router: error=`"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'python scripts/guardrails/verify_claims.py --strict'` rejected: blocked by policy
 succeeded in 554ms:
apps\customer-web\next.config.mjs:15: * OPT-IN, NEVER THE DEFAULT. Only the deploy sets SKIP_BUILD_CHECKS=1. A local
apps\customer-web\next.config.mjs:19:const constrainedBuild = process.env.SKIP_BUILD_CHECKS === '1';
apps\customer-web\next.config.mjs:23:  eslint: { ignoreDuringBuilds: constrainedBuild },
apps\customer-web\next.config.mjs:24:  typescript: { ignoreBuildErrors: constrainedBuild },
apps\workshop-web\next.config.mjs:15: * OPT-IN, NEVER THE DEFAULT. Only the deploy sets SKIP_BUILD_CHECKS=1. A local
apps\workshop-web\next.config.mjs:19:const constrainedBuild = process.env.SKIP_BUILD_CHECKS === '1';
apps\workshop-web\next.config.mjs:23:  eslint: { ignoreDuringBuilds: constrainedBuild },
apps\workshop-web\next.config.mjs:24:  typescript: { ignoreBuildErrors: constrainedBuild },
apps\workshop-web\next.config.mjs:26:   * Emit `.next/standalone` — a self-contained server plus only the node_modules
apps\workshop-web\next.config.mjs:36:   * this only ADDS the standalone directory.
apps\workshop-web\next.config.mjs:38:  output: 'standalone',
apps\insurance-web\next.config.mjs:15: * OPT-IN, NEVER THE DEFAULT. Only the deploy sets SKIP_BUILD_CHECKS=1. A local
apps\insurance-web\next.config.mjs:19:const constrainedBuild = process.env.SKIP_BUILD_CHECKS === '1';
apps\insurance-web\next.config.mjs:23:  eslint: { ignoreDuringBuilds: constrainedBuild },
apps\insurance-web\next.config.mjs:24:  typescript: { ignoreBuildErrors: constrainedBuild },
apps\fleet-web\next.config.mjs:15: * OPT-IN, NEVER THE DEFAULT. Only the deploy sets SKIP_BUILD_CHECKS=1. A local
apps\fleet-web\next.config.mjs:19:const constrainedBuild = process.env.SKIP_BUILD_CHECKS === '1';
apps\fleet-web\next.config.mjs:23:  eslint: { ignoreDuringBuilds: constrainedBuild },
apps\fleet-web\next.config.mjs:24:  typescript: { ignoreBuildErrors: constrainedBuild },
apps\admin-web\next.config.mjs:15: * OPT-IN, NEVER THE DEFAULT. Only the deploy sets SKIP_BUILD_CHECKS=1. A local
apps\admin-web\next.config.mjs:19:const constrainedBuild = process.env.SKIP_BUILD_CHECKS === '1';
apps\admin-web\next.config.mjs:23:  eslint: { ignoreDuringBuilds: constrainedBuild },
apps\admin-web\next.config.mjs:24:  typescript: { ignoreBuildErrors: constrainedBuild },
apps\towing-web\next.config.mjs:15: * OPT-IN, NEVER THE DEFAULT. Only the deploy sets SKIP_BUILD_CHECKS=1. A local
apps\towing-web\next.config.mjs:19:const constrainedBuild = process.env.SKIP_BUILD_CHECKS === '1';
apps\towing-web\next.config.mjs:23:  eslint: { ignoreDuringBuilds: constrainedBuild },
apps\towing-web\next.config.mjs:24:  typescript: { ignoreBuildErrors: constrainedBuild },
apps\supplier-web\next.config.mjs:15: * OPT-IN, NEVER THE DEFAULT. Only the deploy sets SKIP_BUILD_CHECKS=1. A local
apps\supplier-web\next.config.mjs:19:const constrainedBuild = process.env.SKIP_BUILD_CHECKS === '1';
apps\supplier-web\next.config.mjs:23:  eslint: { ignoreDuringBuilds: constrainedBuild },
apps\supplier-web\next.config.mjs:24:  typescript: { ignoreBuildErrors: constrainedBuild },

 succeeded in 633ms:
bf02141 fix(guardrails): a task row that exists must not be reported as missing
 apps/admin-web/next.config.mjs      | 14 -------------
 apps/customer-web/next.config.mjs   | 14 -------------
 apps/fleet-web/next.config.mjs      | 14 -------------
 apps/insurance-web/next.config.mjs  | 14 -------------
 apps/supplier-web/next.config.mjs   | 14 -------------
 apps/towing-web/next.config.mjs     | 14 -------------
 apps/workshop-web/next.config.mjs   | 14 -------------
 scripts/guardrails/verify_claims.py | 40 +++++++++++++++++++++++++++++--------
 8 files changed, 32 insertions(+), 106 deletions(-)
commit bf02141e1539cd9403c7c791766370cd11a56f15
Author:     marc667us <marc667us@yahoo.com>
AuthorDate: Mon Jul 27 16:05:03 2026 -0700
Commit:     marc667us <marc667us@yahoo.com>
CommitDate: Mon Jul 27 16:05:03 2026 -0700

    fix(guardrails): a task row that exists must not be reported as missing
    
    verify_claims.py failed the quality gate with 15 FAILs saying T-0030 and T-0031
    "are referenced but not in TASK_QUEUE.md". Both are documented on their own rows
    in that file. The gate was blocked by a checker that was wrong.
    
    Cause: presence was inferred from status parsing. A row was only registered if
    its status cell contained a known STATUS_WORD, and both rows read "**closed ...
    NOT A DEFECT**" -- "closed" was not in the vocabulary, so the rows produced no
    entry and "does this task exist" answered NO.
    
    Two fixes, because there were two faults. "closed" joins STATUS_WORDS, since it
    is how the queue records a task investigated and dismissed. And presence is now
    recorded for every row carrying a task id, independently of whether its verdict
    can be read -- an unreadable status is a documentation nit, not a contradiction,
    so it is passed over silently rather than reported as an absence.
    
    Now PASS with 3 pre-existing warnings, 31 known ids (was 29).
    
    Also removes `experimental: { cpus: 1, workerThreads: false }` from all seven
    next.config.mjs. It was added for a diagnosis that proved wrong, and Render no
    longer builds anything, so the constraint has no remaining purpose. All seven
    still parse.
    
    Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>

apps/admin-web/next.config.mjs
apps/customer-web/next.config.mjs
apps/fleet-web/next.config.mjs
apps/insurance-web/next.config.mjs
apps/supplier-web/next.config.mjs
apps/towing-web/next.config.mjs
apps/workshop-web/next.config.mjs
scripts/guardrails/verify_claims.py

codex
I can’t execute the Python guardrail in this sandbox because the policy rejects script execution, so I’m reviewing the logic statically. One important pattern is already visible: the script now separates task existence from parsed status, which is directionally correct, but may silence malformed statuses entirely.
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'Get-Content -Path scripts/guardrails/verify_claims.py -TotalCount 180' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'Get-Content -Path apps/workshop-web/next.config.mjs' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'Get-Content -Path scripts/guardrails/verify_claims.py | Select-Object -Skip 180 -First 150' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'Get-Content -Path apps/admin-web/next.config.mjs' in C:\Users\USER\Documents\autoworkshop-ai
 succeeded in 887ms:
/**
 * `next build` re-runs ESLint and the TypeScript checker.
 *
 * On a constrained deploy builder that step is the one that dies â€” and it dies
 * SILENTLY: the Render build log ends at "Linting and checking validity of
 * types ..." and exits 1 with no diagnostic at all, because the checker is
 * killed rather than reporting a fault. A genuine type error prints the file
 * and the message; nothing printed means nothing was found.
 *
 * Skipping it there is not lowering the bar. `pnpm typecheck` (15/15) and
 * `pnpm lint` (15/15) are blocking gates that run on the same commit, so the
 * check still happens â€” once, where its output is readable â€” instead of twice,
 * the second time on a machine that cannot finish it.
 *
 * OPT-IN, NEVER THE DEFAULT. Only the deploy sets SKIP_BUILD_CHECKS=1. A local
 * or CI `pnpm build` still lints and type-checks in full, so a broken build
 * cannot reach the deploy by way of this flag.
 */
const constrainedBuild = process.env.SKIP_BUILD_CHECKS === '1';

/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: constrainedBuild },
  typescript: { ignoreBuildErrors: constrainedBuild },
  reactStrictMode: true,
  // Shared workspace packages are compiled by this app rather than pre-built,
  // so a token change is picked up without a separate build step.
  transpilePackages: ['@autoworkshop/ui', '@autoworkshop/design-tokens'],
  poweredByHeader: false,
};

export default nextConfig;

 succeeded in 978ms:
/**
 * `next build` re-runs ESLint and the TypeScript checker.
 *
 * On a constrained deploy builder that step is the one that dies â€” and it dies
 * SILENTLY: the Render build log ends at "Linting and checking validity of
 * types ..." and exits 1 with no diagnostic at all, because the checker is
 * killed rather than reporting a fault. A genuine type error prints the file
 * and the message; nothing printed means nothing was found.
 *
 * Skipping it there is not lowering the bar. `pnpm typecheck` (15/15) and
 * `pnpm lint` (15/15) are blocking gates that run on the same commit, so the
 * check still happens â€” once, where its output is readable â€” instead of twice,
 * the second time on a machine that cannot finish it.
 *
 * OPT-IN, NEVER THE DEFAULT. Only the deploy sets SKIP_BUILD_CHECKS=1. A local
 * or CI `pnpm build` still lints and type-checks in full, so a broken build
 * cannot reach the deploy by way of this flag.
 */
const constrainedBuild = process.env.SKIP_BUILD_CHECKS === '1';

/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: constrainedBuild },
  typescript: { ignoreBuildErrors: constrainedBuild },
  /**
   * Emit `.next/standalone` â€” a self-contained server plus only the node_modules
   * it actually traced.
   *
   * This app is deployed as a prebuilt container image rather than built on the
   * host that runs it, because Render's builder fails this build for reasons
   * that survived six attempts to find them, while the identical command
   * succeeds on Linux in CI. Standalone is what makes the runtime image small
   * enough to be worth doing: no pnpm store, no workspace, no build toolchain.
   *
   * Safe locally â€” `next start` prefers a normal build when one is present, and
   * this only ADDS the standalone directory.
   */
  output: 'standalone',
  /**
   * The workspace root, not this app. pnpm links workspace packages through
   * symlinks into ../../node_modules/.pnpm, and file tracing rooted at the app
   * directory would follow those links outside its root and drop the files.
   */
  outputFileTracingRoot: new URL('../../', import.meta.url).pathname,
  reactStrictMode: true,
  // Shared workspace packages are compiled by this app rather than pre-built,
  // so a token change is picked up without a separate build step.
  transpilePackages: ['@autoworkshop/ui', '@autoworkshop/design-tokens'],
  poweredByHeader: false,
};

export default nextConfig;

 succeeded in 1148ms:
#!/usr/bin/env python3
"""
Claim verifier (guardrail layer 2) -- catches hallucinated and stale assertions.

WHY THIS EXISTS
---------------
On 2026-07-26 the control files stated that T-0018 and T-0019 were the top open
items. They had shipped hours earlier in 71a17fd. Nothing detected it, because
nothing checks documentation against reality -- documentation is the one artifact
in the repo with no compiler, no test and no type system behind it.

Worse, the fix itself introduced new false claims: a reference to two review
files that did not exist, and a "working tree clean at 3877835" written while
five files were modified. Prose is where unverified assertions accumulate, and a
confidently wrong status file is more dangerous than an obviously stale one --
the next session trusts it and plans against it.

WHAT IT CHECKS (all machine-checkable -- no model, no judgement, no network)
---------------------------------------------------------------------------
  1. PATHS      every repo-relative path referenced in prose must exist
  2. COMMITS    every git SHA cited must resolve in this repository
  3. TASK IDS   every T-#### referenced must exist in TASK_QUEUE.md
  4. STATUS     no document may contradict TASK_QUEUE.md about a task's status
                -- this is the exact failure of 2026-07-26
  5. CITATIONS  every `file:line` citation must exist and be in range

Historical statements are exempt from check 4: a sentence containing "was",
"until", "previously", "no longer" and similar is describing the past on
purpose, and forcing those to match current state would make honest history
unwritable.

Exit codes: 0 clean Â· 1 findings Â· 2 usage error.

    python verify_claims.py                 # check the default document set
    python verify_claims.py --strict        # warnings become failures
    python verify_claims.py PATH...         # check specific files
"""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
from pathlib import Path

# Documents whose factual claims are load-bearing for the next session.
DEFAULT_TARGETS = [
    ".claude/SESSION_HANDOVER.md",
    ".claude/TASK_QUEUE.md",
    ".claude/CURRENT_PHASE.md",
    ".claude/CURRENT_TASK.md",
    "docs/05-database/BACKUP_AND_RESTORE.md",
    "README.md",
]

# `reviews/` is deliberately NOT in the default set. A review is a point-in-time
# record: it SHOULD say "nothing is scheduled" if that was true when it was
# written. Rewriting history to satisfy a linter would destroy the audit trail.
# Their citations are still checkable via --citations-only.

TASK_QUEUE = Path(".claude/TASK_QUEUE.md")

# "closed" is how the queue records a task investigated and dismissed -- T-0030
# and T-0031 are both "**closed ... NOT A DEFECT**". Its absence here did not
# merely mislabel them: because presence used to be inferred from status parsing,
# an unrecognised word made a row that plainly exists invisible, and the checker
# reported 15 real, correctly-documented references as missing from the queue.
STATUS_WORDS = ["done", "queued", "partial", "blocked", "in progress", "complete", "open",
                "withdrawn", "closed"]
HISTORICAL_MARKERS = [
    "was ", "were ", "until", "previously", "no longer", "used to", "had ",
    "shipped without", "said otherwise", "went stale", "before", "history",
    "originally", "at the time", "old ", "stale", "stopped", "stated",
]

# A token that looks like a path: has a slash and a file-ish suffix.
PATH_RE = re.compile(r"`([A-Za-z0-9_./\-]+\.(?:ts|tsx|js|sh|ps1|sql|py|md|json|yml|yaml|cron|txt))`")
# file:line or file:line-line
CITE_RE = re.compile(r"`?([A-Za-z0-9_./\-]+\.(?:ts|tsx|js|sh|ps1|sql|py|md|json|yml|yaml|cron)):(\d+)(?:-(\d+))?`?")
SHA_RE = re.compile(r"`([0-9a-f]{7,40})`")
TASK_RE = re.compile(r"\bT-(\d{4})\b")

# How close a status word must be to a task id to count as a claim about it.
PROXIMITY = 45


class Findings:
    def __init__(self) -> None:
        self.items: list[tuple[str, str, str]] = []   # (level, where, message)

    def add(self, level: str, where: str, msg: str) -> None:
        self.items.append((level, where, msg))

    @property
    def failures(self) -> int:
        return sum(1 for lvl, _, _ in self.items if lvl == "FAIL")

    @property
    def warnings(self) -> int:
        return sum(1 for lvl, _, _ in self.items if lvl == "WARN")


def git_object_exists(sha: str) -> bool:
    try:
        r = subprocess.run(
            ["git", "cat-file", "-t", sha],
            capture_output=True, text=True, timeout=15,
        )
        return r.returncode == 0 and r.stdout.strip() == "commit"
    except (OSError, subprocess.SubprocessError):
        return False


def canonical_task_status(queue_text: str) -> tuple[set[str], dict[str, str]]:
    """
    Parse the TASK_QUEUE table -- it is the single source of truth for status.

    Returns (known_ids, statuses). THESE ARE TWO DIFFERENT QUESTIONS and
    conflating them was a bug: a row whose status cell used a word outside
    STATUS_WORDS produced no entry at all, so "does this task exist" answered
    NO for a task documented on its own line. That reported 15 correct
    references as missing and failed the gate for the wrong reason -- the sort
    of false positive that gets a guardrail switched off.

    So presence is now recorded for EVERY row carrying a task id, and status is
    recorded only when it can actually be read.

    The status cell is prose as well as a verdict: T-0003 reads
    "**partial** -- organizations + tenant DB layer + audit done; ... outstanding".
    Scanning for the first status word anywhere in that cell returns "done",
    which is the opposite of what the row says. So the **bolded** verdict wins,
    and only if there is none do we fall back to a bare scan.
    """
    known: set[str] = set()
    statuses: dict[str, str] = {}
    for line in queue_text.splitlines():
        if not line.strip().startswith("|"):
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) < 4:
            continue
        m = TASK_RE.search(cells[0])
        if not m:
            continue
        known.add(f"T-{m.group(1)}")
        cell = cells[3]
        bold = re.findall(r"\*\*([^*]+)\*\*", cell)
        candidates = [b.lower() for b in bold] or [cell.lower()]
        chosen = None
        for cand in candidates:
            for w in STATUS_WORDS:
                if w in cand:
                    chosen = w
                    break
            if chosen:
                break
        if chosen:
            statuses[f"T-{m.group(1)}"] = chosen
    return known, statuses


def resolve_path(ref: str, repo_files: dict[str, list[Path]]) -> bool:
    """
    Does this referenced path point at a real file?

    Documentation legitimately writes paths relative to the directory it is
    talking about -- `./check-backup-health.sh` inside a section whose commands
    all run from `infrastructure/backup`. Demanding repo-root-relative paths
    everywhere would flag correct prose, and a checker that flags correct prose
    is one an operator learns to ignore. So: try root-relative first, then
    accept any unambiguous suffix match elsewhere in the repo.
    """
    clean = ref.lstrip("./")
    if Path(ref).exists() or Path(clean).exists():
        return True
    name = Path(clean).name
    for cand in repo_files.get(name, []):
        if str(cand).replace("\\", "/").endswith(clean):
            return True

 succeeded in 1336ms:
    return False


def index_repo_files() -> dict[str, list[Path]]:
    """Map basename -> paths, so a relative reference can be resolved by suffix."""
    out: dict[str, list[Path]] = {}
    skip = {".git", "node_modules", ".next", "dist", "build", ".guardrails", "__pycache__"}
    for p in Path(".").rglob("*"):
        parts = set(p.parts)
        if parts & skip or not p.is_file():
            continue
        out.setdefault(p.name, []).append(p)
    return out


def is_historical(line: str) -> bool:
    low = line.lower()
    return any(mark in low for mark in HISTORICAL_MARKERS)


def check_document(path: Path, known_ids: set[str], canonical: dict[str, str],
                   f: Findings, citations_only: bool,
                   repo_files: dict[str, list[Path]]) -> None:
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError as e:
        f.add("FAIL", str(path), f"cannot read: {e}")
        return

    for lineno, line in enumerate(text.splitlines(), 1):
        where = f"{path}:{lineno}"

        # --- 5. citations: file:line must exist and be in range ------------
        for m in CITE_RE.finditer(line):
            target, start, end = m.group(1), int(m.group(2)), m.group(3)
            tp = Path(target)
            if not tp.exists():
                continue        # handled by the path check below
            try:
                n_lines = len(tp.read_text(encoding="utf-8", errors="replace").splitlines())
            except OSError:
                continue
            hi = int(end) if end else start
            if start < 1 or hi > n_lines:
                f.add("FAIL", where,
                      f"citation {target}:{m.group(2)}{'-' + end if end else ''} is out of range "
                      f"(file has {n_lines} lines)")

        if citations_only:
            continue

        # --- 1. paths must exist -------------------------------------------
        for m in PATH_RE.finditer(line):
            ref = m.group(1)
            if ref.startswith(("http", "//")) or " " in ref:
                continue
            # Bare filenames without a directory are usually generic prose
            # ("a package.json"), not a claim about a specific file here.
            if "/" not in ref:
                continue
            if not resolve_path(ref, repo_files):
                f.add("FAIL", where, f"referenced path does not exist: {ref}")

        # --- 2. commit SHAs must resolve ------------------------------------
        for m in SHA_RE.finditer(line):
            sha = m.group(1)
            if not re.fullmatch(r"[0-9a-f]+", sha):
                continue
            # Skip things that are plainly not SHAs: all digits, or hex that is
            # actually a status code like 0xC000013A written without the 0x.
            if sha.isdigit():
                continue
            if not git_object_exists(sha):
                f.add("WARN", where, f"cited commit does not resolve in this repo: {sha}")

        # --- 3 & 4. task ids and status agreement ---------------------------
        for m in TASK_RE.finditer(line):
            tid = f"T-{m.group(1)}"
            if tid not in known_ids:
                f.add("FAIL", where, f"{tid} is referenced but is not in TASK_QUEUE.md")
                continue
            # The row exists but its verdict is not machine-readable. That is a
            # documentation nit, not a contradiction, and there is nothing to
            # compare a claim against -- so say nothing rather than guess.
            if tid not in canonical:
                continue
            if path.samefile(TASK_QUEUE) if TASK_QUEUE.exists() else False:
                continue
            if is_historical(line):
                continue
            # Only a status word in the SAME CLAUSE is a claim about this id.
            # "the backup thread is complete, with delivery outstanding as
            # T-0023" describes the thread; "(T-0018). Phase 4 is blocked by..."
            # describes Phase 4. Clause boundaries separate them; raw proximity
            # does not, and a checker that flags correct prose gets switched off.
            lo = max((line.rfind(c, 0, m.start()) for c in ".;:"), default=-1) + 1
            hi_candidates = [line.find(c, m.end()) for c in ".;:"]
            hi_candidates = [h for h in hi_candidates if h != -1]
            hi = min(hi_candidates) if hi_candidates else len(line)
            clause = line[lo:hi]
            low = clause.lower()

            # "X is blocked ON T-0003" states a dependency, not T-0003's status.
            dep = re.search(r"blocked\s+on\s+" + re.escape(tid), clause, re.I)
            claimed = [w for w in STATUS_WORDS if w in low]
            if dep:
                claimed = [w for w in claimed if w != "blocked"]
            if not claimed:
                continue
            truth = canonical[tid]
            # "complete" and "done" are the same claim.
            norm = {"complete": "done"}
            claimed_n = {norm.get(c, c) for c in claimed}
            truth_n = norm.get(truth, truth)
            if truth_n not in claimed_n:
                f.add("WARN", where,
                      f"{tid} is described as {sorted(claimed_n)} but TASK_QUEUE.md says '{truth}'")


def main() -> int:
    ap = argparse.ArgumentParser(description="Verify factual claims in project documentation.")
    ap.add_argument("targets", nargs="*", help="files to check (default: control files)")
    ap.add_argument("--strict", action="store_true", help="treat warnings as failures")
    ap.add_argument("--citations-only", action="store_true",
                    help="only validate file:line citations (safe for reviews/)")
    args = ap.parse_args()

    if not TASK_QUEUE.exists():
        print(f"! {TASK_QUEUE} not found -- run from the repository root", file=sys.stderr)
        return 2

    known_ids, canonical = canonical_task_status(
        TASK_QUEUE.read_text(encoding="utf-8", errors="replace"))
    targets = [Path(t) for t in (args.targets or DEFAULT_TARGETS)]

    repo_files = index_repo_files()
    f = Findings()
    checked = 0
    for t in targets:
        if not t.exists():
            f.add("WARN", str(t), "target document does not exist")
            continue
        checked += 1
        check_document(t, known_ids, canonical, f, args.citations_only, repo_files)

    print(f"=== claim verification -- {checked} document(s), "
          f"{len(known_ids)} known task ids ===")
    if not f.items:
        print("  OK        every checked claim resolves")
    for level, where, msg in f.items:

codex
The main issue I’m seeing is not in the removal of `experimental.cpus`; that matches ADR-017. The risk is in the guardrail semantics: a green run can still hide malformed or ambiguous task status rows, which is exactly the class this script is supposed to prevent.
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg -n "T-0005|T-0030|T-0031|Next up|Superseded|Phase 5|live target|build, deploy and run" .claude/TASK_QUEUE.md README.md docs/02-architecture/adr/ADR-017-PREBUILT-IMAGES-FOR-PRODUCTION-DEPLOYS.md' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "rg -n \"Render builds|Render runs|other six|output: 'standalone'|SKIP_BUILD_CHECKS|experimental.cpus|workerThreads\" apps/workshop-web/next.config.mjs apps/admin-web/next.config.mjs docs/02-architecture/adr/ADR-017-PREBUILT-IMAGES-FOR-PRODUCTION-DEPLOYS.md README.md" in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'Get-Content -Path .claude/CURRENT_TASK.md; Get-Content -Path .claude/CURRENT_PHASE.md; Get-Content -Path .claude/SESSION_HANDOVER.md' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg -n "path.samefile|samefile|known ids|known_ids|canonical = canonical_task_status|if tid not in canonical|closed|complete" scripts/guardrails/verify_claims.py .claude/TASK_QUEUE.md scripts/guardrails/README.md' in C:\Users\USER\Documents\autoworkshop-ai
 succeeded in 1418ms:
docs/02-architecture/adr/ADR-017-PREBUILT-IMAGES-FOR-PRODUCTION-DEPLOYS.md:24:| Build worker pool | `experimental.cpus: 1` + `workerThreads: false` changed nothing |
docs/02-architecture/adr/ADR-017-PREBUILT-IMAGES-FOR-PRODUCTION-DEPLOYS.md:40:Render runs that image. Render compiles nothing.**
docs/02-architecture/adr/ADR-017-PREBUILT-IMAGES-FOR-PRODUCTION-DEPLOYS.md:42:- `apps/workshop-web/Dockerfile` — multi-stage, `output: 'standalone'`, pinned to
docs/02-architecture/adr/ADR-017-PREBUILT-IMAGES-FOR-PRODUCTION-DEPLOYS.md:84:- The other six Next apps still have no deployment story. Only `workshop-web` is
apps/admin-web/next.config.mjs:15: * OPT-IN, NEVER THE DEFAULT. Only the deploy sets SKIP_BUILD_CHECKS=1. A local
apps/admin-web/next.config.mjs:19:const constrainedBuild = process.env.SKIP_BUILD_CHECKS === '1';
apps/workshop-web/next.config.mjs:15: * OPT-IN, NEVER THE DEFAULT. Only the deploy sets SKIP_BUILD_CHECKS=1. A local
apps/workshop-web/next.config.mjs:19:const constrainedBuild = process.env.SKIP_BUILD_CHECKS === '1';
apps/workshop-web/next.config.mjs:38:  output: 'standalone',

 succeeded in 1443ms:
README.md:82:deleted tomorrow, this must still build, deploy and run.
.claude/TASK_QUEUE.md:7:| T-0003 | Users, organizations, branches, memberships | 2 | **done 2026-07-27** — `BranchService`, `UserService`, `MembershipService` + controllers on the `OrganizationService` pattern. 8 routes live under `/api/v1`, all 401 unauthenticated. Role gates, role allow-list, audit, one-way withdrawal. **`viewerGrants()`/`viewerRole()` still demo — replacing them is T-0005 (session wiring), not more services** |
.claude/TASK_QUEUE.md:9:| T-0005 | Tenant context resolution from validated claims | 2 | **code complete 2026-07-27, GATES PENDING** (`0b678b5`) — `packages/auth` (Auth.js v5 + Keycloak, one factory x7), session-backed `viewerGrants()`/`viewerRole()` via `GET /api/v1/me`, all 7 apps wired with async layouts + middleware + route handler. Codex and Supervisor have NOT reviewed. Playwright NOT re-run. Earlier API side: `KeycloakJwtService`, `TenantGuard`, and now **`GET /api/v1/me`** returning userId/tenant/org/branch/activeRole/permissions/memberships, all derived server-side. **REMAINING: the Next apps have no session at all** — no Auth.js, so `viewerGrants()`/`viewerRole()` are still demo data |
.claude/TASK_QUEUE.md:20:| T-0016 | Workspace / organisation / branch switchers | 3 | **unblocked on the data side** (T-0003 done); still needs T-0005 session wiring to know who the viewer is |
.claude/TASK_QUEUE.md:32:| T-0027 | Navigation model becomes **workspace x role** (07 pt2 §46-§50) | 3 | **done 2026-07-27** — 4 role trees (§46-§49) beside the §34 workspace default; `viewerRole()` is the single decision point for BOTH the shell and the catch-all router. Verified live: §49 routes 200, §34-only routes 404. **Phase 5 unblocked** |
.claude/TASK_QUEUE.md:35:| T-0030 | ~~Side nav renders INLINE at 360px~~ | 3 | **closed 2026-07-27 — NOT A PRODUCT DEFECT.** A stale `next start` server was serving chunk hashes a later rebuild had deleted; every chunk 404'd, React never hydrated, so `useIsMobile()` never left its SSR default. Reproduced under control (main 103px, overflow 161px, `__react*` absent) and fixed with a build-freshness gate |
.claude/TASK_QUEUE.md:36:| T-0031 | ~~ThemeToggle radiogroup: arrows move focus but not selection~~ | 3 | **closed 2026-07-27 — NOT A DEFECT.** Same stale-server cause as T-0030: with no hydration `setPreference` never ran, so `aria-checked` never changed. The roving tabindex and arrow handling were already correct (shipped in the defect-4 fix). Both tests pass on a fresh build |
.claude/TASK_QUEUE.md:39:**Next up:** see `.claude/NEXT_SESSION_SCHEDULE.md`. Two threads: (1) the Render build fails
.claude/TASK_QUEUE.md:41:Supervisor + Playwright on T-0005, which is committed unreviewed.
.claude/TASK_QUEUE.md:43:**Superseded:** T-0005 — tenant context from the Keycloak session inside the Next apps. It is now the single blocker for T-0016 (switchers) and is what actually replaces the demo bodies of `viewerGrants()` and `viewerRole()`. Then T-0023, then T-0017.
.claude/TASK_QUEUE.md:45:**Phase 5 is unblocked.** T-0027 landed the workspace × role navigation it was waiting on.
.claude/TASK_QUEUE.md:47:**All four tests left red at the 2026-07-26 close were one environmental fault.** Three were T-0030 and one was T-0031; none was a defect in the shell. The cause was a `next start` server serving a build that had been deleted underneath it.

 succeeded in 1169ms:
.claude/TASK_QUEUE.md:8:| T-0004 | Roles, permissions, permission matrix | 2 | **partial 2026-07-27** — `apps/api/src/authz/permission-matrix.ts` maps all 13 grantable roles to the 3 permission keys the nav gates on, from 07 pt2 §50 + 01 §29/§32. Fails closed on an unknown role. Deliberately small: new keys arrive with the modules that gate on them |
.claude/TASK_QUEUE.md:9:| T-0005 | Tenant context resolution from validated claims | 2 | **code complete 2026-07-27, GATES PENDING** (`0b678b5`) — `packages/auth` (Auth.js v5 + Keycloak, one factory x7), session-backed `viewerGrants()`/`viewerRole()` via `GET /api/v1/me`, all 7 apps wired with async layouts + middleware + route handler. Codex and Supervisor have NOT reviewed. Playwright NOT re-run. Earlier API side: `KeycloakJwtService`, `TenantGuard`, and now **`GET /api/v1/me`** returning userId/tenant/org/branch/activeRole/permissions/memberships, all derived server-side. **REMAINING: the Next apps have no session at all** — no Auth.js, so `viewerGrants()`/`viewerRole()` are still demo data |
.claude/TASK_QUEUE.md:35:| T-0030 | ~~Side nav renders INLINE at 360px~~ | 3 | **closed 2026-07-27 — NOT A PRODUCT DEFECT.** A stale `next start` server was serving chunk hashes a later rebuild had deleted; every chunk 404'd, React never hydrated, so `useIsMobile()` never left its SSR default. Reproduced under control (main 103px, overflow 161px, `__react*` absent) and fixed with a build-freshness gate |
.claude/TASK_QUEUE.md:36:| T-0031 | ~~ThemeToggle radiogroup: arrows move focus but not selection~~ | 3 | **closed 2026-07-27 — NOT A DEFECT.** Same stale-server cause as T-0030: with no hydration `setPreference` never ran, so `aria-checked` never changed. The roving tabindex and arrow handling were already correct (shipped in the defect-4 fix). Both tests pass on a fresh build |
.claude/TASK_QUEUE.md:49:**The Phase 2 backup thread is now closed except for delivery.** T-0008 is done and drilled (RTO
scripts/guardrails/README.md:138:retrieval fails, or the context pack comes back near-empty. **Fail closed: an
scripts/guardrails/verify_claims.py:64:# "closed" is how the queue records a task investigated and dismissed -- T-0030
scripts/guardrails/verify_claims.py:65:# and T-0031 are both "**closed ... NOT A DEFECT**". Its absence here did not
scripts/guardrails/verify_claims.py:69:STATUS_WORDS = ["done", "queued", "partial", "blocked", "in progress", "complete", "open",
scripts/guardrails/verify_claims.py:70:                "withdrawn", "closed"]
scripts/guardrails/verify_claims.py:119:    Returns (known_ids, statuses). THESE ARE TWO DIFFERENT QUESTIONS and
scripts/guardrails/verify_claims.py:201:def check_document(path: Path, known_ids: set[str], canonical: dict[str, str],
scripts/guardrails/verify_claims.py:259:            if tid not in known_ids:
scripts/guardrails/verify_claims.py:265:            if tid not in canonical:
scripts/guardrails/verify_claims.py:267:            if path.samefile(TASK_QUEUE) if TASK_QUEUE.exists() else False:
scripts/guardrails/verify_claims.py:272:            # "the backup thread is complete, with delivery outstanding as
scripts/guardrails/verify_claims.py:291:            # "complete" and "done" are the same claim.
scripts/guardrails/verify_claims.py:292:            norm = {"complete": "done"}
scripts/guardrails/verify_claims.py:312:    known_ids, canonical = canonical_task_status(
scripts/guardrails/verify_claims.py:324:        check_document(t, known_ids, canonical, f, args.citations_only, repo_files)
scripts/guardrails/verify_claims.py:327:          f"{len(known_ids)} known task ids ===")

 succeeded in 1548ms:
# Current task

Two threads are open. **Read both before starting** â€” the second one is the reason the
first is unreviewed.

---

## 1. T-0005 â€” Keycloak session in the 7 Next apps Â· CODE DONE, GATES PENDING

Committed as `0b678b5`. **The four-gate bar is UNMET**: Codex and the Supervisor have not
run on this diff. Green so far: typecheck 15/15 Â· lint 15/15 Â· unit **122** Â· build 10/10.
Playwright has **not** been re-run since the change.

**Do this before building anything on top of it.**

### What landed

`packages/auth` (was an empty directory) â€” one Auth.js v5 factory consumed by all seven
apps. Keycloak provider, public client + PKCE, JWT session, refresh owned by the `jwt`
callback alone, `getAccessToken()` server-side only.

`viewerGrants()` / `viewerRole()` no longer return hardcoded arrays. They resolve from
`GET /api/v1/me` using the session's access token, memoised per request with React
`cache()` so the shell and the catch-all router cannot land on different identities.

The viewer is split in two on purpose:
- `packages/next-shell/src/viewer-contract.ts` â€” PURE. Role and permission mapping.
  Importable by Playwright, Storybook and unit tests.
- `packages/next-shell/src/viewer.ts` â€” SERVER. Needs `next/headers`.

Merging them breaks the e2e suite at module load, and the usual repair is to hardcode
the expected values, at which point the test stops testing the model.

### Three environment faults fixed on the way, each load-bearing for T-0005

1. **Keycloak had been dead for ~30 hours.** Postgres restarted underneath it at
   12:25:24 on 07-26; the Agroal pool's first failure was 12:25:54, thirty seconds
   later, and it never recovered. `docker ps` said "Up 41 hours" the whole time.
   Compose now probes the realm discovery document. **Not** `/health/ready` â€” Keycloak
   ships with the datasource health check disabled, so that endpoint answers
   `{"status":"UP","checks":[]}` with a dead database and would have reported healthy
   throughout. `restart: unless-stopped` did not help either: the process never exited,
   it hung. The healthcheck makes the failure VISIBLE; it does not self-heal.
2. **Nobody could sign in.** The realm had zero users and `identity.users` zero rows.
   `scripts/seed-dev-identity.sh` creates both halves, which must agree on the Keycloak
   subject â€” hence one script rather than a realm fixture plus a SQL seed.
3. **`.env.example` was wrong twice.** `DATABASE_URL` named the bootstrap superuser,
   which `DatabaseService` refuses to boot with by design; `KEYCLOAK_CLIENT_ID` named a
   client that does not exist in the realm.

### The lesson worth carrying

**Two real defects survived every gate and were found by starting the app:**
`UntrustedHost` (Auth.js v5 rejects an unrecognised Host, auto-detecting Vercel only) and
a Keycloak provider with **no `issuer`**, so it had no endpoints at all. Both made every
`/api/auth/*` route return 500 **while ordinary pages returned 200**. A check that only
loads a page cannot see either. Verify auth by calling `/api/auth/session` and
`/api/auth/providers`, not by building.

Also: the audience mapper I was about to add **already existed** as the
`autoworkshop-audience` client scope, attached to all seven web clients. Verified against
a real token (`aud: ["autoworkshop-api","account"]`) rather than assumed. Search before
adding â€” the reverted commit is not in history because the check happened first.

### What T-0005 deliberately did NOT do

- **No redirect-to-sign-in.** Unauthenticated visitors get the signed-out shell: no
  grants, no role, the workspace default tree. Forcing auth would couple all 137
  Playwright tests to a running Keycloak, API and seeded database â€” a separate,
  reviewable change.
- **No signed-in browser journey.** `SUITE_VIEWER` in `shell-journey.spec.ts` is `null`,
  which is what the suite's browser actually has. The Â§46â€“Â§49 role trees are covered by
  unit tests against fixture viewers, but no browser test drives a real session yet.

### A consequence you will see immediately

**The admin app renders a blank sidebar when signed out.** Every group in that tree is
gated behind `platform.admin`, so an unauthenticated viewer correctly sees nothing. This
was invisible before, because the demo viewer held that grant. It is correct â€” nothing
leaks â€” but it looks broken, and it is the strongest argument for redirect-to-sign-in on
that app specifically. Pinned by `a signed-out viewer is shown NOTHING in the
platform-admin workspace`.

---

## 2. Render deploy â€” BLOCKED on a silent `next build` failure

`autoworkshop.aiappinvent.com` is **not live**. See `.claude/SESSION_HANDOVER.md` for the
full diagnostic trail and the ranked plan. Short version:

Everything except the build works. DNS is correct, the service exists with the right
config, the custom domain is attached. **Six deploys failed identically**: `next build`
exits **1** immediately after "Skipping linting", with **completely empty stderr**.

Ruled out by measurement, not by guesswork:
- **Not memory** â€” the builder reports 48 CPUs, 95 GB RAM, an 8 GB cgroup limit, and the
  exit code is 1, not 137.
- **Not the worker pool** â€” `experimental.cpus: 1` changed nothing.
- **Not lint or type-checking** â€” skipping both moved the failure without fixing it.
- **Not sharp** â€” `require('sharp')` was tested directly on the builder.
- **Not the code** â€” a fresh clone of `master` built cleanly with Render's exact install
  and build commands.

Two of those six attempts were fixes for wrong diagnoses. The heap cap was removed;
`experimental.cpus: 1` is **still in all seven `next.config.mjs` and should come out**
once the real cause is known.

**Next move: run the identical build in GitHub Actions on Ubuntu.** Free for public
repos, Linux like Render, and Actions does not swallow stderr. It either succeeds â€”
proving the fault is Render-specific â€” or finally prints the error.

## Definition of complete (`05.txt` Â§6)

Migration runs Â· backend rule exists Â· API works Â· page renders with loading/empty/error/
permission states Â· permissions enforced Â· tests pass Â· lint + typecheck pass Â· Playwright
journey passes Â· responsive checked Â· docs updated Â· **no paid dependency introduced** Â·
committed.
# Current phase

**Phase 3 â€” Application shell and navigation** Â· Release **0.2** Â· âœ… COMPLETE (2026-07-27)
(Phase 1 / Release 0.1 âœ… complete and tagged `v0.1.0`; Phase 2 identity partially complete â€”
see `TASK_QUEUE.md` for exactly which parts.)

Phases 2 and 3 are deliberately interleaved: the owner needed something to look at, and the shell
does not depend on the remainder of identity. Where it would have, it reads `viewerGrants()` â€” one
function to replace when the Keycloak session lands.

## Objective

`01 (1).txt` Â§2: top navigation bar, collapsible grouped side navigation, breadcrumbs, page headers,
tabs, drawers, dialogs, badges and the AI panel â€” working on desktop, tablet and mobile, across all
seven workspaces, from one shared shell.

## Deliverables

- [x] `packages/navigation` â€” all 7 workspaces' navigation, from the spec (27 tests)
- [x] `packages/next-shell` â€” one Next adapter for all 7 apps (no per-app copies)
- [x] Top navigation bar (Â§3-Â§15)
- [x] Collapsible grouped side navigation with counters, warnings and search (Â§16)
- [x] Breadcrumbs and page headers, with loading / empty / error states
- [x] Tabs, Dialog, Drawer (modal and non-modal), StatusBadge
- [x] AI assistant side panel (`02.txt` Â§8) â€” discloses action, data used, read-only vs
      changes-data, approval requirement, sources
- [x] Runtime theming: light / dark / system, no flash of wrong theme
- [x] Responsive â€” mobile overlay nav drawer with focus trap; `prefers-reduced-motion` honoured
- [x] Permission-aware visibility, with the router resolving from the same grants as the nav
- [x] Storybook story per component (`01 (1).txt` Â§71) â€” 77 stories, axe 84/84
- [x] Playwright shell journey + axe-core gate â€” `apps/e2e`, 138 passing
- [ ] Workspace / org / branch switchers (blocked on Phase 2 membership data)
- [ ] Quick-create, tasks, messages, notifications, help panels (Â§9-Â§14)

## Acceptance criteria

`pnpm typecheck` Â· `pnpm lint` Â· `pnpm test` Â· `pnpm build` all green Â· every workspace renders its
own navigation Â· no route reachable that the navigation does not advertise to that viewer Â· no paid
dependency.

**Status against those (2026-07-27):** typecheck 14/14, lint 14/14, unit tests 64, build 10/10,
Playwright 138 passed / 0 failed / 2 legitimate skips. Route/nav agreement verified live and locked by
`packages/next-shell/src/viewer.test.ts`; permission gating is now genuinely exercised in 5 of the 7
workspaces, having previously skipped in all 7 without anyone noticing.

## Next phase

Phase 4 â€” Customer and Vehicle (Release 0.3): registration, profile, vehicle garage, documents,
service history, complaint submission, appointment request, workshop search, dashboard.

**The gate that used to block Phase 4 is now clear.** T-0008's restore drill was the oldest
outstanding Supervisor condition; it is done, drilled 4/4 (RTO 16â€“106 s, RPO 0) and scheduled
(T-0018). Phase 4 is blocked only by the remaining Release 0.2 items below.

**Release 0.2 is closed.** T-0014 and T-0015 shipped 2026-07-26; T-0030 â€” the last item holding it
open â€” closed 2026-07-27 and turned out not to be a product defect at all, but a stale `next start`
server feeding the test suite a build that no longer existed on disk. A build-freshness gate now
fails the run when that recurs. See `reviews/supervisor-adjudication-t0030-harness.md`.

**Still open, and correctly NOT blocking 0.2:** T-0031 (ThemeToggle radiogroup activation), T-0016
(switchers, blocked on T-0003 membership data) and T-0017 (quick-create / tasks / messages /
notifications / help panels). T-0027 â€” the navigation model becoming workspace Ã— role per `07.txt`
part 2 Â§46â€“Â§50 â€” lands in Phase 3's scope but blocks Phase 5, so it is the next structural item.
# Session handover

## 2026-07-27 (pt2) â€” T-0005 sessions + Render deploy blocked

**Tip `0b678b5` on `master`, pushed, tree clean.** Read `.claude/NEXT_SESSION_SCHEDULE.md`
for the ranked plan, then `.claude/CURRENT_TASK.md`.

### Commits

| Commit | What |
|---|---|
| `dc0ab95` | Render blueprint + provisioning workflow |
| `71d7d8a` | deploy build skips the checks CI already runs |
| `379bc41` | single in-process build worker on the deploy builder |
| `0b678b5` | **T-0005 â€” Keycloak session in all 7 Next apps. GATES PENDING.** |

### Headline 1 â€” Keycloak had been dead for ~30 hours and nothing noticed

Postgres restarted underneath it at `12:25:24` on 07-26. Keycloak's first Agroal failure
was `12:25:54` â€” thirty seconds later â€” and the pool never recovered. `docker ps` reported
**"Up 41 hours"** throughout. It spanned three prior sessions. Nothing noticed because
nothing exercised Keycloak: the shell had no session, which is precisely what T-0005 was
about.

`restart: unless-stopped` did not help â€” the process never exited, it hung. And
`KC_HEALTH_ENABLED: "true"` was set with **no healthcheck reading it**. Compose now probes
the **realm discovery document**, deliberately not `/health/ready`: Keycloak ships with the
Quarkus datasource health check disabled, so that endpoint answers
`{"status":"UP","checks":[]}` without touching the database and would have said UP for all
thirty hours. Proven to discriminate in both directions before shipping.

### Headline 2 â€” two auth defects survived every gate

Found by **starting the app**, after typecheck 15/15, lint 15/15, 122 unit tests and a
10-target build were all green:

1. `UntrustedHost` â€” Auth.js v5 rejects an unrecognised Host and only auto-detects Vercel.
2. The Keycloak provider had **no `issuer`**, so it had no endpoints at all.

Both made every `/api/auth/*` route return **500 while ordinary pages returned 200**. That
asymmetry is the reason a build-green check cannot see them. Verify auth by calling
`/api/auth/session` and `/api/auth/providers`.

### Headline 3 â€” the Render build fails silently, and six attempts did not find it

`autoworkshop.aiappinvent.com` is **not live**. DNS is correct, the service exists with the
right config, the custom domain is attached. `next build` exits **1** immediately after
"Skipping linting" with **completely empty stderr**.

Ruled out by measurement: memory (builder has 48 CPUs / 95 GB / 8 GB cgroup, exit 1 not
137), worker pool (`cpus: 1` changed nothing), lint and type-checking (skipping moved the
failure), `sharp` (tested directly), and the code itself (a fresh clone of `master` built
cleanly with Render's exact commands).

**Two of the six attempts were fixes for wrong diagnoses.** The heap cap was removed;
`experimental.cpus: 1` is still in all seven `next.config.mjs` and **should come out**.

**Next move: run the same build in GitHub Actions on Ubuntu** â€” Linux like Render, and it
does not swallow stderr.

### Traps worth carrying forward

1. **Search before adding.** The audience mapper I was about to add already existed as the
   `autoworkshop-audience` client scope. Verified against a real token
   (`aud: ["autoworkshop-api","account"]`) instead of assumed.
2. **A stale server lies.** The build-freshness gate caught seven `next start` servers from
   before the rebuild, and caught my own on port 3100 mid-verification.
3. **Idempotence is not obvious.** `seed-dev-identity.sh` failed on its second run â€” the
   realm's `passwordHistory(3)` rejects re-setting the same password, so it now sets one
   only when no credential exists. A script that ran once looked idempotent and was not.
4. **`getAccessToken()` must not demand the secret before checking for a session.** It
   runs on every render; requiring `AUTH_SECRET` up front would 500 every page for
   visitors who have no session and need none.

### Owner direction

- **`RENDER_API_KEY` was pasted into the chat transcript.** Owner: "soon we rotate".
  Treat as compromised until rotated, then update the GitHub secret on this repo.
- Service naming settled: **one service, `autoworkshop`**, matching the Solar pattern
  (`solarpro-global` serves `solarpro.aiappinvent.com` â€” name and subdomain need not match).

---

# Session handover

> Read this first, then `.claude/CURRENT_PHASE.md` and `.claude/TASK_QUEUE.md`.

## Where the project stands â€” 2026-07-26 (session 2, afternoon)

**Release 0.1 shipped and tagged `v0.1.0`.** **Phase 2 (identity) partially complete.**
**Phase 3 (application shell, Release 0.2) is the current work and is now gated green.**

Repo: https://github.com/marc667us/autoworkshop-ai â€” public, `master` + `develop`.
Approved plan: `C:\Users\USER\Documents\autoworkshop app\_plan\COMBINED_PLAN_v2.md`
(Codex `PASS WITH CORRECTIONS` 14/14 applied â†’ Supervisor `PASS WITH CONDITIONS` 8/8 applied).

## This session â€” resumed a frozen session and finished its work

The previous session (transcript `f2cda62b-ed38-42fd-87de-540a2665efb4`) froze mid-command at
14:27 UTC, part-way through `pnpm typecheck && pnpm build` after fixing a circular-import crash.
Its process did not survive. This session read that transcript, resumed at exactly that point, and
completed the work.

**Gates, all green:** typecheck 13/13 Â· lint 13/13 Â· **tests 64** Â· build 9/9 (7 apps + API +
Storybook). Runtime verified by serving the production build, not just by building it.

### Shipped

- `packages/navigation` â€” navigation model for all 7 workspaces from `01 (1).txt` Â§34-Â§39 and
  `02.txt` Â§52/Â§58. 27 tests, including that all 25 platform-admin entries are present.
- `packages/next-shell` â€” ONE Next adapter (`WorkspaceShell`, `renderModulePage`, `viewerGrants`)
  for all 7 apps. The per-app shell copy that existed briefly was deleted.
- `packages/ui` â€” AppShell, TopNav, SideNav, Breadcrumbs, PageHeader, StatusBadge, ThemeProvider,
  **Tabs, Dialog, Drawer, AiAssistantPanel**, `useFocusTrap`, `useMediaQuery`.
- Runtime theming (light / dark / **system**) via CSS custom properties + no-flash boot script.
- Responsive shell: below 768px the side nav becomes a modal overlay drawer with a focus trap.
  `prefers-reduced-motion` is honoured by every animation.
- AI assistant panel per `02.txt` Â§8 â€” discloses the proposed action, the data it will use,
  read-only vs changes-data, the approval requirement and sources. Not wired to an agent (Phase 8),
  and it says so plainly rather than presenting an input box that swallows questions.
- `ai-coworkers/` + `reviews/` + `scripts/` pair-coding skeleton installed (was missing entirely,
  contrary to root CLAUDE.md). `./scripts/quality-gate.sh` now exists in this repo.

## Defects found by review â€” do NOT reintroduce

Codex reviewed the diff; each finding was verified against source before being accepted, and each
fix was verified at runtime afterwards. Reviews are saved under `reviews/`.

1. **The catch-all route ignored permissions entirely.** `renderModulePage` resolved against
   `workspace.groups`, not the grant-filtered tree, so any permission-gated module rendered by URL â€”
   and the placeholder page *printed the required permission name*, handing out a map of the
   authorization model. It also claimed "permissions for this screen are working" while checking
   none. Now resolves via `visibleGroups(workspace, grants)`, defaults to `[]` (fail closed), prints
   no permission names, and the copy is honest. **Verified live: gated URL 404s, ungated 200s.**
2. **Every right-hand top-nav button was focusable and inert.** Create / Tasks / Messages /
   Notifications / Help rendered as live buttons with count badges and no handler; the TopNav
   docstring simultaneously claimed "none of them silently no-op". An action with no `onSelect` now
   renders `disabled` with ", not available yet" in its accessible name. The workspace/org/branch/
   user indicators render as **plain text**, not buttons, until their switchers exist.
3. **Self-found, after Codex's pass: the nav and the router disagreed about who the viewer is.**
   The 7 `layout.tsx` files passed a hardcoded grants array while the catch-all passed none, so the
   workshop nav advertised `/finance-and-warranty/invoices` and that URL 404'd. Both now read
   `viewerGrants()` in `packages/next-shell/src/viewer.ts` â€” one function, one truth. Locked by
   `viewer.test.ts`, which asserts the *property* (everything advertised must resolve), not the
   symptom. **This is the bug class to watch for: two literals in two files cannot be type-checked
   into agreement.**
4. **`ThemeToggle` declared `role="radiogroup"` without the keyboard behaviour that promises.**
   Three tab stops, no arrow keys. Now a roving tabindex with arrow/Home/End, per the ARIA pattern.
5. **A circular import between `packages/design-tokens/src/themes.ts` and `index.ts`** put `primitive` in the
   temporal dead zone and crashed the production build while typecheck stayed green. Fixed by the
   previous session by extracting `primitive.ts`. **Watch for this class â€” a green typecheck does
   not prove a module graph initialises.**

## The rule this session kept learning

Everything in items 1, 2 and 3 passed typecheck, lint, 47-then-59 unit tests and a 7-app production
build while broken. **Build the thing, then run it and look.** Every real defect here was found by
either reading the code adversarially or by `curl`-ing the running app â€” none by a green gate.

## T-0008 (Supervisor C3) â€” DONE AND DRILLED

**WAL archiving had never once worked.** It was recorded last session as "done and VERIFIED live";
that verification had read the settings back. `pg_stat_archiver` said `archived_count=0`,
`failed_count=864`. `/wal_archive` was a root-owned Docker volume and `archive_command` runs as
uid 999 â€” every attempt denied, retried forever, nothing surfaced. **There was no point-in-time
recovery at all.** Fixed by the `postgres-init` service in the compose file.

Now in `infrastructure/backup/`: `verify-archiving.sh` (proves archiving by forcing a switch),
`backup.sh` (encrypted physical + logical + Keycloak realm, checksums, manifest, off-host copy,
retention) and `restore-drill.sh` (restores into a throwaway cluster and measures RTO/RPO).

**Drill passes 4/4 runs, 8/8 checks: RTO 16â€“106 s, RPO 0** â€” including all 10 transactions committed
*after* the backup, which is the actual proof of WAL replay. Reports in
`infrastructure/backup/drills/`. Full record in `reviews/supervisor-adjudication-c3-backup.md`.

Run it: `cd infrastructure/backup && ./restore-drill.sh` (~2 min, never touches the live cluster).


## Scheduling is LIVE (T-0018 / T-0019) â€” 2026-07-26

Four Windows Task Scheduler tasks under `\AutoWorkshop\`, all proven by triggering them:
health (every 6h) Â· daily 02:15 Â· weekly Sun 03:15 Â· **restore drill Sat 04:15**.
Production equivalent: `infrastructure/backup/schedule/autoworkshop-backup.cron`.
`./check-backup-health.sh` reports HEALTHY (7/7). Re-install: `schedule/install-windows.ps1`.

Two defects the scheduler found that manual runs never would:
1. `pg_switch_wal()` is a NO-OP with no WAL activity, so the pre-backup archiving gate blocked
   backups entirely on an **idle** database. Fixed with a heartbeat write before the switch.
2. The health check ran `grep` inside the minio container (minimal image, no grep) -> false
   CRITICAL "no off-host backup" while four sat in the bucket.

Caveat: Windows tasks run as the interactive user, so they need you logged in. The first scheduled
weekly returned 0xC000013A (terminated) mid-run; clean on every retry, root cause unconfirmed â€”
glance at the first real Sunday 03:15 run.

**Re-verified 2026-07-26T19:47Z:** all four tasks `Ready`, `LastResult 0x0`, next runs scheduled
(daily 07-27 02:15 Â· weekly 08-02 03:15 Â· drill 08-01 04:15 Â· health 6-hourly). Health check live:
**HEALTHY 7/7**, WAL `archived=50, failed=0`, newest backup 1 h old, 4 base backups off-host.

**Cosmetic, not urgent:** the *registered* task descriptions in Task Scheduler are still the old
text and show mojibake (`Monthly restore drill Ã¢â‚¬â€ â€¦`) because the installer used non-ASCII dashes.
The source is fixed; the live descriptions refresh on the next `install-windows.ps1` run. Triggers
and behaviour are correct now â€” the tasks were left running rather than re-registered for a string.

**T-0019 is partial, not done.** `check-backup-health.sh` *detects* (age, job freshness,
`failed_count`, drill age) and exits non-zero, but delivery is cron-mail only â€” **on Windows
nothing notifies anyone**; it writes `status/health.json` and waits to be read. Closing that is
T-0023.

âš ï¸ **`71a17fd` shipped without either review gate** â€” no `reviews/` record, and it updated no
control file, which is why this handover and `TASK_QUEUE.md` both went stale. Retro-reviewed
2026-07-26 (Codex + Supervisor); records in `reviews/`.

**That retro-review found a CRITICAL and a HIGH, both now fixed.** The off-host-copy check reported
`OK` when there were **zero** off-host backups â€” right on the healthy path, wrong on the only day it
matters â€” and the per-job lock allowed two concurrent `pg_basebackup`s the file's own header said
were impossible. **Codex found neither**; it drifted onto the Markdown files on both attempts
despite an explicit four-file allow-list. Every code defect here came from the Supervisor pass.
Treat a green Codex verdict on infrastructure shell as unproven until someone reads the code.

## Viewing the app locally

`pnpm build` then, per app, `cd apps/<name>-web && npx next start -p <port>`:
customer 3000 Â· workshop 3001 Â· supplier 3002 Â· fleet 3003 Â· insurance 3004 Â· towing 3005 Â· admin 3006.
**`npx next start` without `-p` ignores the package.json port and every app fights over 3000.**
Stop them before rebuilding â€” a running server locks `.next` on Windows.
Nothing is deployed to autoworkshop.aiappinvent.com yet.

## SESSION 2026-07-26 pt3 â€” close. Tip `bdfe65c`, pushed, tree clean.

Seven commits. Release 0.2 is **one defect away** from closing.

**T-0014 done** â€” 77 stories, every component in `packages/ui`.
**T-0015 done and PROVEN** â€” Storybook axe **84/84 green**; journey **37 passed / 4 failed**, and the four
are left failing on purpose because they are real.

ðŸ”´ **START HERE NEXT SESSION â€” T-0030.** At 360px the side nav renders **inline instead of as an overlay**:
`main` is squeezed to **103px** and the page scrolls horizontally by **161px**. `useIsMobile()` is returning
false in the built app while TopNav's CSS-driven mobile filtering still works, which is what hides it.
Confirmed *after* waiting for hydration, so it is not a test race. **This is Phase-3 defect 7, still live**,
underneath a green typecheck, green lint, 37 unit tests and a 9-target build.
Start at `packages/ui/src/AppShell.tsx:89` (`const isMobile = useIsMobile()`) and
`packages/ui/src/useMediaQuery.ts:26`. Reproduce with:
`cd apps/e2e && npx playwright test --project=shell-journey -g "overflow at 360px"`

Also fixed today: dangling `aria-controls` (axe CRITICAL) in **two** places â€” every *collapsed* SideNav group,
and TopNav's hardcoded `app-side-nav` while the mobile Drawer is unmounted. TopNav now takes `sideNavId`.

**Two of the four failures were the TESTS being wrong, not the code** â€” worth knowing before "fixing" them:
Tabs implements **manual activation deliberately** (arrows move focus, Enter selects; each panel costs a
fetch), and the modal-drawer focus test slept 200ms and raced the focus-trap effect.

**Guardrails shipped** (`scripts/guardrails/`, Stage 0 of `quality-gate.sh`): BM25 RAG grounding,
claim verification, scoped review with drift audit, shell-idiom lint. See `scripts/guardrails/README.md`.

**Plan extended** for specs 07/08/09 â†’ `docs/00-project/PLAN_EXTENSION_v1.md`. New Phases 12 (simulation
intelligence), 13 (knowledge ops), 14 (community). âš ï¸ `autoworkshop 07.txt` is **two documents** â€” lines
1798â€“5069 are a separate workshop-side spec (Â§1â€“52) that the first draft missed entirely.

**Beware the pipe trap.** `cmd | tail` reports *tail's* exit status. It made `playwright | tail` look like
exit 0 over 9 failures, and let a commit through while both guardrails were failing. Capture `$?` before any
pipe.

## SESSION 2026-07-27 â€” T-0030 CLOSED. It was never a product defect.

**Start here: T-0031, then T-0027.** Release 0.2 is closed.

### T-0030 was a stale server, not a responsive bug

Carried in as a live red defect: at 360px the side nav rendered inline, `main` squeezed to 103px,
161px of horizontal overflow, `useIsMobile()` false in the built app. **The shell was correct all
along.**

Seven `next start` servers were launched at 12:35 and the apps were rebuilt at 14:38 underneath them.
`next start` resolves its chunk manifest once at boot, so those servers kept serving HTML that
referenced chunk hashes the rebuild had deleted. Every chunk 404'd, React never hydrated, and
`useIsMobile()` never advanced past the `false` it deliberately starts with for SSR safety.
`reuseExistingServer: !CI` handed those stale servers straight to Playwright.

Reproduced under control rather than argued: stale server -> `main` 103px, scrollWidth 521 vs
clientWidth 360, no `__react*` keys on `<body>`. Fresh server, same build -> 360px, no overflow,
hydrated. Both numbers match the original report exactly.

**Why it fooled a careful reader.** The server still answers 200, the SSR markup is correct, and
TopNav's mobile rules are plain CSS *inside that markup* so they keep working. The previous session
cited that asymmetry as proof the bug was real. It is actually the signature of a page whose
JavaScript never ran. Waiting longer for hydration cannot fix a chunk that 404s â€” which is why "I
waited for hydration, so it is not a race" ruled out the wrong hypothesis.

### Now gated

`apps/e2e/tests/build-freshness.setup.ts` runs as a Playwright dependency project before every other
project and fails the run if any server references a `/_next/static` asset that is not on disk in
that app's `.next`. Proven both directions: it names the exact missing chunk on a stale server, and
passes 7/7 on fresh ones. "Stop the servers before rebuilding" was already written in THIS FILE when
the incident happened â€” documentation did not prevent it, so it is a gate now.

### Four more defects found, none of them by Codex

1. **The only security-relevant test in the suite had never once executed.** `"<workspace>: a gated
   URL 404s when typed directly"` â€” the regression test for the permission-BYPASS defect â€”
   `test.skip`ped in **all seven** workspaces, silently, every run. The nav model gates on just two
   permission keys and the demo viewer held both, so `gatedHref()` found nothing gated anywhere.
   Fixed: `DEMO_DEFAULT` no longer holds `finance.read`, and a new test fails if no workspace
   exercises gating. **When it was made to run, fail-closed held** â€” real 404s. It just had no proof.
2. **The suite served every app with the wrong Next major.** `npx next start ../<app>` ran from
   `apps/e2e`, which pinned `next@14.2.21`, against apps built with `15.1.3`. Next 14 dies on a
   missing `font-manifest.json`. Latent since T-0015 was written and masked entirely by the stale
   server reuse â€” removing one bug exposed the other. Fixed with per-app `cwd` + version alignment.
3. **The overlay test was a sleep-race** and would have stayed red on a correct app: it never waited
   for hydration. The overflow tests waited with `waitForTimeout(400)` â€” a race with the machine, not
   the app. All now use `waitForHydration()`, which waits for React's `__reactFiber$` keys, not a
   duration. `readyState === 'complete'` is NOT sufficient: it is equally true of a page whose JS 404'd.
4. **The disclosure assertion could not pass on correct code** â€” it matched the viewer's own grants in
   the RSC flight payload. Tightened to the gated module's specific required permission.

Codex found one real defect (stale copy on the workshop dashboard naming `finance.read`), which was
outside the changed files â€” a good catch. It also skipped both questions it was explicitly told to
answer and emitted no `VERDICT` line, for the third review running.

### T-0031 was the same phantom

Closed the same day. "Arrows move focus but not selection" is exactly how a correct radiogroup
behaves when its JavaScript never loaded: `setPreference` cannot run, so `aria-checked` never
changes. The roving tabindex and arrow/Home/End handling had already shipped with the defect-4 fix.
Both radiogroup tests pass on a fresh build, verified twice.

**So all four tests left red at the previous close were one environmental fault** â€” three T-0030,
one T-0031 â€” and no shell code was wrong in any of them.

### Open, recorded honestly

- **One unexplained anomaly:** a single build-guard run passed against a demonstrably stale server.
  Two later runs on the same state failed correctly and named the chunk, and a direct replication of
  the guard's logic also reported it missing. Not reproducible, no explanation. Recorded rather than
  rationalised â€” the direction (passing when it should fail) is the one that matters.
- **Guard covers each app's entry route only.** The shared runtime chunks it does check change on
  essentially any edit, so coverage is high but not total. Extending to a sample of routes is a cheap
  follow-up.

### Gates, 2026-07-27

typecheck 14/14 Â· lint 14/14 Â· unit 64 Â· build 10/10 Â· **Playwright 138 passed, 0 failed, 2
legitimate skips** (admin holds every grant; customer has no gated item). The three tests left
deliberately red last session are green and **none was weakened** to get there.

## T-0027 DONE â€” navigation is now workspace x role. Phase 5 unblocked.

`07.txt` **part 2** Â§46-Â§49 gives four DISTINCT navigation trees inside the single `workshop`
workspace. They are not filtered views of Â§34: the spec groups and labels the same work differently
per role (the owner's "Repair Requests" is the manager's "Repair Request Inbox"; "MY JOBS" and
"TECHNICAL TOOLS" exist for the technician alone). Â§50 names EIGHT roles but gives trees for four â€”
supervisor, storekeeper, quality-control and cashier fall back to the workspace default, which is what
the spec provides.

**Design, and why:** `workspaceForRole()` returns a `Workspace` with the role's groups swapped in, so
the shell, `breadcrumbsFor`, the catch-all router and the journey tests all keep taking the type they
already took. Threading a `role` parameter through each would have created a SECOND place where "which
tree is this viewer on" gets decided â€” and this repo already shipped that bug for grants, where the nav
advertised routes the router 404'd. **`viewerRole()` is the single decision point**, called by both
`WorkspaceShell` and `renderModulePage`. Role selects the tree; permissions still filter it.

**Verified live, not just built:** the workshop app renders Â§49 exactly (Home Â· My Jobs Â· Technical
Tools Â· Plan Work Â· Record Work Â· Testing Â· Learning). `/my-jobs/inspection-required` -> 200,
`/technical-tools/fault-code-search` -> 200, and the Â§34-only `/workshop-floor/repair-staging` -> **404**.
The menu and the router moved together, which is the entire property at stake.

**Codex found two real defects, both confirmed and fixed:**
1. `workspaceForRole` kept `roleGroups` on its result, so re-applying it with a different role fell
   back to the FIRST role's tree â€” a supervisor would have got the technician's navigation under their
   own name. Fixed by dropping the field: a resolved view has no business carrying the menu of
   alternatives it was chosen from.
2. `/home/dashboard` is a concrete route that bypasses the catch-all, and its header still said
   "Workshop Dashboard" while the technician nav called it "Technician Dashboard". Now derived.

**The Supervisor pass found a third**, in the area Codex was asked about and skipped: a role tree could
silently drop a permission during transcription â€” `07.txt` prints "Invoices" as plain text, the trees
are hand-transcribed per role, and every existing test would stay green because the item is *supposed*
to be there. Guard added.

**One finding was correctly REJECTED.** That guard's first run flagged
`reception: /vehicle-intake/issue-intake-receipt`. Â§48's "Issue Intake Receipt" is proof the workshop
took custody of the vehicle, not a payment receipt â€” gating it would have hidden a core reception
function from reception staff to satisfy a regex. Handled as a named exception with its reason, plus a
test that the exception still refers to a live item.

**Skips rose 2 -> 3:** `workshop` no longer exercises the gated-URL test, because Â§49's technician tree
legitimately has no permission-gated item. Five workspaces still do, and
`at least one workspace must exercise permission gating` enforces it never reaches zero.

Records: `reviews/supervisor-adjudication-t0027-workspace-role.md`.

**Gates:** typecheck 14/14 Â· lint 14/14 Â· **unit 79** Â· build 10/10 Â· **Playwright 137 passed, 0
failed, 3 legitimate skips**.

## T-0003 DONE â€” identity services. Next blocker is T-0005, not more services.

The tables already existed (migration 001). This was the SERVICES: `BranchService`, `UserService`,
`MembershipService` + controllers, on the `OrganizationService` pattern so a REST controller and an
MCP tool are thin callers of one service. Eight routes live under `/api/v1`; every one returns **401**
unauthenticated, on a forged token, and on the privilege-granting POST.

### The defect class this task is really about

**`identity.users` has NO `tenant_id` and NO row-level security** â€” deliberately, because one human
may hold memberships in several tenants. So unlike everywhere else in this schema, **RLS will not
save you here**: a plain `SELECT * FROM identity.users` inside `withTenant` returns every user on the
platform and no policy stops it. It type-checks and reads naturally.

Every `UserService` query therefore starts `FROM identity.memberships` (which IS under FORCE RLS) and
joins outward. **The join is the security control**, and `identity.spec.ts` asserts the query SHAPE
because nothing downstream would notice the property being violated.

### Three defects found, all fixed

1. **HIGH â€” a foreign key cannot carry a tenant predicate.** The FKs reference
   `organizations(id)`/`branches(id)` by id alone, and RLS `WITH CHECK` validates the tenant of the
   INSERTED row, never the tenant of the row it points at. So `tenant_id = A` +
   `organization_id = <org in tenant B>` satisfied both. On the privilege-granting operation. Fixed by
   looking the parent up through the RLS-protected table first: a foreign organization is invisible
   there, so the check IS the isolation. Branch-belongs-to-organization checked too.
2. **The same hole in `BranchService`**, which Codex never saw because it was outside the file it
   focused on. Found by asking "where else does this shape appear?".
3. **MEDIUM â€” `withdraw`'s status was never validated at runtime.** The union type is erased and the
   controller forwards the body verbatim, so `{"status":"active"}` passed the DB CHECK: a withdrawal
   that changed nothing but still audited `membership.active`. **Fixed in the SERVICE, not the
   controller** â€” an MCP tool calls the service directly, so a rule at the HTTP edge does not bind
   agents.

### Reviewer note â€” Codex's best pass yet

First time it answered every question it was asked AND emitted the required `VERDICT` line
(`CHANGES REQUIRED`). Two of its three findings this pass had already been found independently by the
Supervisor; **the third had not, and would have shipped.** The standing rule to run the Supervisor
independently still holds â€” it now cuts both ways.

### Operational warning

The API on :4000 had been running since **2026-07-26 05:09**, serving a build older than every
controller in this change â€” the same stale-server condition that produced the T-0030 phantom, in a
service the build-freshness gate does NOT cover (it watches the seven Next apps only). **A long-lived
`node dist/main.js` is exactly as dangerous as a long-lived `next start`.** Restart it after every
`nest build`.

**Gates:** typecheck 14/14 Â· lint 14/14 Â· **unit 98** (api 39) Â· `nest build` clean Â· 8 routes live,
all failing closed.

**NOT done, and not claimed:** the web apps are still not session-wired, so `viewerGrants()` and
`viewerRole()` keep their demo bodies. Replacing them is **T-0005**, not more identity services.

## T-0005 STARTED â€” API side done, Next side NOT. Resume exactly here.

`viewerGrants()`/`viewerRole()` cannot stop being demo data until something can
answer "what may this viewer see?" from a real role. **Nothing could**: the navigation gates on
`finance.read`, `organization.admin` and `platform.admin`, and no code anywhere mapped a role to any
of them. So T-0004's matrix was built first, because T-0005 is blocked on it in practice.

**Landed:**
- `apps/api/src/authz/permission-matrix.ts` â€” all 13 grantable roles â†’ the 3 keys the nav gates on,
  each entry traced to `07.txt` pt2 Â§50, `01 (1).txt` Â§29 or Â§32. Deliberately small; new keys arrive
  with the modules that gate on them.
- **`GET /api/v1/me`** â€” userId, displayName, tenantId, organizationId, branchId, activeRole,
  `permissions[]`, and `memberships[]` (org + branch names, for T-0016's switchers). Every field
  derived server-side from the validated token plus membership; no request field can influence the
  role or the permission list.

**A real defect the tests caught:** `permissionsForRole('constructor')` returned the `Object`
function, because `ROLE_PERMISSIONS[roleName] ?? []` resolves up the **prototype chain** â€” truthy, so
`??` never fired. `Object.freeze` does not help; it seals own properties and says nothing about
inherited ones. Now `Object.hasOwn`. Same trap applies to any string-keyed lookup in this codebase.

### â–¶ NEXT SLICE â€” the actual remaining work of T-0005

**The seven Next apps have NO session at all.** There is no Auth.js/next-auth dependency anywhere;
`packages/auth` exists but is an EMPTY directory. So:

1. Add Auth.js (next-auth v5) with the **Keycloak provider** into `packages/auth` â€” FOSS, zero cost,
   and named in the approved stack (`05.txt` Â§1 "Keycloak, Auth.js, JWT").
2. Server-side session â†’ access token â†’ call `GET /api/v1/me` â†’ that becomes the body of
   `viewerGrants()` and `viewerRole()`.
3. **The refactor that will bite:** both are SYNC today and `viewerRole()` also feeds
   `workspaceForRole()`. They must become async server-side reads. Known call sites:
   the 7 `layout.tsx`, `renderModulePage`, and â€” watch this one â€”
   `apps/workshop-web/app/home/dashboard/page.tsx` computes `VISIBLE` / `NAV_GROUP_COUNT` /
   `PAGE_TITLE` **at MODULE SCOPE**. Module scope cannot await a per-request session; those must move
   into the component body.
4. `apps/e2e/tests/shell-journey.spec.ts` imports both functions to derive what the nav should
   advertise. Once they need a session, the suite needs a fixture identity â€” do not let this silently
   become untestable.

## IN FLIGHT â€” pick up here

**No feature work is in flight.** See `.claude/CURRENT_TASK.md`.

1. **T-0005 remainder** â€” Auth.js + Keycloak session in the 7 Next apps, then point
   `viewerGrants()`/`viewerRole()` at `GET /api/v1/me`. See the slice notes above, especially the
   syncâ†’async refactor and the module-scope constants. Still the only thing holding T-0016.
2. **T-0023** â€” deliver the backup health alert to a human. Detection done; Windows routes it nowhere.
3. **T-0017** â€” quick-create / tasks / messages / notifications / help panels (Â§9-Â§14).
4. T-0020â€¦T-0022 â€” off-host-only restore drill, MinIO object-lock, `--data-checksums` rebuild.

## Environment

Node 20.19.2 Â· pnpm 9.15.4 (**do not upgrade â€” pnpm 10+/11 require Node â‰¥22.13**) Â· Python 3.14.4 Â·
google-adk 2.2.0 Â· Docker 29.4.3 Â· Ollama 0.24.0 Â· gh CLI at `%USERPROFILE%\bin\gh.exe`.

Local infra: `pnpm infra:up`.
API: `cd apps/api && npx nest build && node dist/main.js` with
`DATABASE_URL=postgresql://autoworkshop_app:change_me_locally@localhost:5432/autoworkshop`.
**Never point the app at the `autoworkshop` superuser** â€” the boot guard refuses it, by design.

Serve a built app to check it: `cd apps/workshop-web && npx next start -p 3001`.
**Stop it before rebuilding** â€” a running Next server holds a lock on `.next` and the build fails on
Windows with a file-lock error that looks like a code error and is not.

Windows: `kcadm` runs in-container, so `MSYS_NO_PATHCONV=1 docker exec â€¦` is required or Git Bash
rewrites `/opt/keycloak/...` into `C:/Program Files/Git/opt/...`. The local side of `docker cp`
needs the opposite treatment â€” `cygpath -w`.

Codex CLI: `codex exec` **blocks waiting on stdin** unless you redirect `< /dev/null`, and it will
answer a briefing-shaped prompt by acknowledging the role instead of doing the work. Give it an
imperative first line, a diff already written to disk, and closed stdin. Its sandbox rejects
`pnpm`/PowerShell, so it cannot run the tests â€” it reads only.

## Owner directions â€” binding

10. **Use RELATIONSHIPS in databases and schemas** (2026-07-27). Model with real foreign keys and
    joins â€” normalised, referential, no duplicated columns standing in for a relation and no
    denormalised blobs where a table belongs. Already the shape of the identity schema
    (`tenants â†’ organizations â†’ branches â†’ memberships â†’ users`, with `/me` joining across them for
    organisation and branch names rather than copying them). It is binding for every table added from
    here: parts, job cards, quotations, invoices, warranty, fleet, claims, library records.
    âš ï¸ **A foreign key still cannot carry a tenant predicate** â€” see the T-0003 finding. Relationships
    give integrity, RLS gives isolation, and you need both.

1. Name fixed: **AutoWorkshop AI** at `autoworkshop.aiappinvent.com` (Namecheap DNS)
2. **Stop cutting scope** â€” build everything structurally; only licensed content and labelled ML
   corpora stage
3. **Reuse Solar patterns, never entangle** â€” separate repo, DB, Keycloak realm, deploy, secrets, CI.
   **Do not open or run the Solar app.** Patterns are reused from memory and documentation, not by
   launching it.
4. **Zero cost including production** â€” never propose spending; that decision is the owner's alone
5. **Bring-your-own-connection** â€” tenants connect their own device/provider/credentials
6. Zero cost now; commercial infrastructure later, only if going commercial
7. **Solar is the reference â€” always refer to it**
8. **Codex is the reviewer; the Supervisor is the adjudicator.** Codex's findings are verified
   against source before being accepted â€” it is not infallible, and this session's third defect was
   one it missed.
9. **Do not run Google ADK or Stitch without the owner's approval.**

## Open owner decision (nothing to buy)

Where the self-hosted Docker stack should run: an always-free cloud VM, a machine already owned, or
local-only. It runs locally today, so nothing is blocked.

## Machine state

Sleep, hibernate and monitor timeouts are currently **disabled** (owner asked for uninterrupted
running). To restore: `powercfg /change standby-timeout-ac 30`, `hibernate-timeout-ac 180`,
`monitor-timeout-ac 10`.

A NestJS API process from the frozen session (`node dist/main.js`, started 05:09) was left running
deliberately â€” it is a working service and nothing required restarting it.

exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg -n "target document does not exist|DEFAULT_TARGETS|IMPLEMENTATION_LOG" scripts/guardrails/verify_claims.py README.md docs -S' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'git status --short' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg -n "continue        # handled by the path check below|for m in CITE_RE|PATH_RE|citations-only" scripts/guardrails/verify_claims.py' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "rg -n \"unambiguous suffix|for cand in repo_files|get\\(name|return True\" scripts/guardrails/verify_claims.py" in C:\Users\USER\Documents\autoworkshop-ai
 succeeded in 1059ms:
scripts/guardrails/verify_claims.py:48:DEFAULT_TARGETS = [
scripts/guardrails/verify_claims.py:314:    targets = [Path(t) for t in (args.targets or DEFAULT_TARGETS)]
scripts/guardrails/verify_claims.py:321:            f.add("WARN", str(t), "target document does not exist")

 succeeded in 1166ms:
60:# Their citations are still checkable via --citations-only.
78:PATH_RE = re.compile(r"`([A-Za-z0-9_./\-]+\.(?:ts|tsx|js|sh|ps1|sql|py|md|json|yml|yaml|cron|txt))`")
214:        for m in CITE_RE.finditer(line):
218:                continue        # handled by the path check below
233:        for m in PATH_RE.finditer(line):
304:    ap.add_argument("--citations-only", action="store_true",

 succeeded in 1178ms:
?? reviews/codex-review.md

 succeeded in 1201ms:
172:    accept any unambiguous suffix match elsewhere in the repo.
176:        return True
178:    for cand in repo_files.get(name, []):
180:            return True

codex
Findings checklist:

- [ ] **High** — [scripts/guardrails/verify_claims.py](/C:/Users/USER/Documents/autoworkshop-ai/scripts/guardrails/verify_claims.py:218): Missing `file:line` citation targets are skipped with `continue`, and in `--citations-only` mode the later path check never runs.
  **Fix:** fail immediately when `CITE_RE` matches a target path that does not exist.
  **Why:** `scripts/guardrails/README.md` says citations-only is safe for reviews; currently a review can cite a nonexistent file and still pass.

- [ ] **High** — [scripts/guardrails/verify_claims.py](/C:/Users/USER/Documents/autoworkshop-ai/scripts/guardrails/verify_claims.py:69), [scripts/guardrails/verify_claims.py](/C:/Users/USER/Documents/autoworkshop-ai/scripts/guardrails/verify_claims.py:292), [.claude/TASK_QUEUE.md](/C:/Users/USER/Documents/autoworkshop-ai/.claude/TASK_QUEUE.md:9): `complete` is normalized to `done`, so `**code complete ..., GATES PENDING**` is treated as done even though the same row says review and Playwright are not done.
  **Fix:** parse only explicit verdict tokens at the start of the bold status, or add a separate non-done status such as `gates pending`; do not map arbitrary “complete” prose to `done`.
  **Why:** this guardrail exists to prevent stale status claims. Treating “code complete, gates pending” as done can green-light follow-on work prematurely.

- [ ] **Medium** — [scripts/guardrails/verify_claims.py](/C:/Users/USER/Documents/autoworkshop-ai/scripts/guardrails/verify_claims.py:265): task rows with unparseable statuses are silently ignored for status comparison.
  **Fix:** record a WARN/FAIL for any `TASK_QUEUE.md` row whose status cell cannot be parsed, while still counting the task ID as known.
  **Why:** the current fix avoids false “missing task” failures, but it can also create false greens when the queue uses a typo or new status word.

- [ ] **Medium** — [scripts/guardrails/verify_claims.py](/C:/Users/USER/Documents/autoworkshop-ai/scripts/guardrails/verify_claims.py:172), [scripts/guardrails/verify_claims.py](/C:/Users/USER/Documents/autoworkshop-ai/scripts/guardrails/verify_claims.py:178): `resolve_path()` claims it accepts an “unambiguous suffix match,” but the code returns true on the first suffix match without checking ambiguity.
  **Fix:** collect suffix matches and return true only when there is exactly one; warn/fail on multiple matches.
  **Why:** documentation can appear grounded while pointing at an ambiguous path, weakening the review evidence trail.

- [ ] **Low** — [apps/admin-web/next.config.mjs](/C:/Users/USER/Documents/autoworkshop-ai/apps/admin-web/next.config.mjs:15) and the other non-`workshop-web` configs: comments still say “Only the deploy sets `SKIP_BUILD_CHECKS=1`,” while ADR-017 says the other six Next apps have no deployment story yet.
  **Fix:** either scope that comment to `workshop-web` or reword it as “a constrained/deploy build may set...”.
  **Why:** it leaves future operators with a false mental model after removing the worker workaround.

No critical defects found. I could not run `python scripts/guardrails/verify_claims.py` in this sandbox because script execution was rejected by policy, so this is a static review. The removal of `experimental: { cpus: 1, workerThreads: false }` itself matches ADR-017 and looks correct.
tokens used
55,326
