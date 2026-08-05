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
#   · it must be the FIRST `await` inside the route component, so data cannot be
#     fetched first (the component's body, not the file — see
#     `default_export_body` for why that distinction is load-bearing).
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

# app-dir : workspace id — apps gated per ROUTE rather than by one permission.
#
# The workshop workspace cannot be covered by the list above, and that is not an
# omission. `07.txt` pt2 §46-§49 give it four role trees that differ in WHICH
# SCREENS they contain, not in a permission key: §46 owner, §47 manager and §48
# reception all carry Customer Reception, and §49 TECHNICIAN DOES NOT — while
# `technician` and `reception_staff` hold NONE of the three keys in the
# permission matrix. So no `requireWorkspaceAccess(...)` argument distinguishes
# them, and a page written against it would admit the technician.
#
# These pages must instead call `requireNavRoute('<workspace>', '<own path>')`,
# which re-applies the exact resolution `renderModulePage` does — against the
# role-filtered, grant-filtered tree. THE PATH MUST BE THE PAGE'S OWN: a call
# naming a different route gates a different screen and must not pass, which is
# the same strictness the permission form already has.
ROUTE_GATED_APPS=("workshop-web:workshop" "customer-web:customer")

# Strip line and block comments so a mention in prose cannot satisfy the check.
strip_comments() {
  sed -e 's://.*::g' "$1" | tr '\n' '\001' | sed -e 's:/\*[^\*]*\*/::g' | tr '\001' '\n'
}

# The "first await" test must look at the body of the ROUTE COMPONENT, not at
# the whole file.
#
# WHY (found 2026-07-28, and it was a FALSE POSITIVE this guardrail produced
# against correct code). The check originally took the first `await` anywhere in
# the file. But a module may DECLARE a helper containing an await ABOVE the
# component — `workshop-web/app/home/dashboard/page.tsx` declares
# `describeNavigation()` first — and a declaration is not an execution: that
# helper is only CALLED after the gate. The guardrail reported the page ungated
# and the "fix" it implied was to shuffle function declarations around to satisfy
# a lexical scan, which changes nothing about what runs when.
#
# Slicing from `export default` to end of file keeps the property that matters —
# nothing inside the component may be awaited before the gate — while ignoring
# declarations that precede it. A false alarm is not harmless here: it trains the
# reader to work around the guardrail, and a guardrail people route around stops
# being one.
default_export_body() {
  sed -n '/export default/,$p' <<<"$1"
}

# Inline `const ROUTE = '/some/path'` so a page that names its route once and
# uses the constant twice is matched as strictly as one that repeats the literal.
#
# WHY (fixed 2026-08-06). Sixteen correctly-gated pages read:
#
#     const ROUTE = '/home/approvals';
#     await requireNavRoute('workshop', ROUTE);
#     return <ProposalQueueScreen route={ROUTE} />;
#
# which is BETTER code than repeating the string — the gate and the screen
# cannot drift apart — and the guardrail failed every one of them for it. A
# check that penalises the safer shape pushes authors toward the riskier one.
#
# This does NOT weaken the check: the literal is substituted in, so the call
# must still name THIS page's own route. A const holding the wrong path fails
# exactly as a wrong literal does — proven by a self-test case below.
#
# Only route-shaped literals (starting `/`) are inlined, so an unrelated string
# constant cannot accidentally rewrite the body being matched.
inline_route_consts() {
  local body="$1" decl name lit
  while IFS= read -r decl; do
    [ -n "$decl" ] || continue
    name="$(sed -E "s/^[[:space:]]*(export[[:space:]]+)?const[[:space:]]+([A-Za-z_\$][A-Za-z0-9_\$]*).*/\2/" <<<"$decl")"
    lit="$(sed -E "s/^[^=]*=[[:space:]]*['\"](\/[^'\"]*)['\"].*/\1/" <<<"$decl")"
    [ -n "$name" ] && [ -n "$lit" ] || continue
    # `|` as the delimiter, not `/` — the replacement IS a route and is full of
    # slashes, which silently turned this substitution into a syntax error.
    body="$(sed -E "s|\\b${name}\\b|'${lit}'|g" <<<"$body")"
  done < <(grep -E "^[[:space:]]*(export[[:space:]]+)?const[[:space:]]+[A-Za-z_\$][A-Za-z0-9_\$]*[[:space:]]*=[[:space:]]*['\"]/" <<<"$body")
  printf '%s' "$body"
}

