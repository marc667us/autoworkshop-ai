#!/usr/bin/env bash
#
# Every CONCRETE page in a permission-gated workspace must call
# `requireWorkspaceAccess()` with the right arguments, before it touches
# anything. T-0005 finding 4.
#
# WHY THIS IS A BUILD GATE AND NOT A NOTE IN A DOC. Finding 4 was exactly the
# failure of a rule to remember: the admin workspace was protected only by
# `renderModulePage()` resolving routes against the grant-filtered navigation
# tree, which works for as long as every route goes through `app/[...slug]`.
# Next resolves a concrete `app/<group>/<item>/page.tsx` AHEAD of the catch-all,
# so the first real screen built in that app would have had no gate at all — and
# nothing would have said so.
#
# The layout gate in `app/layout.tsx` is NOT a substitute, and that was measured
# rather than assumed. A probe page requested by a signed-out visitor on a fresh
# build: the DOM showed only the denial, but the page's server component EXECUTED
# and its rendered output was shipped in the RSC flight payload. A layout gate
# hides; it does not stop a page querying a database or emitting a customer's
# name into a response. See packages/next-shell/src/require-access.ts.
#
# ⚠️ WHY THE MATCHING IS STRICT (Codex review of a7d2fa5, accepted). The first
# version of this script tested `grep -q requireWorkspaceAccess`. That matches
# the IMPORT LINE. A page could import the function and never call it, call it
# with another workspace's id, ask for a permission it already holds, mention it
# in a comment, or call it AFTER loading data — and pass. A guardrail that can be
# satisfied without doing the thing is worse than no guardrail, because the gate
# then reports green over exactly the exposure it exists to stop. So:
#
#   · comments are stripped before matching, so a mention cannot satisfy it;
#   · the call must carry THIS app's workspace id and required permission;
#   · it must be the FIRST `await` in the file, so data cannot be fetched first.
#
# Run `--self-test` to prove it still fails on each of those shapes.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# app-dir : workspace id : required permission
# `packages/navigation` is the authority for which workspaces are gated in full.
# `admin` is the only one today (`02.txt` §32 — "visible only to" platform
# administrators). Add a row when another workspace becomes wholly gated; a
# per-group gate is the page's own business.
GATED_APPS=("admin-web:admin:platform.admin")

# Strip line and block comments so a mention in prose cannot satisfy the check.
strip_comments() {
  sed -e 's://.*::g' "$1" | tr '\n' '\001' | sed -e 's:/\*[^\*]*\*/::g' | tr '\001' '\n'
}

# Returns 0 when the page is properly gated.
check_page() {
  local page="$1" workspace="$2" permission="$3"
  local body first_await
  body="$(strip_comments "$page")"

  # The call, with THIS app's arguments. Quote style is free; whitespace is not
  # significant. A call naming another workspace or another permission is not a
  # gate for this page and must not pass.
  if ! grep -Eq "requireWorkspaceAccess\(\s*['\"]${workspace}['\"]\s*,\s*['\"]${permission}['\"]\s*\)" <<<"$body"; then
    echo "FAIL: $page"
    echo "      no call to requireWorkspaceAccess('${workspace}', '${permission}')"
    echo "      (an import, a comment, or a call with different arguments is not a gate)"
    return 1
  fi

  # It must be AWAITED — an un-awaited call returns a promise and execution
  # continues straight past it into the page body.
  if ! grep -Eq "await\s+requireWorkspaceAccess\(" <<<"$body"; then
    echo "FAIL: $page"
    echo "      requireWorkspaceAccess() is called but not awaited — execution continues past it"
    return 1
  fi

  # And it must be the FIRST await in the file, so nothing is loaded before the
  # viewer has been checked. This is the "call it after fetching the data" shape.
  first_await="$(grep -Eo 'await\s+[A-Za-z_$][A-Za-z0-9_$.]*' <<<"$body" | head -1 || true)"
  if ! grep -Eq 'await\s+requireWorkspaceAccess' <<<"$first_await"; then
    echo "FAIL: $page"
    echo "      the first await is '${first_await}', not requireWorkspaceAccess."
    echo "      Gate BEFORE any data access — otherwise the query runs for a viewer"
    echo "      who is then shown a 404."
    return 1
  fi
  return 0
}

