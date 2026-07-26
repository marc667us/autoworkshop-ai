# Guardrails — against drift and hallucination

Four layers that sit *in front of* the review lane. Everything here is
deterministic: no model, no network, no API key, no judgement call. That is the
point — the reviewers downstream are probabilistic, and a probabilistic checker
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

## Layer 1 — `rag.py`: retrieve, then reason

Zero-dependency BM25 retrieval over the repo and the source specs. Pure standard
library: no embedding service, no vector database, no network, nothing to pay
for, nothing to keep running.

BM25 rather than embeddings is a deliberate choice. Review questions are
dominated by exact identifiers — `grep -c`, `archive_command`, `viewerGrants`,
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

On Windows set `PYTHONIOENCODING=utf-8`, or the cp1252 console mangles `§` and
`—` on output. The index itself is always UTF-8.

## Layer 2 — `verify_claims.py`: documentation has no compiler

Documentation is the only artifact here with no type system, no test and no
build behind it, so unverified assertions accumulate in it silently.

Checks, all mechanical:

1. **Paths** — every repo-relative path referenced in prose exists
2. **Commits** — every cited SHA resolves in this repository
3. **Task IDs** — every `T-####` exists in `TASK_QUEUE.md`
4. **Status** — no document contradicts `TASK_QUEUE.md` about a task's status
5. **Citations** — every `file:line` reference exists and is in range

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
  task id. `"(T-0018). Phase 4 is blocked by…"` describes Phase 4, and
  `"blocked on T-0003"` states a dependency, not a status.

## Layer 3 — `scoped-review.sh`: scope as structure, not as a request

On 2026-07-26 Codex was asked twice to review four shell files. It had the diff
on disk, an explicit allow-list, and an instruction to ignore every `.md` file.
**Both times it drifted onto the Markdown control files and answered none of the
five code questions.** Both real defects in that change — a CRITICAL false-healthy
and a HIGH lock defect — were found by the Supervisor instead.

Scope stated in a prompt is a request. This makes it structural:

1. **Ground it** — build a retrieval pack so the reviewer reads real spans with
   provenance rather than recalling what it thinks the code says.
2. **Fence it** — write the allow-listed sources and the diff into an isolated
   directory and point the reviewer there.
3. **Audit it** — after the run, extract every file cited and compare against the
   allow-list. Out-of-scope citations mark the review **UNTRUSTED**.

```bash
./scripts/guardrails/scoped-review.sh \
  --scope infrastructure/backup/run-scheduled.sh \
  --question "Can it record success when the job failed?" \
  --out reviews/codex-review-backup.md
```

Drift is reported in **two tiers**, because they mean different things:

- **explored** — paths anywhere in the transcript, including the reviewer's own
  `ls` output. Wasted attention; a leading indicator, not a failure.
- **cited** — paths in the reviewer's conclusions. These make the review
  untrusted, and they fail the run.

The first version conflated them and reported 176 "drift" hits when there were
about 3. A guardrail that reports 176 problems when there are 3 is one nobody
reads.

### Two false-greens this tool produced about itself

Recorded because they are the sharpest available illustration of why this layer
exists at all — and because both are the repo's dominant defect class, *the
metric reads healthy while the mechanism is inert*:

1. **"2/2 questions answered"** — the audit matched the output-format template
   echoed back inside the prompt (`ANSWER Q<n>: <direct answer…>`), not any real
   answer. It reported full marks for a run that answered nothing. Fixed by
   auditing only the reviewer's final message and stripping placeholders.
2. **"0 cited drift"** — the audit keyed off the requested output format. Codex
   ignored the format, so the audited region was empty, so drift was zero. Fixed
   by extracting citations from the final message regardless of format.

The run now aborts rather than proceeding ungrounded if the index build fails,
retrieval fails, or the context pack comes back near-empty. **Fail closed: an
ungrounded review is worse than no review, because it carries the same
authority.**

## Layer 4 — `lint-shell-idioms.sh`: constructs that fail silently

Three rules, each from a shipped defect:

1. **`grep -c … || echo 0`** — `grep -c` prints `0` *and exits 1* on no matches,
   so the fallback also fires and the value becomes `"0\n0"`. Every integer test
   on it then errors and takes the wrong branch. This shipped a CRITICAL
   false-healthy in `check-backup-health.sh`: the off-host backup count reported
   `OK` when there were **zero** backups. It was then reproduced in
   `scoped-review.sh` **within the same session** — which is precisely why it is
   a lint rule and not a note in a review.
2. **`[ -s FILE ]` as proof of content** — `openssl` writes a 16-byte salt header
   before failing, so a totally empty encrypted backup passes `-s`.
3. **`docker exec` with a heredoc but no `-i`** — stdin is discarded silently;
   `psql` exits 0 having done nothing. Cost one failed restore drill.

The lint reads code only, never comments — otherwise every rule would trip on its
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
gitignored — generated evidence, not source.

## What these do not do

They do not decide whether code is correct. They constrain *where* a reviewer
looks and *whether* a claim is checkable, which is a narrower job than reviewing
and the reason they can be deterministic.

**The Supervisor still has to read the code.** Every code defect found on
2026-07-26 came from reading it, not from a green gate — and that remains true
with these in place. These layers raise the floor; they do not raise the ceiling.