# A route that is deliberately reachable without signing in must SAY SO, in the
# file, with the marker below. The public parts marketplace and the VIN funnel
# are the two real cases: both are advertised on the public landing page, and
# gating them on the viewer's navigation would 404 the visitors they exist for.
#
# The marker is read BEFORE comments are stripped, and every exempted file is
# printed at the end of a run. An exemption you can see and grep for is a
# decision; one the script makes silently is a hole.
PUBLIC_MARKER='@public-route'
declare -a PUBLIC_PAGES=()
is_public_page() { grep -qF "$PUBLIC_MARKER" "$1"; }

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
  first_await="$(grep -Eo 'await\s+[A-Za-z_$][A-Za-z0-9_$.]*' <<<"$(default_export_body "$body")" | head -1 || true)"
  if ! grep -Eq 'await\s+requireWorkspaceAccess' <<<"$first_await"; then
    echo "FAIL: $page"
    echo "      the first await is '${first_await}', not requireWorkspaceAccess."
    echo "      Gate BEFORE any data access — otherwise the query runs for a viewer"
    echo "      who is then shown a 404."
    return 1
  fi
  return 0
}

# The route-gated form. Same three properties as check_page — called with THIS
# page's arguments, awaited, and first — but the second argument is the route
# rather than a permission, and it is DERIVED FROM THE FILE'S LOCATION so a page
# cannot satisfy the gate by naming a route it does not serve.
check_page_route() {
  local page="$1" workspace="$2" app_dir="$3"
  local body route first_await
  body="$(inline_route_consts "$(strip_comments "$page")")"

  # apps/workshop-web/app/customer-reception/customers/page.tsx
  #   -> /customer-reception/customers
  route="${page#"$app_dir"}"
  route="${route%/page.*}"
  route="${route%/default.*}"

  # ROUTE GROUPS ARE NOT PATH SEGMENTS. `app/(app)/payments/quotations/page.tsx`
  # serves `/payments/quotations`; the parentheses exist to share a layout and
  # Next strips them from the URL entirely.
  #
  # WHY THIS MATTERS MORE THAN A TIDY-UP (fixed 2026-08-06). Deriving the route
  # literally made this guardrail demand `requireNavRoute('customer',
  # '/(app)/payments/quotations')` — a path that appears in no navigation tree,
  # so satisfying it would have 404'd every one of those pages for every viewer,
  # including entitled ones. The check was therefore not merely noisy: taking its
  # advice would have broken the whole customer workspace. It reported 19 FAILs
  # against correct code and had done since customer-web adopted route groups.
  #
  # A guardrail nobody can act on is one everybody learns to ignore, which is how
  # 121 new pages landed while a Stage-0 gate sat red.
  route="$(sed -E 's:/\([^/)]*\)::g' <<<"$route")"

  # A DETAIL page gates on its PARENT LIST route, so trailing dynamic segments
  # are stripped:
  #   /customers/customer-search/[id]  ->  /customers/customer-search
  #
  # WHY THAT IS THE RIGHT RULE AND NOT A LOOPHOLE. `requireNavRoute` asks
  # whether the viewer's own navigation advertises a path, and a detail route is
  # never advertised — no menu lists one entry per customer. The honest question
  # for `/customers/customer-search/<id>` is "may this viewer see the customer
  # list at all", which is exactly the parent. A viewer refused the list is
  # refused every record reachable from it.
  #
  # It also keeps the gate WHERE THE ROLE DIFFERENCE LIVES: reception reaches
  # customers at `/customers/customer-search` and an owner at
  # `/customers-and-vehicles/customers`, so each detail page sits under its own
  # tree's list and inherits the right answer without a second rule.
  #
  # The record-level check is NOT this. `CustomerService.findById` re-checks the
  # role, the tenant and the organization, and answers 404 for a record in
  # another organisation — so a viewer who guesses an id gets nothing (§8).
  while :; do
    case "${route##*/}" in
      \[*\]) route="${route%/*}" ;;
      *) break ;;
    esac
    [ -n "$route" ] || break
  done

  if ! grep -Eq "requireNavRoute\(\s*['\"]${workspace}['\"]\s*,\s*['\"]${route}['\"]\s*\)" <<<"$body"; then
    echo "FAIL: $page"
    echo "      no call to requireNavRoute('${workspace}', '${route}')"
    echo "      (an import, a comment, or a call naming another route is not a gate)"
    return 1
  fi

  if ! grep -Eq "await\s+requireNavRoute\(" <<<"$body"; then
    echo "FAIL: $page"
    echo "      requireNavRoute() is called but not awaited — execution continues past it"
    return 1
  fi

  first_await="$(grep -Eo 'await\s+[A-Za-z_$][A-Za-z0-9_$.]*' <<<"$(default_export_body "$body")" | head -1 || true)"
  if ! grep -Eq 'await\s+requireNavRoute' <<<"$first_await"; then
    echo "FAIL: $page"
    echo "      the first await is '${first_await}', not requireNavRoute."
    echo "      Gate BEFORE any data access."
    return 1
  fi
  return 0
}

