# Permission matrix

Format: role -> workspace -> module -> action -> permission code -> scope -> approval requirement.

Populated per module as each phase lands. The structure and the rules below are fixed now.

## Scopes

| Scope | Meaning |
|---|---|
| `own` | Only records the user created or owns |
| `assigned` | Records the user is assigned to (e.g. their job cards) |
| `branch` | All records in the active branch |
| `organization` | All records in the active organization |
| `tenant` | All records in the tenant |
| `platform` | Cross-tenant — platform administration only, always audited |

## Approval requirements

Map to the MCP human-in-the-loop classes (`0.txt` §18), so a permission behaves identically whether
exercised by a human or by an agent.

| Class | Requirement |
|---|---|
| A | None — read-only, tenant-filtered, audited |
| B | None to execute, but output remains a draft |
| C | Explicit authenticated approval by a role holding the authority |
| D | Privileged human approval, dual control where defined, MFA, reason capture |

## High-risk separations (`0.txt` §17)

These must never be bundled into one permission:

- `proposal:approve` is **not** included in `proposal:draft`
- `payment:refund` is **not** included in `payment:read`
- `product:verify` is **not** included in `product:submit`
- `user:role:assign` is **not** included in `user:read`

## Evaluation

Every API operation evaluates: who is requesting · which organization · which active role · which resource ·
whether the user is assigned to the job · whether approval authority is sufficient · whether the record is
restricted · whether the operation is allowed at the current workflow stage (`1.txt` §12).
