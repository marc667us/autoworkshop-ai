#!/usr/bin/env bash
#
# Scoped, RAG-grounded Codex review (guardrail layer 3) -- stops reviewer drift.
#
# WHY THIS EXISTS
# ---------------
# On 2026-07-26 Codex was asked twice to review four shell files. It was given
# the diff already written to disk, an explicit allow-list, and an instruction
# to ignore every .md file. Both times it drifted onto the Markdown control
# files, reported documentation issues, and answered none of the five code
# questions it was asked. Both real code defects in that change -- a CRITICAL
# false-healthy and a HIGH lock defect -- were found by the Supervisor instead.
#
# The lesson is that scope stated in a prompt is a request, not a constraint.
# A model under-specified on context will wander to whatever it can read. So
# this wrapper makes scope structural:
#
#   1. GROUND IT. Build a context pack by retrieval (rag.py) so the reviewer is
#      reading real spans from real files with file:line provenance, instead of
#      recalling what it thinks the code says. Hallucination usually starts as
#      a context gap.
#   2. FENCE IT. Write the allow-listed sources and the diff into an isolated
#      review directory and point the reviewer at that, so out-of-scope files
#      are not merely discouraged -- they are somewhere else.
#   3. AUDIT IT. After the run, extract every file the reviewer cited and
#      compare against the allow-list. Citations outside scope are reported as
#      DRIFT, and the run is marked untrusted. A guardrail that only asks
#      nicely is the thing that already failed.
#
# It also enforces the two operational facts learned the hard way:
#   - `codex exec` blocks on stdin unless it is redirected from /dev/null.
#   - a multi-line prompt passed as a shell argument arrives truncated; write
#     it to a file and pass "$(cat file)".
#
# USAGE
#   ./scoped-review.sh --scope infrastructure/backup/run-scheduled.sh \
#                      --scope infrastructure/backup/check-backup-health.sh \
#                      --question "can it report success when the job failed?" \
#                      --out reviews/codex-review-backup.md
#
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT" || exit 1

CODEX="${CODEX_BIN:-C:/Users/USER/nodejs/codex.cmd}"
WORK=".guardrails/review"
SCOPES=()
QUESTIONS=()
OUT=""
DIFF_REF=""

while [ $# -gt 0 ]; do
  case "$1" in
    --scope)    SCOPES+=("$2");    shift 2 ;;
    --question) QUESTIONS+=("$2"); shift 2 ;;
    --out)      OUT="$2";          shift 2 ;;
    --diff)     DIFF_REF="$2";     shift 2 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

[ "${#SCOPES[@]}" -gt 0 ] || { echo "at least one --scope is required" >&2; exit 2; }
[ -n "$OUT" ] || OUT="reviews/scoped-review-$(date -u +%Y%m%dT%H%M%SZ).md"

mkdir -p "$WORK" "$(dirname "$OUT")"
rm -rf "${WORK:?}/pack" && mkdir -p "$WORK/pack"

echo "=== scoped review ==="
printf '  scope: %s\n' "${SCOPES[@]}"

# --- 1. verify the scope actually exists before spending a review on it -----
MISSING=0
for s in "${SCOPES[@]}"; do
  [ -e "$s" ] || { echo "  ! scope does not exist: $s" >&2; MISSING=1; }
done
[ "$MISSING" -eq 0 ] || { echo "RESULT: ABORTED - scope refers to missing files" >&2; exit 2; }

# --- 2. build the grounded context pack ------------------------------------
# Rebuild EVERY run. Reusing an existing index would let a review be grounded in
# spans that no longer exist -- stale evidence presented to the reviewer as
# ground truth, which is a worse failure than no evidence at all. The build is
# seconds for this repo; correctness is worth more than the seconds.
echo "  building retrieval index..."
if ! PYTHONIOENCODING=utf-8 python scripts/guardrails/rag.py build > "$WORK/index-build.log" 2>&1; then
  echo "  ! index build FAILED - see $WORK/index-build.log" >&2
  echo "RESULT: ABORTED - cannot ground the review" >&2
  exit 2
fi