# Shared by both scans: the route entry points that are deliberately exempt.
is_exempt_page() { # is_exempt_page <page> <app_dir>
  case "$1" in
    # The catch-all: already gated by renderModulePage resolving against the
    # grant-FILTERED tree, which is sufficient for it specifically.
    *'[...slug]'*) return 0 ;;
    # Route handlers, not pages; they authenticate per request.
    */api/*) return 0 ;;
    # The root page is a bare redirect() to the dashboard — it renders nothing
    # and reads nothing, so a gate there would only make the redirect fail
    # differently. The dashboard it lands on is itself a page and IS checked.
    "$2/page.tsx") return 0 ;;
    # The sign-in failure screens, and they must NOT be gated. `/auth/error` is
    # reached BY a visitor whose sign-in did not complete — gating it on the
    # viewer's navigation would 404 the one screen that explains why they could
    # not sign in, turning a recoverable Keycloak cold start back into the blank
    # 404 this route was added to replace. The pages themselves say so; see
    # apps/customer-web/app/auth/error/page.tsx.
    #
    # This is an exemption, not a hole: these screens render a message from the
    # error query parameter and read no tenant data whatsoever.
    */auth/error/*|*/auth/signin/*) return 0 ;;
  esac
  return 1
}

scan() {
  local root="$1" failures=0

  for entry in "${ROUTE_GATED_APPS[@]}"; do
    local app="${entry%%:*}" workspace="${entry##*:}"
    local app_dir="${root}/apps/${app}/app"
    [ -d "$app_dir" ] || continue
    while IFS= read -r page; do
      is_exempt_page "$page" "$app_dir" && continue
      if is_public_page "$page"; then PUBLIC_PAGES+=("$page"); continue; fi
      check_page_route "$page" "$workspace" "$app_dir" || failures=$((failures + 1))
    done < <(find "$app_dir" \( -name 'page.tsx' -o -name 'page.jsx' -o -name 'page.js' -o -name 'page.mjs' -o -name 'default.tsx' \) -type f)
  done

  for entry in "${GATED_APPS[@]}"; do
    local app="${entry%%:*}" rest="${entry#*:}"
    local workspace="${rest%%:*}" permission="${rest##*:}"
    local app_dir="${root}/apps/${app}/app"
    [ -d "$app_dir" ] || continue

    while IFS= read -r page; do
      is_exempt_page "$page" "$app_dir" && continue
      if is_public_page "$page"; then PUBLIC_PAGES+=("$page"); continue; fi
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

  # ---- the ROUTE-gated form (workshop-web) --------------------------------
  # Same negative cases, because the same bypasses apply — plus the one that is
  # unique to this form: gating the right workspace but the WRONG ROUTE, which
  # is how a page could be copied to a new folder and keep the old gate.
  run_route_case() { # run_route_case <want> <label>   (fixture on stdin)
    local want="$1" label="$2" tmp got
    tmp="$(mktemp -d)"
    mkdir -p "$tmp/apps/workshop-web/app/customer-reception/customers"
    cat > "$tmp/apps/workshop-web/app/customer-reception/customers/page.tsx"
    if scan "$tmp" >/dev/null 2>&1; then got=pass; else got=fail; fi
    rm -rf "$tmp"
    if [ "$got" = "$want" ]; then
      echo "  ok   - $label ($got)"
    else
      echo "  FAIL - $label: wanted $want, got $got"
      fails=$((fails + 1))
    fi
  }

  run_route_case fail "route: no gate at all" <<'FIXTURE'
export default function P(){return null}
FIXTURE

  run_route_case fail "route: import only, never called" <<'FIXTURE'
import { requireNavRoute } from '@autoworkshop/next-shell';
export default function P(){return null}
FIXTURE

  run_route_case fail "route: mentioned only in a comment" <<'FIXTURE'
// await requireNavRoute('workshop', '/customer-reception/customers')
export default function P(){return null}
FIXTURE

  run_route_case fail "route: gates a DIFFERENT route" <<'FIXTURE'
export default async function P(){ await requireNavRoute('workshop', '/customer-reception/vehicles'); return null }
FIXTURE

  run_route_case fail "route: wrong workspace id" <<'FIXTURE'
export default async function P(){ await requireNavRoute('admin', '/customer-reception/customers'); return null }
FIXTURE

  run_route_case fail "route: called but not awaited" <<'FIXTURE'
export default async function P(){ requireNavRoute('workshop', '/customer-reception/customers'); return null }
FIXTURE

  run_route_case fail "route: gated only AFTER loading data" <<'FIXTURE'
export default async function P(){ const d = await loadCustomers(); await requireNavRoute('workshop', '/customer-reception/customers'); return d }
FIXTURE

  run_route_case fail "route: permission form does not satisfy the route form" <<'FIXTURE'
export default async function P(){ await requireWorkspaceAccess('workshop', 'platform.admin'); return null }
FIXTURE

  run_route_case pass "route: correctly gated before any data access" <<'FIXTURE'
export default async function P(){ await requireNavRoute('workshop', '/customer-reception/customers'); const d = await loadCustomers(); return d }
FIXTURE

  # The FALSE POSITIVE this guardrail produced on 2026-07-28, pinned so it
  # cannot return. A helper DECLARED above the component may contain an await;
  # it does not RUN until the component calls it, which happens after the gate.
  # The old whole-file scan saw `await currentViewer` first and failed correct
  # code — which is how a guardrail teaches people to work around it.
  run_route_case pass "route: await in a helper DECLARED above the component" <<'FIXTURE'
async function describeNavigation(){ const v = await currentViewer('workshop'); return v }
export default async function P(){ await requireNavRoute('workshop', '/customer-reception/customers'); const n = await describeNavigation(); return n }
FIXTURE

  # ---- DYNAMIC detail routes ----------------------------------------------
  # A detail page gates on its PARENT list route, because no navigation lists
  # one entry per record. These pin that rule in both directions.
  run_detail_case() { # run_detail_case <want> <label>   (fixture on stdin)
    local want="$1" label="$2" tmp got
    tmp="$(mktemp -d)"
    mkdir -p "$tmp/apps/workshop-web/app/customers/customer-search/[id]"
    cat > "$tmp/apps/workshop-web/app/customers/customer-search/[id]/page.tsx"
    if scan "$tmp" >/dev/null 2>&1; then got=pass; else got=fail; fi
    rm -rf "$tmp"
    if [ "$got" = "$want" ]; then
      echo "  ok   - $label ($got)"
    else
      echo "  FAIL - $label: wanted $want, got $got"
      fails=$((fails + 1))
    fi
  }

  run_detail_case pass "detail: gated on the PARENT list route" <<'FIXTURE'
export default async function P(){ await requireNavRoute('workshop', '/customers/customer-search'); return null }
FIXTURE

  # The shape that would look right and check nothing: `/…/[id]` is never in any
  # nav tree, so this gate can only ever 404 — including for viewers who are
  # entitled. It must not pass as "gated".
  run_detail_case fail "detail: gated on its own literal [id] path" <<'FIXTURE'
export default async function P(){ await requireNavRoute('workshop', '/customers/customer-search/[id]'); return null }
FIXTURE

  run_detail_case fail "detail: gated on a DIFFERENT tree's list route" <<'FIXTURE'
export default async function P(){ await requireNavRoute('workshop', '/customers-and-vehicles/customers'); return null }
FIXTURE

  run_detail_case fail "detail: no gate at all" <<'FIXTURE'
export default async function P(){ const d = await load(); return d }
FIXTURE

  # ---- ROUTE GROUPS --------------------------------------------------------
  # `app/(app)/payments/quotations/page.tsx` serves `/payments/quotations`.
  # These pin the 2026-08-06 fix in BOTH directions: the honest gate passes, and
  # the literal `(app)` path — which resolves in no navigation tree and could
  # therefore only ever 404 — must still fail. Without the second case the fix
  # could be "simplified" into accepting anything.
  run_group_case() { # run_group_case <want> <label>   (fixture on stdin)
    local want="$1" label="$2" tmp got
    tmp="$(mktemp -d)"
    mkdir -p "$tmp/apps/customer-web/app/(app)/payments/quotations"
    cat > "$tmp/apps/customer-web/app/(app)/payments/quotations/page.tsx"
    if scan "$tmp" >/dev/null 2>&1; then got=pass; else got=fail; fi
    rm -rf "$tmp"
    if [ "$got" = "$want" ]; then
      echo "  ok   - $label ($got)"
    else
      echo "  FAIL - $label: wanted $want, got $got"
      fails=$((fails + 1))
    fi
  }

  run_group_case pass "group: (app) is stripped — gate names the real URL" <<'FIXTURE'
export default async function P(){ await requireNavRoute('customer', '/payments/quotations'); return null }
FIXTURE

  run_group_case fail "group: gated on the literal (app) path, which no nav carries" <<'FIXTURE'
export default async function P(){ await requireNavRoute('customer', '/(app)/payments/quotations'); return null }
FIXTURE

  run_group_case fail "group: still catches a genuinely ungated page" <<'FIXTURE'
export default async function P(){ const d = await load(); return d }
FIXTURE

  # ---- the sign-in failure screens ----------------------------------------
  # Exempt, because they are reached BY someone who could not sign in. An
  # ungated fixture here must PASS — if this case ever starts failing, the
  # exemption has been lost and /auth/error will 404 the people who need it.
  auth_tmp="$(mktemp -d)"
  mkdir -p "$auth_tmp/apps/customer-web/app/auth/error"
  cat > "$auth_tmp/apps/customer-web/app/auth/error/page.tsx" <<'FIXTURE'
export default function P(){ return null }
FIXTURE
  if scan "$auth_tmp" >/dev/null 2>&1; then
    echo "  ok   - auth: /auth/error is exempt and need not be gated (pass)"
  else
    echo "  FAIL - auth: /auth/error must be exempt — gating it 404s the sign-in error"
    fails=$((fails + 1))
  fi
  rm -rf "$auth_tmp"

  # ---- the `const ROUTE` indirection --------------------------------------
  # Accepting it must not become accepting anything. The wrong-route case is the
  # one that matters: if it ever passes, the indirection has turned the whole
  # route check off.
  run_route_case pass "const: route named once via a constant" <<'FIXTURE'
const ROUTE = '/customer-reception/customers';
export default async function P(){ await requireNavRoute('workshop', ROUTE); return <S route={ROUTE}/> }
FIXTURE

  run_route_case fail "const: constant holds a DIFFERENT route" <<'FIXTURE'
const ROUTE = '/customer-reception/vehicles';
export default async function P(){ await requireNavRoute('workshop', ROUTE); return null }
FIXTURE

  run_route_case fail "const: constant is right but the gate is not awaited" <<'FIXTURE'
const ROUTE = '/customer-reception/customers';
export default async function P(){ requireNavRoute('workshop', ROUTE); return null }
FIXTURE

  run_route_case fail "const: constant is right but data is loaded first" <<'FIXTURE'
const ROUTE = '/customer-reception/customers';
export default async function P(){ const d = await load(); await requireNavRoute('workshop', ROUTE); return d }
FIXTURE

  # ---- the deliberately-public marker -------------------------------------
  # Must exempt, and must exempt ONLY on the marker — an ungated page without it
  # still fails. Otherwise the escape hatch becomes the default.
  run_route_case pass "public: marked @public-route is exempt" <<'FIXTURE'
// @public-route — advertised on the public landing; gating it 404s the visitor.
export default async function P(){ const d = await load(); return d }
FIXTURE

  run_route_case fail "public: an ungated page WITHOUT the marker still fails" <<'FIXTURE'
// an ordinary comment that says nothing about being public
export default async function P(){ const d = await load(); return d }
FIXTURE

  if [ "$fails" -gt 0 ]; then
    echo "check-page-gates --self-test: $fails case(s) wrong"; exit 1
  fi
  echo "check-page-gates --self-test: OK (33/33)"
  exit 0
fi

# ---- normal run ------------------------------------------------------------
scan_status=0
scan "$REPO_ROOT" || scan_status=$?

# Always print the exemptions, pass or fail. A page that opted out of the gate is
# the most interesting thing this script knows; burying it would make the marker
# a quiet bypass rather than a declaration.
if [ "${#PUBLIC_PAGES[@]}" -gt 0 ]; then
  echo ""
  echo "deliberately public (${PUBLIC_MARKER}) — reachable without signing in:"
  for p in "${PUBLIC_PAGES[@]}"; do
    echo "  ${p#"$REPO_ROOT"/}"
  done
fi

if [ "$scan_status" -ne 0 ]; then
  echo ""
  echo "check-page-gates: ungated page(s). See packages/next-shell/src/require-access.ts."
  exit 1
fi
echo ""
echo "check-page-gates: OK — every concrete page in a gated workspace is gated before any data access"