scan() {
  local root="$1" failures=0
  for entry in "${GATED_APPS[@]}"; do
    local app="${entry%%:*}" rest="${entry#*:}"
    local workspace="${rest%%:*}" permission="${rest##*:}"
    local app_dir="${root}/apps/${app}/app"
    [ -d "$app_dir" ] || continue

    while IFS= read -r page; do
      case "$page" in
        # The catch-all: already gated by renderModulePage resolving against the
        # grant-FILTERED tree, which is sufficient for it specifically.
        *'[...slug]'*) continue ;;
        # Route handlers, not pages; they authenticate per request.
        */api/*) continue ;;
        # The root page is a bare redirect() to the dashboard — it renders
        # nothing and reads nothing, so a gate there would only make the
        # redirect fail differently. The dashboard it lands on is itself a page
        # and IS checked.
        "$app_dir/page.tsx") continue ;;
      esac
      check_page "$page" "$workspace" "$permission" || failures=$((failures + 1))
      # Next also resolves default/template as route entry points.
    done < <(find "$app_dir" \( -name 'page.tsx' -o -name 'page.jsx' -o -name 'page.js' -o -name 'page.mjs' -o -name 'default.tsx' \) -type f)
  done
  return "$failures"
}

# ---- self-test -------------------------------------------------------------
# Codex asked for negative cases. They live here rather than in a doc so that a
# future "simplification" of the matching above fails loudly.
if [ "${1:-}" = "--self-test" ]; then
  fails=0

  # ONE FRESH TEMP TREE PER CASE. Sharing a single directory across cases looked
  # tidier and was not: `scan` reads from a process substitution, and the
  # subshell that creates interacted badly with cleanup, so a later fixture could
  # not be written and the run failed pointing at a line that was correct.
  # Per-case isolation removes the shared state that made that possible at all.
  run_case() { # run_case <want: pass|fail> <label>   (fixture on stdin)
    local want="$1" label="$2" tmp got
    tmp="$(mktemp -d)"
    mkdir -p "$tmp/apps/admin-web/app/directory/users"
    cat > "$tmp/apps/admin-web/app/directory/users/page.tsx"
    if scan "$tmp" >/dev/null 2>&1; then got=pass; else got=fail; fi
    rm -rf "$tmp"
    if [ "$got" = "$want" ]; then
      echo "  ok   - $label ($got)"
    else
      echo "  FAIL - $label: wanted $want, got $got"
      fails=$((fails + 1))
    fi
  }

  run_case fail "no gate at all" <<'FIXTURE'
export default function P(){return null}
FIXTURE

  run_case fail "import only, never called" <<'FIXTURE'
import { requireWorkspaceAccess } from '@autoworkshop/next-shell';
export default function P(){return null}
FIXTURE

  run_case fail "mentioned only in a comment" <<'FIXTURE'
// await requireWorkspaceAccess('admin', 'platform.admin')
export default function P(){return null}
FIXTURE

  run_case fail "wrong workspace id" <<'FIXTURE'
export default async function P(){ await requireWorkspaceAccess('workshop', 'platform.admin'); return null }
FIXTURE

  run_case fail "wrong permission" <<'FIXTURE'
export default async function P(){ await requireWorkspaceAccess('admin', 'finance.read'); return null }
FIXTURE

  run_case fail "called but not awaited" <<'FIXTURE'
export default async function P(){ requireWorkspaceAccess('admin', 'platform.admin'); return null }
FIXTURE

  run_case fail "gated only AFTER loading data" <<'FIXTURE'
export default async function P(){ const d = await loadCustomers(); await requireWorkspaceAccess('admin', 'platform.admin'); return d }
FIXTURE

  run_case pass "correctly gated before any data access" <<'FIXTURE'
export default async function P(){ await requireWorkspaceAccess('admin', 'platform.admin'); const d = await loadCustomers(); return d }
FIXTURE

  # An app tree with no concrete pages at all must pass, not error.
  empty="$(mktemp -d)"
  mkdir -p "$empty/apps/admin-web/app"
  if scan "$empty" >/dev/null 2>&1; then
    echo "  ok   - no concrete pages at all (pass)"
  else
    echo "  FAIL - no concrete pages at all: wanted pass"; fails=$((fails + 1))
  fi
  rm -rf "$empty"

  if [ "$fails" -gt 0 ]; then
    echo "check-page-gates --self-test: $fails case(s) wrong"; exit 1
  fi
  echo "check-page-gates --self-test: OK (9/9)"
  exit 0
fi

# ---- normal run ------------------------------------------------------------
if ! scan "$REPO_ROOT"; then
  echo ""
  echo "check-page-gates: ungated page(s). See packages/next-shell/src/require-access.ts."
  exit 1
fi
echo "check-page-gates: OK — every concrete page in a gated workspace is gated before any data access"