PACK_ARGS=()
for s in "${SCOPES[@]}"; do PACK_ARGS+=(--scope "$s"); done
for q in "${QUESTIONS[@]}"; do PACK_ARGS+=(--question "$q"); done
if ! PYTHONIOENCODING=utf-8 python scripts/guardrails/rag.py pack "${PACK_ARGS[@]}" \
      > "$WORK/pack/context.md" 2> "$WORK/pack-errors.log"; then
  echo "  ! retrieval failed - see $WORK/pack-errors.log" >&2
  echo "RESULT: ABORTED - cannot ground the review" >&2
  exit 2
fi
# An empty or near-empty pack means the reviewer would be working from memory,
# which is the condition this whole layer exists to remove. Fail closed.
PACK_LINES=$(wc -l < "$WORK/pack/context.md" | tr -d ' ')
if [ "${PACK_LINES:-0}" -lt 15 ]; then
  echo "  ! context pack is only ${PACK_LINES} lines - retrieval found nothing useful" >&2
  echo "RESULT: ABORTED - refusing to run an ungrounded review" >&2
  exit 2
fi
echo "  context pack: ${PACK_LINES} lines"

# --- 3. the diff under review, written to disk (Codex will not fetch it) ---
if [ -n "$DIFF_REF" ]; then
  git diff "$DIFF_REF" -- "${SCOPES[@]}" > "$WORK/pack/under-review.diff" 2>/dev/null
else
  git diff HEAD -- "${SCOPES[@]}" > "$WORK/pack/under-review.diff" 2>/dev/null
fi
[ -s "$WORK/pack/under-review.diff" ] || echo "(no pending diff - reviewing current file contents)" \
  > "$WORK/pack/under-review.diff"

# --- 4. the prompt, in a file (multi-line arguments arrive truncated) ------
{
  echo "START NOW. Review immediately. Do not ask for anything - everything you need is on disk."
  echo "Use read-only shell commands (cat, rg, sed) to read the files listed below."
  echo
  echo "YOU MAY READ ONLY THESE FILES:"
  printf '  %s\n' "${SCOPES[@]}"
  echo "  $WORK/pack/context.md      (retrieved evidence, with file:line provenance)"
  echo "  $WORK/pack/under-review.diff"
  echo
  echo "Reading anything else - especially any .md documentation, docs/, .claude/ or reviews/ -"
  echo "is OUT OF SCOPE and will be reported as reviewer drift. Documentation is stale by"
  echo "assumption here; the code is the only ground truth."
  echo
  echo "GROUNDING RULE: cite file:line for every claim. If the evidence for a claim is not in"
  echo "the files above, write NOT IN CONTEXT rather than supplying it from memory. An"
  echo "unverifiable finding is worse than no finding, because someone will act on it."
  echo
  if [ "${#QUESTIONS[@]}" -gt 0 ]; then
    echo "ANSWER EACH OF THESE EXPLICITLY - one answer per question, no skipping:"
    n=1; for q in "${QUESTIONS[@]}"; do echo "  Q$n: $q"; n=$((n+1)); done
    echo
  fi
  cat <<'FORMAT'
OUTPUT FORMAT - produce exactly this and nothing else.
For each question, first:
ANSWER Q<n>: <direct answer, with file:line evidence, or NOT IN CONTEXT>

Then for each defect:
FINDING <n>: <one-line title>
SEVERITY: CRITICAL | HIGH | MEDIUM | LOW
FILE:LINE: <exact file and line>
EVIDENCE: <quote the actual line(s) - no paraphrase>
WHY IT FAILS: <the concrete scenario producing a wrong result>
FIX: <specific change>

End with: VERDICT: PASS | PASS WITH CORRECTIONS | FAIL
If a category is clean, say so explicitly rather than inventing filler.
FORMAT
} > "$WORK/pack/prompt.txt"

# --- 5. run it. `< /dev/null` is mandatory: codex exec blocks on stdin. ----
echo "  running codex (read-only sandbox)..."
timeout 560 "$CODEX" exec --skip-git-repo-check "$(cat "$WORK/pack/prompt.txt")" \
  < /dev/null > "$WORK/raw-output.txt" 2>&1
CODEX_RC=$?
[ "$CODEX_RC" -eq 0 ] || echo "  ! codex exited $CODEX_RC (output still captured)"

