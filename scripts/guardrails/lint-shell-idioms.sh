#!/usr/bin/env bash
#
# Shell idiom lint (guardrail layer 4) -- bans constructs that fail silently.
#
# Every rule here exists because the idiom actually shipped a defect in this
# repository, not because a style guide dislikes it. The rules are narrow on
# purpose: a lint that fires on safe code gets disabled, and then it protects
# nothing.
#
set -uo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)" || exit 1

FAILED=0
report() { printf '  %-8s %s\n' "$1" "$2"; }
show()   { while IFS= read -r l; do [ -n "$l" ] && printf '           %s\n' "$l"; done; }

# Match code, never comments. Documenting a banned idiom -- which every rule
# below does at length -- must not trip the rule that bans it, or the lint
# fails on its own explanation and gets switched off.
scan() {
  local pattern="$1" f
  for f in $TARGETS; do
    grep -nE "$pattern" "$f" 2>/dev/null | while IFS= read -r hit; do
      # strip "NN:" then test whether the code begins with a comment marker
      local body="${hit#*:}"
      case "$(printf '%s' "$body" | sed 's/^[[:space:]]*//')" in
        \#*) continue ;;
      esac
      printf '%s:%s\n' "$f" "$hit"
    done
  done
}

TARGETS="$(git ls-files '*.sh' 2>/dev/null | grep -v node_modules || true)"
[ -n "$TARGETS" ] || { echo "no shell files tracked"; exit 0; }

echo "=== shell idiom lint ==="

# --- Rule 1: `grep -c ... || echo 0` -------------------------------------
# grep -c prints "0" and exits 1 when there are no matches, so the fallback
# ALSO fires and the value becomes the two-line string "0\n0". Every integer
# test on it then errors and takes the wrong branch. This shipped a CRITICAL
# false-healthy in check-backup-health.sh (the off-host backup count reported
# OK when there were zero backups) and was then reproduced in scoped-review.sh
# within the same session.
HITS="$(scan 'grep +-c[^|]*\|\| *echo')"
if [ -n "$HITS" ]; then
  report FAIL "\`grep -c ... || echo N\` produces \"N\\nN\" on zero matches:"
  printf '%s\n' "$HITS" | show
  echo "           fix: capture output, then \`tr -dc '0-9'\`"
  FAILED=1
else
  report OK "no \`grep -c ... || echo\` fallbacks"
fi

# --- Rule 2: `[ -s file ]` as a proof of content -------------------------
# openssl writes a 16-byte salt header before failing, so a totally empty
# encrypted backup passes `-s`. Caught during the C3 backup review; the fix
# was per-artefact size floors.
HITS="$(scan '\[ +-s +"?\$\{?[A-Za-z_]' | grep -iv 'assert_plausible' || true)"
if [ -n "$HITS" ]; then
  report WARN "\`[ -s FILE ]\` proves non-empty, not plausible (a 16-byte header passes):"
  printf '%s\n' "$HITS" | show
else
  report OK "no bare \`[ -s FILE ]\` content proofs"
fi

# --- Rule 3: docker exec with a heredoc but no -i -------------------------
# `docker exec` without -i silently discards heredoc stdin: psql exits 0 having
# done nothing. Cost one failed restore drill.
HITS="$(scan 'docker +exec +(-[a-zA-Z]+ +)*[a-z]' | grep -E '<<' | grep -v ' -i' || true)"
if [ -n "$HITS" ]; then
  report FAIL "\`docker exec\` with a heredoc needs -i or stdin is discarded silently:"
  printf '%s\n' "$HITS" | show
  FAILED=1
else
  report OK "no heredoc \`docker exec\` missing -i"
fi

echo
if [ "$FAILED" -ne 0 ]; then
  echo "RESULT: FAIL"
  exit 1
fi
echo "RESULT: PASS"
exit 0
