#!/usr/bin/env bash
#
# Every CONCRETE page in a permission-gated workspace must call
# `requireWorkspaceAccess()`. T-0005 finding 4.
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
# So: layout gate for the chrome and enumeration, page gate for the data, and
# this script to make the second one impossible to forget.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

# Workspaces whose navigation is gated in full. `packages/navigation` is the
# authority for which those are; `admin` is the only one today (`02.txt` §32 —
# "visible only to" platform administrators). Add a row when another workspace
# becomes wholly gated; a per-group gate is the page's own business.
GATED_APPS=("admin-web")

FAILURES=0

for app in "${GATED_APPS[@]}"; do
  app_dir="apps/${app}/app"
  [ -d "$app_dir" ] || continue

  # Concrete pages only. Excluded, each for a stated reason:
  #   [...slug]  — the catch-all, already gated by renderModulePage's filtered
  #                route resolution, which IS sufficient for it specifically.
  #   api/       — route handlers, not pages; they authenticate per request.
  #   app/page.tsx at the root — a bare redirect() to the dashboard. It renders
  #                nothing and reads nothing, so a gate there would only make the
  #                redirect fail differently.
  while IFS= read -r page; do
    case "$page" in
      *'[...slug]'*) continue ;;
      */api/*) continue ;;
      "$app_dir/page.tsx") continue ;;
    esac

    if ! grep -q 'requireWorkspaceAccess' "$page"; then
      echo "FAIL: $page does not call requireWorkspaceAccess()"
      echo "      A concrete page.tsx is resolved ahead of the catch-all, so it"
      echo "      carries no gate of its own. Add as its FIRST statement, before"
      echo "      any data access:"
      echo "        await requireWorkspaceAccess('<workspace>', '<permission>');"
      FAILURES=$((FAILURES + 1))
    fi
  done < <(find "$app_dir" -name 'page.tsx' -type f)
done

if [ "$FAILURES" -gt 0 ]; then
  echo ""
  echo "check-page-gates: $FAILURES ungated page(s)."
  exit 1
fi

echo "check-page-gates: OK — every concrete page in a gated workspace calls requireWorkspaceAccess()"