# --- 6. DRIFT AUDIT: did it review what it was told to review? -------------
#
# Two tiers, because they mean different things:
#
#   EXPLORED - a path appearing anywhere in the transcript, including the output
#              of the reviewer's own `ls`/`rg` commands. Browsing out of scope
#              wastes the budget and is how attention leaks, but it is not by
#              itself a corrupt finding.
#   CITED    - a path appearing in the reviewer's actual conclusions (its
#              FILE:LINE / ANSWER / FINDING lines). A citation outside the
#              allow-list means the conclusions are about the wrong code, which
#              makes the whole review untrusted.
#
# Only CITED drift fails the run. Conflating the two produced 176 "drift" hits
# on the first self-test, most of them directory listings - and a guardrail that
# reports 176 problems when there are 3 is one nobody reads.
#
# Scope matching must be EXACT or a true child path. An earlier version accepted
# any cited path merely CONTAINING an allowed basename, so a review scoped to
# `src/foo.ts` would have silently accepted citations of `docs/foo.ts`. A
# permissive matcher in a drift detector defeats the detector.
in_scope_path() {
  local cited="${1#./}" s norm
  for s in "${SCOPES[@]}"; do
    norm="${s#./}"
    [ "$cited" = "$norm" ] && return 0
    case "$cited" in */"$norm") return 0 ;; esac        # absolute or prefixed form
    if [ -d "$norm" ]; then
      case "$cited" in "$norm"/*) return 0 ;; esac      # inside a directory scope
    fi
  done
  case "$cited" in *context.md|*under-review.diff|*prompt.txt) return 0 ;; esac
  return 1
}

PATH_RE='[A-Za-z0-9_./-]+\.(ts|tsx|js|sh|ps1|sql|py|md|json|yml|yaml|cron)'

# ---------------------------------------------------------------------------
# Isolate the reviewer's FINAL MESSAGE before auditing anything.
#
# The transcript echoes the prompt, which contains the output-format template
# ("ANSWER Q<n>: <direct answer...>"). Auditing the whole transcript counted
# those placeholders as real answers and reported "2/2 answered" for a run that
# answered nothing -- this guardrail committing the precise failure it was
# written to detect. Codex prints its final message after the last "tokens
# used" line; that region, and only that region, is the reviewer's conclusion.
# ---------------------------------------------------------------------------
LAST_MARKER="$(grep -n '^tokens used' "$WORK/raw-output.txt" 2>/dev/null | tail -1 | cut -d: -f1)"
if [ -n "$LAST_MARKER" ]; then
  tail -n "+$((LAST_MARKER + 2))" "$WORK/raw-output.txt" > "$WORK/final-message.txt"
else
  cp "$WORK/raw-output.txt" "$WORK/final-message.txt"
fi
# Strip any surviving template placeholders so they can never count as content.
grep -v '<n>\|<direct answer\|<one-line title\|<exact file and line' \
  "$WORK/final-message.txt" > "$WORK/final-clean.txt" 2>/dev/null || \
  cp "$WORK/final-message.txt" "$WORK/final-clean.txt"

if [ ! -s "$WORK/final-clean.txt" ]; then
  echo "  ! reviewer produced no final message" >&2
fi

# Tier 1: everything the reviewer touched, anywhere in the transcript.
grep -oE "$PATH_RE" "$WORK/raw-output.txt" 2>/dev/null | sort -u > "$WORK/explored.txt" || true
: > "$WORK/explored-drift.txt"
while IFS= read -r p; do
  [ -n "$p" ] || continue
  in_scope_path "$p" || echo "$p" >> "$WORK/explored-drift.txt"
done < "$WORK/explored.txt"
EXPLORED_DRIFT=$(wc -l < "$WORK/explored-drift.txt" | tr -d ' ')

# Tier 2: what it cited in its conclusions. Extracted from the final message
# regardless of whether it obeyed the requested format -- keying off the format
# meant an ignored format produced an empty audit region and a false "no drift".
grep -oE "$PATH_RE" "$WORK/final-clean.txt" 2>/dev/null | sort -u > "$WORK/cited.txt" || true

DRIFT_FILE="$WORK/drift.txt"
: > "$DRIFT_FILE"
while IFS= read -r cited; do
  [ -n "$cited" ] || continue
  in_scope_path "$cited" || echo "$cited" >> "$DRIFT_FILE"
done < "$WORK/cited.txt"

DRIFT_COUNT=$(wc -l < "$DRIFT_FILE" | tr -d ' ')
# Count answers in the cleaned final message only.
#
# NOT `grep -c ... || echo 0`. With zero matches grep -c prints "0" AND exits 1,
# so the fallback fires too and the value becomes "0\n0", which breaks every
# downstream integer test. This session fixed exactly that bug in
# check-backup-health.sh and then reproduced it here within the hour -- the
# idiom is genuinely easy to write by reflex. Capture, then normalise to digits.
ANSWERED="$(grep -c '^ANSWER Q' "$WORK/final-clean.txt" 2>/dev/null || true)"
ANSWERED="$(printf '%s' "$ANSWERED" | tr -dc '0-9')"
[ -n "$ANSWERED" ] || ANSWERED=0
ASKED="${#QUESTIONS[@]}"
# Did it honour the requested output format at all? Reported separately, because
# a reviewer that ignores the format is not necessarily wrong -- but it means
# the structured fields cannot be relied on and a human must read the prose.
FORMAT_OK=1
[ "$ASKED" -gt 0 ] && [ "$ANSWERED" -eq 0 ] && FORMAT_OK=0

# --- 7. write the review record with the audit attached --------------------
{
  echo "# Scoped review - $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo
  echo "**Scope (allow-list):**"
  printf '  - `%s`\n' "${SCOPES[@]}"
  echo
  echo "**Grounding:** retrieval pack of $(wc -l < "$WORK/pack/context.md") lines with file:line provenance."
  echo
  echo "## Drift audit"
  echo
  if [ "$DRIFT_COUNT" -eq 0 ]; then
    echo "**NO CITED DRIFT** - every file cited in the conclusions is inside the allow-list."
  else
    echo "**DRIFT DETECTED - $DRIFT_COUNT out-of-scope file(s) cited in the conclusions.**"
    echo "**Treat this review as untrusted: its conclusions are partly about code it was not asked to review.**"
    echo
    echo '```'
    cat "$DRIFT_FILE"
    echo '```'
  fi
  echo
  echo "Out-of-scope files merely *explored*: $EXPLORED_DRIFT"
  if [ "$EXPLORED_DRIFT" -gt 20 ]; then
    echo
    echo "> The reviewer browsed $EXPLORED_DRIFT files outside its allow-list. That is attention"
    echo "> spent away from the code under review, and it is the leading indicator of the drift"
    echo "> that produced two useless passes on 2026-07-26. Not a failure on its own."
  fi
  echo
  echo "**Questions asked: $ASKED · answered: $ANSWERED**"
  if [ "$ASKED" -gt 0 ] && [ "$ANSWERED" -lt "$ASKED" ]; then
    echo
    echo "> An unanswered question is not a pass. The reviewer skipped $((ASKED - ANSWERED))"
    echo "> of them; those areas remain unreviewed and must be covered by the Supervisor."
  fi
  echo
  echo "## Reviewer conclusions"
  echo
  # The final message ONLY. Embedding the whole transcript produced a 312 KB,
  # 7000-line "review record" that no one would read and that buries the
  # findings under directory listings. The full transcript stays in
  # .guardrails/ (gitignored) for anyone who wants to audit the run.
  echo '```'
  cat "$WORK/final-message.txt"
  echo '```'
  echo
  echo "_Full transcript: \`$WORK/raw-output.txt\` ($(wc -l < "$WORK/raw-output.txt" | tr -d ' ') lines, not committed)._"
} > "$OUT"

echo
echo "  cited drift  : $DRIFT_COUNT out-of-scope citation(s) in conclusions"
echo "  explored     : $EXPLORED_DRIFT out-of-scope file(s) browsed"
echo "  questions    : $ANSWERED/$ASKED answered"
echo "  review record: $OUT"
echo

if [ "$DRIFT_COUNT" -gt 0 ]; then
  echo "RESULT: UNTRUSTED - reviewer drifted outside the allow-list"
  exit 1
fi
if [ "$ASKED" -gt 0 ] && [ "$ANSWERED" -lt "$ASKED" ]; then
  echo "RESULT: INCOMPLETE - $((ASKED - ANSWERED)) question(s) unanswered"
  exit 1
fi
echo "RESULT: REVIEW COMPLETE AND IN SCOPE"
exit 0
