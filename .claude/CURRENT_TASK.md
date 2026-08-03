# Current task

## ▶ NEXT SESSION STARTS HERE — two steps, then the app is genuinely usable live

The live site now has a **working sign-in** (see the credentials block in
`NEXT_SESSION_START_HERE.md`). What it does NOT have is data or an API, so every
screen renders its "connection problem" state. Two steps close that:

### 1. Deploy the API service to Render  ← START HERE

Nothing in the repo deploys it yet. `provision-render-service.yml` exists and is
the closest starting point; `deploy-keycloak.yml` is the WORKED EXAMPLE of the
shape that now demonstrably works end to end (build image → push GHCR → create
or update the Render service → poll the deploy → **read the result back over the
public URL**).

The API needs, at minimum:
`DATABASE_URL` (internal Render connection string), `KEYCLOAK_URL=https://autoworkshop-keycloak.onrender.com`,
`KEYCLOAK_REALM=autoworkshop`, `KEYCLOAK_AUDIENCE`, and the boot guard REFUSES a
superuser DSN by design — use the app role, not `autoworkshop`.

Then set the web service's `API_BASE_URL` to the API's URL with
`point-web-at-keycloak.yml` (it merges rather than replaces — see below).

### 2. Seed the live workshop

The realm has two accounts but Postgres has **no tenant, no organisation and no
membership**, so `resolveTenantContext` cannot place the signed-in user. Until
then `/me` cannot answer and every screen shows the connection state — which is
exactly what the owner is seeing.

⚠️ `scripts/seed-dev-identity.sh` and `seed-dev-core.sh` are LOCAL-ONLY (they
`docker exec` into `aw-postgres`). A live seed needs the same SQL driven through
the `apply-migrations.yml` connection path — the IP-allow-list dance is already
solved there, including the ephemeral `/32` restored in an `if: always()` step.

🔴 **The membership must match the Keycloak user's subject**, not an email
string. Get the `sub` from the realm (`/admin/realms/autoworkshop/users`) and use
it as `identity.users.id`, or the join in `UserService` will find nothing while
every row looks correct.

## Then

3. **"Add staff" has no screen to link to.** The nav advertises `staff` and
   `technicians`; no page exists in workshop-web and the membership API has no
   UI. Its own slice — a list plus an add-member form on the existing
   `MembershipService`. Requested by the owner this session.
4. More menu entries → real screens. `node scripts/audit-menu-coverage.mjs --all`.
5. Mobile: offline queue, camera capture, push — all still empty.
6. Evidence upload: `POST /evidence/upload-url` + `storage_key` wiring + UI.
7. Repo-wide RLS org-scoping — PLAN BEFORE CODE.

---

## ✅ DONE 2026-08-02/03 — this session

### A. The web job-card DETAIL screen (`01a2221`)

One screen, **four** `[id]` routes, and the job number is a LINK on every queue
and both lists. Verified in a browser as four identities: **52/52**.

🔴 **THE SHAPE THAT MATTERS: THE HREF IS PER-ROLE.** The five trees disagree
about where job cards live, and `requireNavRoute` 404s a route the viewer's tree
does not carry:

| tree | job-card list route | why |
|---|---|---|
| §34 default + §47 manager | `/workshop-floor/job-cards` | as before |
| §46 owner | `/workshop-operations/job-cards` | filed under Operations |
| §49 technician | `/home/my-assigned-work` | **has NO job-cards route** |
| §48 reception | `/home/my-tasks` | **has no job-card LIST** — the queue is it |

`app/_screens/job-card-detail-href.ts` + a spec that resolves the REAL navigation
model. **Never hardcode a job-card href** — use `jobCardDetailHrefFor(role, id)`.

### B. "Add customer" / "Register vehicle" buttons (`386ac55`)

Same lesson, generalised. `quickCreateHref(workspace, slug)` in
`packages/next-shell` resolves the target out of the viewer's OWN visible
navigation using the same three functions as `requireNavRoute`, so button and
gate cannot disagree. Returns null → no button. **It respects permissions too:**
the §34 tree gates `register-customer` on `organization.admin`, so a viewer
without it would have got a button straight to a 404.
12 unit tests + `verify-quick-create-buttons.mjs` **11/11** across three roles.

### C. KEYCLOAK IS DEPLOYED TO RENDER — and three bugs stood in the way

`https://autoworkshop-keycloak.onrender.com` · realm `autoworkshop`. It did not
exist before this session.

1. 🔴 **`801eef8` — the JVM refused to start.** `JAVA_OPTS_APPEND` added
   `-XX:+UseSerialGC` while Keycloak's entrypoint already sets `-XX:+UseG1GC`.
   APPEND means both: *"Multiple garbage collectors selected"* is **fatal**, not
   last-one-wins. Keycloak would have died on every boot. Fixed with
   `-XX:-UseG1GC` in front, verified by reading the flags back
   (`UseG1GC=false, UseSerialGC=true`), not by trusting the setting.
2. 🔴 **`9a5fc05` — the deploy's password generator broke its own pipe.**
   `tr -dc … | head -c 40` → `tr` takes SIGPIPE → `pipefail` fails the step.
   **No dry run could ever have caught it**: the whole step is
   `if: confirm == 'APPLY'`, so it had never executed. Now `secrets.choice`.
3. 🔴 **`17ac00b` — `KeyError: 'ownerId'`.** Render nests the owner as
   `owner.id` on some responses and omits it on others. Now tries both, falls
   back to `/v1/owners`, and prints the KEY NAMES present when it cannot find it.

### D. The live web service points at Keycloak (`f3386ec`)

New `point-web-at-keycloak.yml`. 🔴 **Render's env endpoint is a whole-set PUT,
not a PATCH** — sending only the changed keys DELETES the rest, including
`AUTH_SECRET`. It GETs, merges, PUTs the union, refuses if the read was empty or
the merge shrank, and asserts on read-back that `AUTH_SECRET` survived.

### E. `d71b964` — `KC_PROXY_HEADERS: xforwarded` on the local Keycloak

Behind any HTTPS proxy, `start-dev` minted `http://` as the issuer while the app
knew `https://` — every token rejected, and the symptom is the confusing one:
**"Sign out" AND "Not signed in" rendered together**. Verified in BOTH
directions (tunnel → https, plain LAN → unchanged).

---

## 🔴 Lessons this session paid for — do not relearn

- **A verification that lies is worse than no verification.** Mine lied twice
  before it was right: it called two CORRECT empty states "still plain text"
  (reception lands on *Alpha Parts Supply*, which owns no job cards), then
  reported two rendered pages as not rendered because `body.textContent()`
  includes the inline `<style>` block and a loose `/404/` test matched **a hex
  colour**. **Assert on `main`, never `body`. Prove rows exist before judging a
  link.**
- **An assertion whose subject can empty itself fails for the wrong reason.**
  The owner's leg drove a queue that step 7 of the same script deliberately
  empties.
- **A step gated on `confirm == APPLY` has never run.** "Built and validated"
  meant its first real execution died on its first command.
- **Codex found a reachable falsehood I would have shipped:** the detail screen
  branched on `closed` first and said "this job is closed, so it has no next
  stage" while the API offered `warranty_follow_up` — hiding a real action.
  **Branch on the data; let a flag choose only the WORDS.**
- **A comment claiming a rule the code does not have** — fourth instance. Mine
  said `viewerRole()` returns undefined for four roles; it does not, they map to
  real `RoleId`s and reach the default tree by a different door.
