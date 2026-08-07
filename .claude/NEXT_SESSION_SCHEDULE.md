# Next session — start here

**Written 2026-08-07 (pt2) at session close. Tip `1ef94de` on `master`, pushed,
tree clean. CI + Security CI + Release green.**

Owner policy: **five slices + issue resolution every session. Never the
scheduler. Codex and the Supervisor only — no Stitch.** Google ADK is permitted
for **Phase 8 only** (owner, 2026-08-07, ADR-018 amendment).

▶ **FIRST COMMAND:** `bash scripts/start-session.sh`
▶ Then `.claude/CURRENT_TASK.md` (the resume detail), then this file.

---

# ═══ RESUMPTION POINT — read this first ═══

## 🔴 R1. ONE DNS RECORD IS BLOCKING ALL EMAIL, ON BOTH PRODUCTS

Everything else is done, tested and waiting on this single record:

| Type | Host | Value | Priority |
|---|---|---|---|
| MX Record | `send` | `feedback-smtp.us-east-1.amazonses.com` | `10` |

Namecheap → `aiappinvent.com` → Advanced DNS → Add New Record → Save All Changes.

**State:** Resend domain `aiappinvent.com` exists (id
`e05dd15f-be86-4b39-90b9-0831b4da5e97`), **DKIM ✅ verified**, both SPF rows
pending. Every send is refused with
`550 The aiappinvent.com domain is not verified`.

**Already proven — do not re-derive:** port **2587** is reachable and the Resend
credentials are valid; both test failures came AFTER a successful SMTP login, at
the data stage. 7 secrets are set on the repo and `deploy-api.yml` writes them so
a deploy cannot wipe them.

⚠️ There is also a stray TXT at `send` holding
`feedback-smtp.us-east-1.amazonses.com` — an MX value typed into a TXT on 08-07.
It may need removing, but **re-verify first and let Resend tell you**; do not
delete on a guess.

🔴 **NEVER TOUCH, for this task:** Namecheap **Mail Settings**, any `@` record,
`mail.`, or `autodiscover.`. The `@` MX rows (`mx1`/`mx2.privateemail.com`)
deliver mail to **sales@, admin@ and support@** — three live mailboxes. I
advised switching Mail Settings to Custom MX; **that was wrong** and the owner
caught it. The zone scan afterwards showed `mail.` and `autodiscover.` already
carry MX alongside Private Email, so a subdomain MX needs no settings change.

### ▶ WHEN THE MX IS IN, run in this exact order

1. `Resolve-DnsName send.aiappinvent.com -Type MX -Server 8.8.8.8`
2. `POST https://api.resend.com/domains/<id>/verify` with the full-access key
   (`Documents\autoworkshop app\send 44.txt`), poll `GET /domains/<id>` to
   `verified`
3. Send a real SMTP test from `noreply@aiappinvent.com` — **that** is the proof
4. **Set Keycloak SMTP** — dry run first. It asks KEYCLOAK ITSELF to send and
   refuses to write the realm if that fails
5. **Set Keycloak email verification** with `verify_email=on` (it refuses while
   `smtpServer` is absent, by design)
6. **Rehearse Migration On Live** for `060_notifications`, then `apply-migrations`
7. `deploy-api` (carries the SMTP + drain secrets into the service)
8. Dispatch **Drain notifications** manually; ONLY when it returns 200,
   re-enable its `schedule:` block (it is commented out on purpose)
9. Drive a real password reset end to end

⚠️ Keycloak's own SMTP self-test may STILL fail afterwards: the `admin` account
lives in the **master** realm and has no email, and that is where
`testSMTPConnection` sends. Do not read that as the DNS having failed.

## 🔴 R2. SOLAR: BREVO IS DEAD — MOVE IT TO RESEND

Owner, 2026-08-07: the Brevo subscription lapsed and Brevo is deactivated, so
Solar's email is down. **11 workflows** in
`Desktop\solar-pv-designer-lite\.github\workflows` send through Brevo:
`beta-monitor`, `send-beta-invites`, `send-reader-followup`, `list-beta-readers`,
`email-delivery-check`, `daily-digest`, `synthetic-health`, `agent-triage`,
`render-deploy-now`, `render-env-debug`, `render-rotate-leaked-secrets`.

⚠️ **Blocked on R1** — Resend will not send until the domain verifies, so
converting Solar first swaps one dead sender for another.
⚠️ Solar's secrets stay SEPARATE (ADR-011 non-entanglement). Its Keycloak realm
has its own SMTP config (`fix-kc-realm-smtp.yml`).
⚠️ The root TXT still carries `brevo-code:9425bcf9…`. Harmless — leave it.

