# Implementation rules

## Prohibited (`05.txt` §2)

- Building all pages at once
- Disconnected mock pages
- Business rules in the frontend
- AI agents accessing the database directly
- Bypassing role/permission controls
- **Introducing paid tools or mandatory paid services**
- Changing approved navigation structures without review

## Required per module (`05.txt` §2)

Frontend pages · backend services · database tables and migrations · permissions · validation · audit
logging · tests · loading states · empty states · error states · responsive layouts.

## Per task (`05.txt` §6)

Read the architecture and navigation requirements -> identify affected frontend/backend/database/permissions
-> short checklist -> migrations first -> backend rules -> API endpoints -> frontend using shared components
-> loading/empty/error/permission states -> unit + workflow tests -> lint + typecheck -> Playwright -> update
docs -> commit.

## Schema rules (Solar lessons)

- **No `VARCHAR(n)` on free-text or generated columns** — use `TEXT`.
- **No `CREATE TABLE IF NOT EXISTS` in boot code** — migrations only, forward- and rollback-tested.
- Approvals, payments, warranty decisions and audit events are **append-only**.
- `RETURNING id`, never `lastrowid`.
- RLS seeding needs `set_config('app.current_role','admin',true)`.
