# Current task — resume here

**Written 2026-08-07 (pt2) at SESSION CLOSE. Tip `1ef94de`, pushed, tree clean.**

▶ **Read `.claude/NEXT_SESSION_SCHEDULE.md` FIRST** — it carries the resumption
point (R1: one DNS record blocks all email; R2: Solar's Brevo is dead) and the
numbered issues log I1–I12. This file is the detail behind them.

✅ **NEW THIS SESSION: every user has an in-app notification inbox.** Merged into
the existing `/home/notifications` screen in both apps rather than shipped as a
second nav entry — the route already existed. It needs NO mail provider: `in_app`
rows are delivered the moment they are written, so notifications work today.

## ▶ FIRST COMMAND OF THE SESSION

```bash
bash scripts/start-session.sh
```

### 🔴 HARD POLICY — owner
**Five slices plus issue resolution every session. Never use the scheduler.**
**Codex and the Supervisor only — NO Stitch.** Google ADK is permitted for
Phase 8 only (owner, 2026-08-07 — see the amendment in ADR-018); it is NOT to
be used for the customer value chain, which is deterministic services.

---

## ✅ WHAT IS ACTUALLY LIVE NOW (measured, not assumed)

The whole chain built on 2026-08-06/07 is **deployed**:

| Link | State |
|---|---|
| `apply-migrations` | **056, 057, 058, 059 applied.** 59 total, 0 pending |
| `deploy-api` | deployed; every new endpoint family answers **401, not 404** |
| `deploy-customer-web` | deployed; `/service-and-repairs/request-service` → **200** |
| `Release` (apex) | deployed; the landing carries the owner's button |

⚠️ **FOUR migrations were pending, not two.** 056 and 057 were recorded as
dispatched on 2026-08-06 and had never been applied — so `/plan-work/*` and
`/learning/*` had been deployed against tables that did not exist. Check the
LEDGER (`apply-migrations` with no `confirm`), never the note that says a
workflow was dispatched.

---

## ✅ THE FUNNEL — CLOSED AND MEASURED ON LIVE

🔴 **The Supervisor found the funnel dropped people ANONYMOUS onto the form.**
The apex and customer-web are DIFFERENT HOSTS with separate session cookies
(each app runs its own Auth.js instance), so a visitor signed in on the apex
arrived signed OUT — and the form rendered for them anyway, because `/vehicles`
401s and is swallowed into an empty garage, which looks exactly like a customer
with no cars. They typed the fault, pressed Send, and got "Your session has
ended" **with everything they had typed gone.**

Fixed and verified on live, anonymously:
- The form now **refuses before it is filled in** — 0 `<form>` elements, 0
  inputs, one "Sign in and continue" button.
- `callbackUrl` **keeps the chosen workshop**: measured
  `callbackUrl=%2Fservice-and-repairs%2Frequest-service%3Fworkshop%3Dabc-123`.
- Both landing variants now point at the form (signed out no longer goes to
  `/api/auth/register`, where it was byte-identical to "Create a free account"
  beside it while being gated on a value its own href never read).

⚠️ **Registration is still one click INSIDE Keycloak's login page**, not a
direct link from the landing. That is the accepted shape: it is one press to
the right place and nothing typed can be lost. If the owner wants sign-up to be
the first thing a stranger sees, that is a deliberate change, not a bug.

---

## ▶ THEN: THE CUSTOMER'S OWN THREE REQUESTS — still NONE verified

From `docs/00-project/CUSTOMER_VALUE_CHAIN.md`:
1. Sign in to **view AND add** complaints.
2. **Add / register their own vehicles** — self-service AND agent-driven.
3. **Repair status on every section and card**, not one status page.

⚠️ Customer §33 audits 35/35, but that is MENU COVERAGE — every entry has a
working page. It says nothing about whether these three exist. Check first.

▶ **The next real slice starts here.** The chain is deployed and the funnel
reaches the form; what has NOT been done is **driving it once end to end as a
real customer** — sign in, send a request, watch it arrive at reception, convert
it to a job card. Everything above is measured at the HTTP layer, which proves
the routes exist and refuse correctly. It does not prove a request can be sent.

⚠️ The Request for Service form still does NOT register the vehicle: the
customer describes the car in free text and reception creates the record on
conversion, because `VehicleService.create` needs a structured make id.
Self-service vehicle registration needs a make picker — its own slice.

---

## 🔴 TRAPS CONFIRMED AGAIN 2026-08-07

1. **RENDER CAN FAIL A DEPLOY FOR NO FAULT OF THE BUILD.** `Release`
   31190439026 spent 18 minutes in `update_in_progress` and ended
   `update_failed`; the container had logged `▲ Next.js 15.1.3 / Ready in 791ms`
   on `0.0.0.0:10000` and Render still reported *"Port scan timeout reached, no
   open ports detected"*. The identical image redeployed clean minutes later.
   ▶ **`Diagnose Render deploy`** (new) is how you tell that apart from a real
   failure: it prints the deploy's DURATION, the service EVENTS and the
   container's own LOG LINES. A deploy that dies in seconds could not pull its
   image; one that dies after minutes started a container that never became
   healthy. Those share only the word "failed".
2. 🔴 **A GREEN DEPLOY IS NOT A VISIBLE FEATURE.** The owner's button passed
   typecheck, lint, unit tests, a container smoke test and a Render deploy, and
   could not render for anyone: the variable it reads was set on neither the
   service nor the build. ▶ **Grep the LIVE HTML for the feature's own text.**
3. **`NEXT_PUBLIC_` is a BUILD-time inline**, not a runtime read. A server
   component wanting a deploy-time value must use a plain name — `API_BASE_URL`
   and now `CUSTOMER_WEB_URL` are named on exactly that reasoning.
4. 🔴 **`Release` deploys workshop-web ONLY**; customer-web needs
   `deploy-customer-web.yml` dispatched separately. The form route 404'd on live
   for a day because of this, and the new guard in `point-web-at-keycloak.yml`
   is what caught it.
5. A queued `apply-migrations` checks out master at RUN time.

## 📧 EMAIL — PARKED 2026-08-07, ONE DNS RECORD FROM DONE

**Nothing is broken and nothing is half-applied.** Sign-up works, nobody is
locked out, migration 060 is LOCAL ONLY, the drain cron is DISABLED, and the
live API is untouched by any of this.

### ▶ THE ONLY THING BLOCKING EVERYTHING

**One MX record in Namecheap → Advanced DNS:**

| Type | Host | Value | Priority |
|---|---|---|---|
| MX Record | `send` | `feedback-smtp.us-east-1.amazonses.com` | `10` |

Resend's domain `aiappinvent.com` (id `e05dd15f-be86-4b39-90b9-0831b4da5e97`)
is **DKIM ✅ verified**, SPF-TXT and SPF-MX pending. Until it verifies, Resend
refuses every send: `550 The aiappinvent.com domain is not verified`.

⚠️ There is also a stray TXT at `send` holding `feedback-smtp.us-east-1.amazonses.com`
— an MX value typed into a TXT on 08-07. It probably wants removing, but do NOT
delete it on a guess; re-verify first and see whether Resend still objects.

🔴 **DO NOT TOUCH, EVER, FOR THIS TASK:** Mail Settings, any `@` record, `mail.`,
or `autodiscover.`. The `@` MX rows (`mx1`/`mx2.privateemail.com`, priority 10)
deliver mail to **sales@, admin@ and support@** — three live mailboxes. I
briefly advised switching Mail Settings to Custom MX; **that advice was wrong**
and the owner caught it. Subdomain MX already coexists with Private Email in
this zone (`mail.` and `autodiscover.` both carry MX), so nothing needs changing
to add one at `send`.

### WHAT IS ALREADY DONE AND WAITING

- **7 repo secrets set**: `SMTP_HOST=smtp.resend.com`, `SMTP_PORT=2587`,
  `SMTP_PORT_FOR_KC=2587`, `SMTP_USER=resend`, `SMTP_PASS`, `SMTP_FROM=noreply@aiappinvent.com`,
  `NOTIFICATIONS_DRAIN_TOKEN`.
- **Port 2587 and the credentials are PROVEN** — both failures were *after* a
  successful SMTP login, at the data stage.
- `deploy-api.yml` now writes those vars, so they survive a deploy.
- Resend keys are in `Documents\autoworkshop app\send 33.txt` (send-only) and
  `send 44.txt` (**FULL ACCESS** — the more sensitive one). Not in git.

### ▶ WHEN THE MX IS ADDED, run in this order

1. Confirm DNS: `Resolve-DnsName send.aiappinvent.com -Type MX -Server 8.8.8.8`
2. `POST https://api.resend.com/domains/<id>/verify` with the full-access key, poll to `verified`
3. Send a test over SMTP from `noreply@aiappinvent.com` — that is the real proof
4. **Set Keycloak SMTP** — dry run first; it asks KEYCLOAK ITSELF to send and
   refuses to write if that fails
5. **Set Keycloak email verification** `verify_email=on`
6. Rehearse migration 060 on live, then apply
7. `deploy-api` (carries the SMTP + drain secrets)
8. Manually dispatch **Drain notifications**; only when it returns 200,
   re-enable its `schedule:` block
9. Drive a real password reset end to end

⚠️ Keycloak's own SMTP self-test may STILL fail after all this: the `admin`
account lives in the `master` realm and has no email, and that is where
`testSMTPConnection` sends. Do not read that as the DNS having failed — prove it
with a real password reset instead.

### ▶ THEN: SOLAR — Brevo is DEAD (subscription lapsed)

Owner, 2026-08-07: Brevo has been deactivated, and Solar must move to Resend.
**11 workflows** in `Desktop\solar-pv-designer-lite\.github\workflows` reference
Brevo: `beta-monitor`, `send-beta-invites`, `send-reader-followup`,
`list-beta-readers`, `email-delivery-check`, `daily-digest`, `synthetic-health`,
`agent-triage`, `render-deploy-now`, `render-env-debug`,
`render-rotate-leaked-secrets`.
⚠️ Blocked on the SAME domain verification — Resend will not send until then, so
converting Solar first would swap one dead sender for another.
⚠️ Solar's own SMTP secrets are separate (different repo, ADR-011). The root TXT
still carries `brevo-code:9425bcf9…`; harmless, leave it.

## ✅ EMAIL — SIGN-UP UNBLOCKED, RESET STILL DEAD

Owner, 2026-08-07: *"verification email dont come to the user mail to verify"*,
*"emailing system dont work"*.

**MEASURED** (`Diagnose Keycloak email`, run 31205339529): the live realm had
`verifyEmail: true` and **NO `smtpServer`**. Keycloak demanded a verification it
had no mail server to send — so it did not merely break password reset, **it
blocked SIGN-UP**, step one of the value chain. 1 of 3 accounts was stuck.

**FIXED** (`Set Keycloak email verification`, run 31205692929, read back):
`verifyEmail: false`, and the trapped account released — 0 users unverified, 0
holding `VERIFY_EMAIL`.

⚠️ **THE TRADE-OFF IS REAL:** Keycloak no longer proves a registrant owns the
address they typed. Chosen because the alternative on a realm with no mail server
is not "verified users", it is no users at all. Nothing in the product reads
`emailVerified`. **One dispatch to put back** once SMTP exists — and the workflow
REFUSES to turn it on while `smtpServer` is absent, so the trap cannot be rearmed.

🔴 **PASSWORD RESET IS STILL A DEAD END** and cannot be fixed from here: it needs
real SMTP credentials, and this repo has none (only `KC_BOOTSTRAP_ADMIN_PASSWORD`
and `RENDER_API_KEY`). See the owner action below.

## OPEN — needs the owner
- 🔴 **The owner's live password was committed to a PUBLIC repo** (`a0022ff`
  removed it from the file; **git history still carries it**). **Rotate it in
  Keycloak.** Removing it stopped the spread; only rotation ends it.