---

# ═══ LIST 1 — OUTSTANDING ISSUES ═══

| # | Issue | State |
|---|---|---|
| I1 | **Migration 060 is LOCAL ONLY.** Not rehearsed, not applied to live. | blocked on R1 step 6 |
| I2 | **Drain cron disabled** (`schedule:` commented out) so it cannot go red hourly against an API without the feature. | re-enable at R1 step 8 |
| I3 | **Password reset is a dead end** — the page promises an email Keycloak cannot send. | blocked on R1 |
| I4 | **Email verification is OFF** on the live realm. Sign-up works; Keycloak no longer proves a registrant owns the address. | restore at R1 step 5 |
| I5 | 🔴 **The owner's live Keycloak password is in the PUBLIC repo's git history** (`a0022ff` removed it from the file only). **Rotation is the only fix.** | owner only |
| I6 | `RENDER_API_KEY` unrotated since 2026-07-27. | owner only |
| I7 | **Resend keys sit in plain text** — `Documents\autoworkshop app\send 33.txt` (send-only) and `send 44.txt` (**FULL ACCESS**). Not in git. Rotate or delete once email works. | owner |
| I8 | **Playwright has not run since 2026-07-29** — the largest unmeasured surface. | Claude can do |
| I9 | 059's supplier-visibility checks **SKIP on live** — no `supplier_users` row to act as. | Claude can do |
| I10 | Honesty debts: `quotation` and `purchase_order` approval scopes are recorded, not enforced. | Claude can do |
| I11 | 057's tables (`knowledge.diagnostic_trees`, `learning.course_materials`) are applied and EMPTY — need an authoring screen or a seed. | ask the owner which |
| I12 | **Nobody has SENT a real service request end to end.** All proof so far is HTTP-layer. | Claude can do |

---

# ═══ LIST 2 — WHAT SHIPPED 2026-08-07 pt2 ═══

| Commit | |
|---|---|
| `90e2be6` | `Diagnose Render deploy` — Render said `update_failed` and nothing could ask why |
| `10e562a` `05694e7` | The owner's landing button could never render (`NEXT_PUBLIC_` is a BUILD-time inline) |
| `daeb14a` | The registration path did not do what its own comment said |
| `dd2c3cd` | 🔴 The funnel dropped people ANONYMOUS onto the form and lost what they typed |
| `eb7f117` `97044a5` `03f85ec` | **Migration 060 — notifications** (outbox, transports, drain) + Codex and Supervisor fixes |
| `b375080` | `Diagnose Keycloak email` — two causes look identical |
| *(realm)* | **verifyEmail turned OFF on live; the trapped account released** — sign-up unblocked |
| `457bf9a` | Email work parked safely; drain cron disabled |
| `1ef94de` | **The in-app notification inbox** — merged into the existing `/home/notifications` |

Also live earlier today: migrations **056–059 applied** (four were pending, not
two), API + customer-web + apex deployed, `CUSTOMER_WEB_URL` configured.

---

# ═══ TRAPS THAT WILL COST A SESSION ═══

1. 🔴 **A GREEN DEPLOY IS NOT A VISIBLE FEATURE.** Grep the LIVE HTML for the
   feature's own text.
2. 🔴 **`NEXT_PUBLIC_` is inlined at BUILD time.** A server component needing a
   deploy-time value must use a plain name.
3. 🔴 **A DEFINER FUNCTION RUNS AS ITS OWNER, and FORCE RLS binds the owner.** A
   background job with no user context needs its own clause on **SELECT**, not
   just INSERT/UPDATE. This one made the drain read zero rows.
4. 🔴 **A ROW LOCK CANNOT PROTECT WORK IN ANOTHER PROCESS.** `FOR UPDATE SKIP
   LOCKED` through `pool.query` is autocommit — the lock dies before the send.
5. 🔴 **A whole-set env PUT DELETES what you set in the dashboard.**
6. 🔴 **SEPARATE HOSTS = SEPARATE SESSIONS.** The apex and customer-web do not
   share a cookie.
7. 🔴 **SCAN BEFORE INSTRUCTING.** I nearly had three live mailboxes deleted.
8. 🔴 **GREP BEFORE BUILDING.** I nearly shipped a duplicate Notifications nav
   entry; one already existed with a screen behind it.
9. **Render can fail a deploy for no fault of the build** — use
   `Diagnose Render deploy` to tell that apart from a real failure.
10. **`Release` deploys workshop-web ONLY**; customer-web needs its own dispatch.
11. A queued `apply-migrations` checks out master at RUN time.
12. **Local is superuser; Render is not.** Rehearse anything RLS-shaped.