- 🔴 **SMTP — the only thing standing between the product and working email.**
  Zero cost: a Brevo free account, then set five secrets on THIS repo:
  ```
  gh secret set SMTP_HOST -b "smtp-relay.brevo.com"   # provider's host
  gh secret set SMTP_PORT -b "2525"                   # NOT 587
  gh secret set SMTP_USER -b "<brevo login>"
  gh secret set SMTP_PASS -b "<brevo SMTP key>"
  gh secret set SMTP_FROM -b "<verified sender address>"
  ```
  🔴 **Render's free tier blocks outbound SMTP on 25, 465 and 587.** Two
  zero-cost providers offer a port that is NOT blocked:

  | | host | port | free | setup |
  |---|---|---|---|---|
  | **Brevo** | `smtp-relay.brevo.com` | **2525** | 300/day | verify ONE sender address, no DNS |
  | **Resend** | `smtp.resend.com` | **2587** (set `SMTP_PORT_FOR_KC=2587`) | 3,000/mo | needs a DNS-verified domain before it sends to anyone but the account owner |

  Brevo is fastest to working; Resend gives better deliverability because domain
  verification is what puts real DKIM/SPF on the mail. Neither is open source —
  but both speak plain SMTP, so the provider is a swappable adapter and nothing
  in the product couples to either (ADR-015).

  🔴 **A SELF-HOSTED OPEN-SOURCE MAIL SERVER CANNOT WORK HERE**, and this is not
  a cost question. Render free gives no static IP and no reverse-DNS (PTR)
  record, and blocks port 25 — Gmail and Yahoo reject or spam mail from such a
  sender. **Mailpit cannot serve as a test target either**: a Render web service
  accepts only HTTP(S) on a single port, so there is no raw TCP ingress for
  Keycloak to deliver SMTP to. Mailpit is for LOCAL development only.

  Then run **Set Keycloak SMTP** — dry run first. It now asks **Keycloak itself**
  to send via `testSMTPConnection`, not the GitHub runner, so a blocked Render
  port is caught before the realm is configured. After that, **Set Keycloak email
  verification** with `verify_email=on` to restore verification.
- `RENDER_API_KEY` still unrotated since 2026-07-27.

## OPEN — Claude can do
- **Playwright has not run since 2026-07-29** — the largest unmeasured surface.
- 059's supplier-visibility checks **SKIP on live**: no `supplier_users` row
  exists to act as. Seed one and re-run the rehearsal.
- Honesty debts: `quotation` and `purchase_order` approval scopes are recorded,
  not enforced.
- 057's tables (`knowledge.diagnostic_trees`, `learning.course_materials`) are
  applied and EMPTY — they need an authoring screen or a seed. Ask which.
